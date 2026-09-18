import type { SupabaseClient } from "@supabase/supabase-js";

import { PAYMENT_STATUSES, PROJECT_STATUSES } from "../../domain";
import type { PaymentStatus, ProjectStatus } from "../../domain";
import { ApiError } from "../errors/api-error";
import { PROJECT_LIFECYCLE_RPC_ERROR_CODES } from "../project-lifecycle/project-lifecycle-rpc-error-codes";
import type { ProjectLifecycleGateway } from "../project-lifecycle/project-lifecycle-gateway";
import type {
  MarkPaidResult,
  ReassignStaffInput,
  ReassignStaffResult,
  TransitionStatusInput,
  TransitionStatusResult,
} from "../project-lifecycle/project-lifecycle-types";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";

/**
 * Production ProjectLifecycleGateway (Task 025 Phase 2): the only place in
 * this feature that issues real @supabase/supabase-js calls. Always invoked
 * with a staff-scoped client (Task 004's createStaffSupabaseClient) — this
 * module never uses the privileged (elevated-access) Supabase credential.
 *
 * Calls exactly the three trusted RPCs (transition_project_status /
 * mark_project_paid / reassign_project_staff, migration 0024) — never a
 * plain PostgREST table write on status/payment_status/paid_at/
 * assigned_staff_id/completed_at/archived_at, and never a pre-read query
 * before the RPC. Each RPC's own row lock (`FOR UPDATE`) is the sole
 * authority for the transition graph, the payment precondition, and the
 * active-assignee invariant against the row's actual current state.
 */
interface TransitionStatusRpcRow {
  id: string;
  status: ProjectStatus;
  completed_at: string | null;
  archived_at: string | null;
  updated_at: string;
}

interface MarkPaidRpcRow {
  id: string;
  status: ProjectStatus;
  payment_status: PaymentStatus;
  paid_at: string;
  updated_at: string;
}

interface ReassignStaffRpcRow {
  id: string;
  assigned_staff_id: string | null;
  updated_at: string;
}

function mapRpcError(error: { code: string; message: string }, fallbackMessage: string): never {
  const known = PROJECT_LIFECYCLE_RPC_ERROR_CODES[error.code];
  if (known) {
    throw new ApiError(known.kind, known.message);
  }
  throw new Error(fallbackMessage);
}

/**
 * Result-shape hardening (Task 025 Phase 2). Every RPC is declared to
 * `RETURNS TABLE` / `RETURNING p.*` for exactly one row (migration 0024
 * locks the target row `FOR UPDATE` and either raises a PLxxx exception or
 * returns one row) — a Postgres client library returning null, an empty
 * array, more than one row, or a row missing/mistyping a field is always an
 * unexpected success shape, never a legitimate business outcome. Each check
 * below fails the same static, generic way (never forwarding the raw
 * payload) rather than trusting a type cast, per docs/SECURITY.md.
 */
function extractSingleRow(data: unknown, fallbackMessage: string): unknown {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(fallbackMessage);
  }
  return data[0];
}

function isUuidString(value: unknown): value is string {
  return typeof value === "string" && isValidUuid(value);
}

function isNullableUuidString(value: unknown): value is string | null {
  return value === null || isUuidString(value);
}

function isTimestamptzString(value: unknown): value is string {
  return typeof value === "string" && isValidTimestamptz(value);
}

function isNullableTimestamptzString(value: unknown): value is string | null {
  return value === null || isTimestamptzString(value);
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

function isTransitionStatusRpcRow(row: unknown): row is TransitionStatusRpcRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }
  const candidate = row as Record<string, unknown>;
  return (
    isUuidString(candidate.id) &&
    isProjectStatus(candidate.status) &&
    isNullableTimestamptzString(candidate.completed_at) &&
    isNullableTimestamptzString(candidate.archived_at) &&
    isTimestamptzString(candidate.updated_at)
  );
}

function isMarkPaidRpcRow(row: unknown): row is MarkPaidRpcRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }
  const candidate = row as Record<string, unknown>;
  return (
    isUuidString(candidate.id) &&
    isProjectStatus(candidate.status) &&
    isPaymentStatus(candidate.payment_status) &&
    isTimestamptzString(candidate.paid_at) &&
    isTimestamptzString(candidate.updated_at)
  );
}

function isReassignStaffRpcRow(row: unknown): row is ReassignStaffRpcRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }
  const candidate = row as Record<string, unknown>;
  return (
    isUuidString(candidate.id) &&
    isNullableUuidString(candidate.assigned_staff_id) &&
    isTimestamptzString(candidate.updated_at)
  );
}

export const supabaseProjectLifecycleGateway: ProjectLifecycleGateway<SupabaseClient> = {
  async transitionStatus(
    client,
    projectId: string,
    input: TransitionStatusInput,
  ): Promise<TransitionStatusResult> {
    const { data, error } = await client.rpc("transition_project_status", {
      p_project_id: projectId,
      p_target_status: input.targetStatus,
      p_reason: input.reason,
    });

    if (error) {
      mapRpcError(error, "Failed to transition project status");
    }

    const row = extractSingleRow(data, "Failed to transition project status");

    if (!isTransitionStatusRpcRow(row)) {
      throw new Error("Failed to transition project status");
    }

    return {
      id: row.id,
      status: row.status,
      completedAt: row.completed_at,
      archivedAt: row.archived_at,
      updatedAt: row.updated_at,
    };
  },

  async markPaid(client, projectId: string): Promise<MarkPaidResult> {
    const { data, error } = await client.rpc("mark_project_paid", {
      p_project_id: projectId,
    });

    if (error) {
      mapRpcError(error, "Failed to mark project paid");
    }

    const row = extractSingleRow(data, "Failed to mark project paid");

    if (!isMarkPaidRpcRow(row)) {
      throw new Error("Failed to mark project paid");
    }

    return {
      id: row.id,
      status: row.status,
      paymentStatus: row.payment_status,
      paidAt: row.paid_at,
      updatedAt: row.updated_at,
    };
  },

  async reassignStaff(
    client,
    projectId: string,
    input: ReassignStaffInput,
  ): Promise<ReassignStaffResult> {
    const { data, error } = await client.rpc("reassign_project_staff", {
      p_project_id: projectId,
      p_assigned_staff_id: input.assignedStaffId,
    });

    if (error) {
      mapRpcError(error, "Failed to reassign project staff");
    }

    const row = extractSingleRow(data, "Failed to reassign project staff");

    if (!isReassignStaffRpcRow(row)) {
      throw new Error("Failed to reassign project staff");
    }

    return {
      id: row.id,
      assignedStaffId: row.assigned_staff_id,
      updatedAt: row.updated_at,
    };
  },
};
