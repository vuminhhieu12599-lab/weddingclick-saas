import type { SupabaseClient } from "@supabase/supabase-js";

import { INTAKE_SUBMISSION_STATUSES, type IntakeSubmissionStatus } from "../../domain";
import { ApiError } from "../errors/api-error";
import type { IntakeStaffGateway } from "../intake/intake-staff-gateway";
import { INTAKE_RPC_ERROR_CODES } from "../intake/intake-rpc-error-codes";
import type {
  ApplyIntakeSubmissionResult,
  IntakeSubmissionRecord,
  RejectIntakeSubmissionResult,
} from "../intake/intake-types";
import { isValidUuid } from "../validation/uuid";
import { isValidTimestamptz } from "../validation/timestamptz";
import { SAVE_WEDDING_DETAILS_RPC_ERROR_CODES } from "../wedding-details/wedding-details-rpc-error-codes";
import type { SaveWeddingDetailsInput } from "../wedding-details/wedding-details-types";

/**
 * Production IntakeStaffGateway (Task 027 Phase 2): the only place in this
 * feature that issues real @supabase/supabase-js calls for staff reads/
 * apply/reject. Always invoked with a staff-scoped client (Task 004's
 * createStaffSupabaseClient) — never `service_role` (see
 * lib/server/supabase/intake-submit-repository.ts for the separate,
 * service-role-backed PUBLIC submit path; this module never imports it or
 * anything from lib/server/supabase/service-role-client.ts).
 *
 * List/get are plain DIRECT RLS SELECTs. Apply/reject each call exactly one
 * of the two migration-0026 staff TRUSTED BUSINESS ACTION RPCs — never a
 * plain `.from("intake_submissions").update(...)` (which migration 0026
 * revokes outright for `authenticated`, so a direct UPDATE would fail at the
 * database layer regardless).
 */
const INTAKE_SUBMISSION_COLUMNS =
  "id, project_id, access_link_id, payload, status, submitted_at, reviewed_by, reviewed_at, staff_note";

interface IntakeSubmissionRow {
  id: string;
  project_id: string;
  access_link_id: string | null;
  payload: unknown;
  status: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  staff_note: string | null;
}

/**
 * Exactly the 20 Task-022 Wedding Details fields the stored `payload` JSONB
 * snapshot always carries (migration 0026's PAYLOAD SCHEMA — every row can
 * only ever be created by `submit_intake_submission`, which always writes
 * this closed key set). Mirrors
 * lib/server/wedding-details/wedding-details-types.ts's
 * `SaveWeddingDetailsInput` one-for-one.
 */
const WEDDING_DETAILS_TEXT_FIELDS = [
  "groomName",
  "brideName",
  "groomFather",
  "groomMother",
  "brideFather",
  "brideMother",
  "groomFamilyAddress",
  "brideFamilyAddress",
  "invitationMessage",
  "loveStory",
  "lunarDateDisplay",
  "additionalNote",
  "groomBankName",
  "groomBankAccountName",
  "groomBankAccountNumber",
  "brideBankName",
  "brideBankAccountName",
  "brideBankAccountNumber",
] as const;

const WEDDING_DETAILS_UUID_FIELDS = ["groomBankQrMediaId", "brideBankQrMediaId"] as const;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableUuidString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && isValidUuid(value));
}

function isIntakeSubmissionStatus(value: unknown): value is IntakeSubmissionStatus {
  return typeof value === "string" && (INTAKE_SUBMISSION_STATUSES as readonly string[]).includes(value);
}

/**
 * Exactly the 20 frozen Task-022 Wedding Details keys the stored `payload`
 * JSONB snapshot must carry — no more, no fewer (Task 027 Phase 2
 * Independent Review Patch 1, Finding C).
 */
const WEDDING_DETAILS_SNAPSHOT_KEYS = new Set<string>([
  ...WEDDING_DETAILS_TEXT_FIELDS,
  ...WEDDING_DETAILS_UUID_FIELDS,
]);

/**
 * Maps the stored `payload` JSONB back to the exact Task-022 field set. Does
 * not silently drop or invent fields, does not mutate the historical
 * payload, and never crashes/leaks raw content on a malformed shape — a
 * shape violation is reported as a plain (non-ApiError) failure, which the
 * route layer maps to a generic INTERNAL 500 without exposing the malformed
 * content (frozen Task 027 Phase 2 contract §9).
 *
 * Finding C: before mapping any field, the payload's own key set must be
 * exactly the closed 20-key set above — no missing key, no extra/unexpected
 * key (order does not matter). A payload with an extra key (e.g. an
 * `unexpected` field) is rejected outright rather than silently accepted
 * with that key dropped from the returned DTO. The thrown error never
 * includes the actual field/value content, including the unexpected key's
 * name, so no historical payload content is ever leaked through it.
 */
function toWeddingDetailsSnapshot(payload: unknown): SaveWeddingDetailsInput {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Malformed intake submission payload");
  }

  const record = payload as Record<string, unknown>;
  const actualKeys = Object.keys(record);

  if (
    actualKeys.length !== WEDDING_DETAILS_SNAPSHOT_KEYS.size ||
    !actualKeys.every((key) => WEDDING_DETAILS_SNAPSHOT_KEYS.has(key))
  ) {
    throw new Error("Malformed intake submission payload");
  }

  const result = {} as SaveWeddingDetailsInput;

  for (const field of WEDDING_DETAILS_TEXT_FIELDS) {
    const value = record[field];
    if (!isNullableString(value)) {
      throw new Error("Malformed intake submission payload");
    }
    result[field] = value;
  }

  for (const field of WEDDING_DETAILS_UUID_FIELDS) {
    const value = record[field];
    if (!isNullableUuidString(value)) {
      throw new Error("Malformed intake submission payload");
    }
    result[field] = value;
  }

  return result;
}

/** Runtime shape hardening for a raw intake_submissions row. */
function isIntakeSubmissionRow(row: unknown): row is IntakeSubmissionRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }
  const candidate = row as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    isValidUuid(candidate.id) &&
    typeof candidate.project_id === "string" &&
    isValidUuid(candidate.project_id) &&
    (candidate.access_link_id === null ||
      (typeof candidate.access_link_id === "string" && isValidUuid(candidate.access_link_id))) &&
    isIntakeSubmissionStatus(candidate.status) &&
    typeof candidate.submitted_at === "string" &&
    isValidTimestamptz(candidate.submitted_at) &&
    (candidate.reviewed_by === null || typeof candidate.reviewed_by === "string") &&
    (candidate.reviewed_at === null ||
      (typeof candidate.reviewed_at === "string" && isValidTimestamptz(candidate.reviewed_at))) &&
    (candidate.staff_note === null || typeof candidate.staff_note === "string")
  );
}

function toIntakeSubmissionRecord(row: IntakeSubmissionRow): IntakeSubmissionRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    accessLinkId: row.access_link_id,
    status: row.status as IntakeSubmissionStatus,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    staffNote: row.staff_note,
    weddingDetails: toWeddingDetailsSnapshot(row.payload),
  };
}

interface ApplyIntakeSubmissionRpcRow {
  id: string;
  project_id: string;
  status: "APPLIED";
  reviewed_by: string;
  reviewed_at: string;
  wedding_details_changed: boolean;
}

interface RejectIntakeSubmissionRpcRow {
  id: string;
  project_id: string;
  status: "REJECTED";
  reviewed_by: string;
  reviewed_at: string;
  staff_note: string | null;
}

/**
 * `status` is checked against the exact literal `"APPLIED"` (Task 027 Phase
 * 2 Independent Review Patch 1, Finding B) — apply's only successful
 * terminal state — not merely "any recognized IntakeSubmissionStatus". An
 * otherwise-valid row reporting e.g. `"PENDING"` or `"REJECTED"` is exactly
 * as untrustworthy as a malformed row.
 */
function isApplyIntakeSubmissionRow(row: unknown): row is ApplyIntakeSubmissionRpcRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }
  const candidate = row as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    isValidUuid(candidate.id) &&
    typeof candidate.project_id === "string" &&
    isValidUuid(candidate.project_id) &&
    candidate.status === "APPLIED" &&
    typeof candidate.reviewed_by === "string" &&
    typeof candidate.reviewed_at === "string" &&
    isValidTimestamptz(candidate.reviewed_at) &&
    typeof candidate.wedding_details_changed === "boolean"
  );
}

/**
 * `status` is checked against the exact literal `"REJECTED"` (Finding B) —
 * reject's only successful terminal state.
 */
function isRejectIntakeSubmissionRow(row: unknown): row is RejectIntakeSubmissionRpcRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }
  const candidate = row as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    isValidUuid(candidate.id) &&
    typeof candidate.project_id === "string" &&
    isValidUuid(candidate.project_id) &&
    candidate.status === "REJECTED" &&
    typeof candidate.reviewed_by === "string" &&
    typeof candidate.reviewed_at === "string" &&
    isValidTimestamptz(candidate.reviewed_at) &&
    (candidate.staff_note === null || typeof candidate.staff_note === "string")
  );
}

/**
 * Result-shape hardening (mirrors access-link-staff-repository.ts's
 * `extractSingleRow`, Finding B): both `apply_intake_submission` and
 * `reject_intake_submission` are declared `RETURNS TABLE` for exactly one
 * row — a result that is not an array, or an array whose length is not
 * exactly 1 (zero or more-than-one), is always an unexpected failure shape,
 * never forwarded to the caller.
 */
function extractSingleRow(data: unknown, fallbackMessage: string): unknown {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(fallbackMessage);
  }
  return data[0];
}

/**
 * Combined error mapping for `apply_intake_submission` (frozen Task 027
 * Phase 2 contract §6.2): checks the Task-027-native ISxxx map first, then
 * the propagated Task-022 WDxxx map (composition can surface WD004
 * unchanged), and only falls back to a generic INTERNAL failure for a
 * SQLSTATE neither map recognizes. Never string-matches the raw Postgres
 * message.
 */
function mapApplyRpcError(error: { code: string; message: string }): never {
  const known = INTAKE_RPC_ERROR_CODES[error.code];
  if (known) {
    throw new ApiError(known.kind, known.message);
  }

  const propagated = SAVE_WEDDING_DETAILS_RPC_ERROR_CODES[error.code];
  if (propagated) {
    throw new ApiError(propagated.kind, propagated.message);
  }

  throw new Error("Failed to apply intake submission");
}

function mapRejectRpcError(error: { code: string; message: string }): never {
  const known = INTAKE_RPC_ERROR_CODES[error.code];
  if (known) {
    throw new ApiError(known.kind, known.message);
  }
  throw new Error("Failed to reject intake submission");
}

export const supabaseIntakeStaffGateway: IntakeStaffGateway<SupabaseClient> = {
  async projectExists(client, projectId: string): Promise<boolean> {
    const { data, error } = await client
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query project");
    }

    return data !== null;
  },

  async listIntakeSubmissionsByProjectId(
    client,
    projectId: string,
  ): Promise<IntakeSubmissionRecord[]> {
    const { data, error } = await client
      .from("intake_submissions")
      .select(INTAKE_SUBMISSION_COLUMNS)
      .eq("project_id", projectId)
      // Newest-first on the actual frozen timestamp column (submitted_at),
      // id as a deterministic tiebreaker (mirrors project-events-repository.ts).
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: true });

    if (error) {
      throw new Error("Failed to query intake submissions");
    }

    const rows = data as unknown as IntakeSubmissionRow[];
    for (const row of rows) {
      if (!isIntakeSubmissionRow(row)) {
        throw new Error("Failed to query intake submissions");
      }
    }

    return rows.map(toIntakeSubmissionRecord);
  },

  async getIntakeSubmissionById(
    client,
    projectId: string,
    submissionId: string,
  ): Promise<IntakeSubmissionRecord | null> {
    const { data, error } = await client
      .from("intake_submissions")
      .select(INTAKE_SUBMISSION_COLUMNS)
      .eq("id", submissionId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query intake submission");
    }

    if (!data) {
      return null;
    }

    if (!isIntakeSubmissionRow(data)) {
      throw new Error("Failed to query intake submission");
    }

    return toIntakeSubmissionRecord(data);
  },

  async applyIntakeSubmission(
    client,
    projectId: string,
    submissionId: string,
  ): Promise<ApplyIntakeSubmissionResult> {
    const { data, error } = await client.rpc("apply_intake_submission", {
      p_project_id: projectId,
      p_submission_id: submissionId,
    });

    if (error) {
      mapApplyRpcError(error);
    }

    const row = extractSingleRow(data, "Failed to apply intake submission");

    if (!isApplyIntakeSubmissionRow(row)) {
      throw new Error("Failed to apply intake submission");
    }

    // Mutation-result identity hardening (mirrors access-link-staff-repository.ts):
    // apply mutates the exact target row in place — the returned id/project
    // must match the request.
    if (row.project_id !== projectId || row.id !== submissionId) {
      throw new Error("Failed to apply intake submission");
    }

    return {
      id: row.id,
      projectId: row.project_id,
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      weddingDetailsChanged: row.wedding_details_changed,
    };
  },

  async rejectIntakeSubmission(
    client,
    projectId: string,
    submissionId: string,
    staffNote: string | null,
  ): Promise<RejectIntakeSubmissionResult> {
    const { data, error } = await client.rpc("reject_intake_submission", {
      p_project_id: projectId,
      p_submission_id: submissionId,
      p_staff_note: staffNote,
    });

    if (error) {
      mapRejectRpcError(error);
    }

    const row = extractSingleRow(data, "Failed to reject intake submission");

    if (!isRejectIntakeSubmissionRow(row)) {
      throw new Error("Failed to reject intake submission");
    }

    if (row.project_id !== projectId || row.id !== submissionId) {
      throw new Error("Failed to reject intake submission");
    }

    return {
      id: row.id,
      projectId: row.project_id,
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      staffNote: row.staff_note,
    };
  },
};
