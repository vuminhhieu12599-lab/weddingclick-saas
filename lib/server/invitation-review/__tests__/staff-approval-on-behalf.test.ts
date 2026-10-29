import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  APPROVAL_CHANNELS,
  REVIEW_FEEDBACK_ACTOR_TYPES,
  STAFF_APPROVAL_NOTE_MAX_LENGTH,
  requiredInvitationVariantsForPackage,
  SERVICE_PACKAGE_CODES,
} from "../../../domain";
import { apiErrorStatus } from "../../errors/api-error";
import type { StaffAuthGateway, StaffContext } from "../../auth/staff-context";
import {
  confirmReviewApproval,
  parseConfirmReviewApprovalCommand,
  type ConfirmReviewApprovalDependencies,
} from "../confirm-review-approval";
import type { StaffConfirmedApproval } from "../invitation-review-types";
import { STAFF_APPROVAL_RPC_ERROR_CODES } from "../staff-approval-rpc-error-codes";

/**
 * TE-06 — staff approval on behalf of the customer (docs/DECISIONS.md
 * "TE-01 T12", corrected by "TE-03A" item 5). Covers the command contract,
 * the use case, the HTTP boundary, and the static security contract of
 * migration 0053: additive evidence columns with both legal row shapes, a
 * staff-only self-authorizing RPC whose actor is `auth.uid()`, the note in
 * `staff_note` and never in `message` or activity metadata, and no
 * publication or payment write anywhere.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const M0016 = "20260911041136_0016_review_feedback.sql";
const M0037 = "20260911041157_0037_customer_review_feedback.sql";
const M0052 = "20260911041212_0052_seed_se_duyen_v1_catalog.sql";
const M0053 = "20260911041213_0053_staff_approval_on_behalf.sql";

const migration = readFileSync(join(MIGRATIONS, M0053), "utf8");
/** Executable SQL only: `--` comments and the trailing COMMENT ON documentation are not behaviour. */
const sql = migration.replace(/--.*$/gm, "");
const executable = sql.replace(/COMMENT ON (FUNCTION|COLUMN|CONSTRAINT)[\s\S]*?';\s*\n/g, "\n");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "f0000000-0000-4000-8000-0000000000a1";

function command(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    invitationVersionId: VERSION_ID,
    expectedCurrentReviewVersionId: VERSION_ID,
    channel: "ZALO",
    note: " đã gọi xác nhận ",
    ...overrides,
  };
}

describe("A. the browser command carries nothing authoritative", () => {
  it("accepts exactly the four approved keys and trims the note", () => {
    expect(parseConfirmReviewApprovalCommand(command())).toStrictEqual({
      invitationVersionId: VERSION_ID,
      expectedCurrentReviewVersionId: VERSION_ID,
      channel: "ZALO",
      note: "đã gọi xác nhận",
    });
  });

  it("rejects any other key — the actor, the project, the variant and the feedback type are never sent", () => {
    for (const extra of [
      "actorType",
      "staffProfileId",
      "projectId",
      "variant",
      "feedbackType",
      "message",
      "status",
      "createdAt",
    ]) {
      expect(() => parseConfirmReviewApprovalCommand(command({ [extra]: "x" }))).toThrow(/Unexpected field/);
    }
  });

  it.each([
    ["a non-object body", "nope"],
    ["an array body", []],
    ["a missing version", command({ invitationVersionId: undefined })],
    ["a non-uuid version", command({ invitationVersionId: "not-a-uuid" })],
    ["a missing CAS token", command({ expectedCurrentReviewVersionId: undefined })],
    ["a null CAS token", command({ expectedCurrentReviewVersionId: null })],
    ["an unknown channel", command({ channel: "SMS" })],
    ["a lowercase channel", command({ channel: "zalo" })],
    ["a missing channel", command({ channel: undefined })],
    ["a non-string note", command({ note: 7 })],
  ])("rejects %s", (_label, raw) => {
    expect(() => parseConfirmReviewApprovalCommand(raw)).toThrow();
  });

  it("treats an absent, null or blank note as no note, and caps it at 2000 characters", () => {
    for (const note of [undefined, null, "", "   ", "\n\t"]) {
      expect(parseConfirmReviewApprovalCommand(command({ note })).note).toBeNull();
    }
    const longest = "a".repeat(STAFF_APPROVAL_NOTE_MAX_LENGTH);
    expect(parseConfirmReviewApprovalCommand(command({ note: longest })).note).toBe(longest);
    expect(() => parseConfirmReviewApprovalCommand(command({ note: `${longest}a` }))).toThrow(/2000 characters/);
  });

  it("accepts every approved channel and nothing else", () => {
    for (const channel of APPROVAL_CHANNELS) {
      expect(parseConfirmReviewApprovalCommand(command({ channel })).channel).toBe(channel);
    }
  });
});

describe("B. the use case only forwards, and re-checks what came back", () => {
  const approval: StaffConfirmedApproval = {
    id: "a1",
    projectId: PROJECT_ID,
    invitationVersionId: VERSION_ID,
    variant: "GROOM",
    approvalChannel: "ZALO",
    createdAt: "2026-10-23T10:00:00.000Z",
    projectStatus: "APPROVED",
  };
  const staff = { supabase: "staff-client" } as unknown as StaffContext<string>;

  function deps(result: StaffConfirmedApproval, spy = vi.fn()): ConfirmReviewApprovalDependencies<string> {
    return {
      reviews: {
        confirmReviewApproval: async (client: string, params: unknown) => {
          spy(client, params);
          return result;
        },
      },
    } as unknown as ConfirmReviewApprovalDependencies<string>;
  }

  it("passes the staff-scoped client and exactly the parsed command plus the path Project id", async () => {
    const spy = vi.fn();
    await expect(confirmReviewApproval(PROJECT_ID, command(), staff, deps(approval, spy))).resolves.toStrictEqual(approval);
    expect(spy).toHaveBeenCalledWith("staff-client", {
      projectId: PROJECT_ID,
      invitationVersionId: VERSION_ID,
      expectedCurrentReviewVersionId: VERSION_ID,
      channel: "ZALO",
      note: "đã gọi xác nhận",
    });
  });

  it("rejects a malformed Project id before any call", async () => {
    const spy = vi.fn();
    await expect(confirmReviewApproval("nope", command(), staff, deps(approval, spy))).rejects.toThrow(/valid UUID/);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    ["another Project", { ...approval, projectId: "22222222-2222-4222-8222-222222222222" }],
    ["another version", { ...approval, invitationVersionId: "f0000000-0000-4000-8000-0000000000b2" }],
    ["another channel", { ...approval, approvalChannel: "PHONE" as const }],
  ])("throws when the written row is for %s", async (_label, result) => {
    await expect(confirmReviewApproval(PROJECT_ID, command(), staff, deps(result))).rejects.toThrow(/does not match the request/);
  });
});

describe("C. HTTP boundary: staff auth before the body, no-store always", () => {
  function authGateway(profile: { role: string; displayName: string } | null): StaffAuthGateway<string> {
    return {
      createClient: (token: string) => `client-for-${token}`,
      getAuthenticatedUserId: async () => "staff-1",
      getActiveStaffProfile: async () => profile,
    };
  }

  it.each([
    ["no bearer", null, authGateway({ role: "STAFF", displayName: "S" }), 401],
    ["non-staff", "Bearer t", authGateway(null), 403],
  ])("%s → %d before the body is read or anything is written", async (_label, header, gateway, status) => {
    const { handleConfirmReviewApprovalRequest } = await import("../../routes/invitation-review");
    const confirm = vi.fn();
    const readBody = vi.fn(async () => command());
    const result = await handleConfirmReviewApprovalRequest(header, PROJECT_ID, readBody, gateway, {
      reviews: { confirmReviewApproval: confirm },
    } as unknown as ConfirmReviewApprovalDependencies<string>);
    expect(result.status).toBe(status);
    expect(readBody).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("201 on a written approval, 400 on malformed JSON, 409 on a stale version", async () => {
    const { handleConfirmReviewApprovalRequest } = await import("../../routes/invitation-review");
    const { ApiError } = await import("../../errors/api-error");
    const gateway = authGateway({ role: "STAFF", displayName: "S" });
    const approval: StaffConfirmedApproval = {
      id: "a1",
      projectId: PROJECT_ID,
      invitationVersionId: VERSION_ID,
      variant: "COMMON",
      approvalChannel: "PHONE",
      createdAt: "2026-10-23T10:00:00.000Z",
      projectStatus: "APPROVED",
    };
    const ok = await handleConfirmReviewApprovalRequest(
      "Bearer t",
      PROJECT_ID,
      async () => command({ channel: "PHONE" }),
      gateway,
      { reviews: { confirmReviewApproval: async () => approval } } as unknown as ConfirmReviewApprovalDependencies<string>,
    );
    expect(ok).toMatchObject({ status: 201, body: { data: approval } });
    expect(ok.headers?.["Cache-Control"]).toBe("no-store");

    const malformed = await handleConfirmReviewApprovalRequest(
      "Bearer t",
      PROJECT_ID,
      async () => {
        throw new SyntaxError("bad json");
      },
      gateway,
      { reviews: { confirmReviewApproval: vi.fn() } } as unknown as ConfirmReviewApprovalDependencies<string>,
    );
    expect(malformed.status).toBe(400);

    const stale = await handleConfirmReviewApprovalRequest("Bearer t", PROJECT_ID, async () => command(), gateway, {
      reviews: {
        confirmReviewApproval: async () => {
          throw new ApiError("CONFLICT", STAFF_APPROVAL_RPC_ERROR_CODES.SA010!.message);
        },
      },
    } as unknown as ConfirmReviewApprovalDependencies<string>);
    expect(stale.status).toBe(409);
    expect(stale.body).toStrictEqual({ error: "Current review version has changed; reload and try again" });
  });
});

describe("D. the error contract mirrors exactly the SQLSTATEs 0053 raises", () => {
  it("every key is SAxxx with a known kind and a fixed non-empty message", () => {
    for (const [code, entry] of Object.entries(STAFF_APPROVAL_RPC_ERROR_CODES)) {
      expect(code).toMatch(/^SA\d{3}$/);
      expect(() => apiErrorStatus(entry.kind)).not.toThrow();
      expect([400, 403, 404, 409, 422]).toContain(apiErrorStatus(entry.kind));
      expect(entry.message.length).toBeGreaterThan(0);
    }
  });

  it("the mapped codes and the raised codes are the same set, with the same messages", () => {
    const raised = [...executable.matchAll(/RAISE EXCEPTION '([^']*)'\s*\n\s*USING ERRCODE = '(SA\d{3})'/g)];
    expect(raised.length).toBeGreaterThan(0);
    expect([...new Set(raised.map((m) => m[2]))].sort()).toStrictEqual(Object.keys(STAFF_APPROVAL_RPC_ERROR_CODES).sort());
    for (const [, message, code] of raised) {
      expect(STAFF_APPROVAL_RPC_ERROR_CODES[code!]!.message).toBe(message);
    }
  });
});

describe("E. migration 0053 — placement and the additive evidence columns", () => {
  it("is the one migration after 0052, authored only, and reuses no retired number", () => {
    const names = readdirSync(MIGRATIONS).sort();
    // SD-V2-CATALOG-01's 0054 is now the head; 0053 still follows 0052 directly.
    expect(names.at(-1)).toBe("20260911041214_0054_seed_se_duyen_v2_catalog.sql");
    expect(names.at(-2)).toBe(M0053);
    expect(names.at(-3)).toBe(M0052);
    expect(names.filter((name) => /_0045_/.test(name))).toStrictEqual([]);
    expect(names.filter((name) => /_0053_/.test(name))).toStrictEqual([M0053]);
    expect(migration).toContain("AUTHORING ONLY — not applied.");
  });

  it("verifies the T12 pre-condition before adding the row CHECK that depends on it", () => {
    const precondition = executable.indexOf("WHERE access_link_id IS NULL");
    const rowCheck = executable.indexOf("review_feedback_actor_evidence_check");
    expect(precondition).toBeGreaterThan(0);
    expect(rowCheck).toBeGreaterThan(precondition);
    expect(executable).toMatch(/RAISE EXCEPTION 'Migration 0053 pre-condition failed/);
  });

  it("adds exactly the four T12/TE-03A columns, with their CHECKs and the FK that keeps the actor", () => {
    expect(executable).toContain("ADD COLUMN actor_type TEXT NOT NULL DEFAULT 'CUSTOMER'");
    expect(executable).toContain("CHECK (actor_type IN ('CUSTOMER', 'STAFF'))");
    expect(executable).toContain("REFERENCES public.profiles (id) ON DELETE RESTRICT");
    expect(executable).toContain("CHECK (approval_channel IN ('ZALO', 'PHONE', 'IN_PERSON', 'OTHER'))");
    expect(executable).toContain("CHECK (staff_note IS NULL OR char_length(staff_note) <= 2000)");
    expect(executable.match(/ADD COLUMN/g)).toHaveLength(4);
    // Additive only: no column is dropped, renamed, retyped or made NOT NULL.
    expect(executable).not.toMatch(/DROP (COLUMN|TABLE|CONSTRAINT|FUNCTION|POLICY|INDEX)|RENAME|ALTER COLUMN|DELETE FROM|TRUNCATE/i);
  });

  it("the row CHECK allows exactly the two legal shapes and nothing in between", () => {
    const check = executable.slice(
      executable.indexOf("ADD CONSTRAINT review_feedback_actor_evidence_check"),
      executable.indexOf("COMMENT ON COLUMN"),
    );
    for (const clause of [
      "actor_type = 'CUSTOMER'",
      "access_link_id IS NOT NULL",
      "staff_profile_id IS NULL",
      "approval_channel IS NULL",
      "staff_note IS NULL",
    ]) {
      expect(check).toContain(clause);
    }
    for (const clause of [
      "actor_type = 'STAFF'",
      "feedback_type = 'APPROVAL'",
      "access_link_id IS NULL",
      "staff_profile_id IS NOT NULL",
      "approval_channel IS NOT NULL",
      "message IS NULL",
    ]) {
      expect(check).toContain(clause);
    }
  });

  it("the TypeScript mirrors equal the SQL CHECK vocabularies", () => {
    expect([...REVIEW_FEEDBACK_ACTOR_TYPES]).toStrictEqual(["CUSTOMER", "STAFF"]);
    expect([...APPROVAL_CHANNELS]).toStrictEqual(["ZALO", "PHONE", "IN_PERSON", "OTHER"]);
    for (const actor of REVIEW_FEEDBACK_ACTOR_TYPES) {
      expect(executable).toContain(`'${actor}'`);
    }
    for (const channel of APPROVAL_CHANNELS) {
      expect(executable).toContain(`'${channel}'`);
    }
    expect(executable).toContain(`char_length(staff_note) <= ${STAFF_APPROVAL_NOTE_MAX_LENGTH}`);
  });
});

describe("F. migration 0053 — the RPC is staff-only and cannot be told who approved", () => {
  it("is SECURITY DEFINER with an empty search_path and self-authorizes with is_staff()", () => {
    const definers = executable.split(/CREATE (?:OR REPLACE )?FUNCTION/).slice(1);
    expect(definers).toHaveLength(1);
    expect(definers[0]!.split("AS $$")[0]).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = ''/);
    expect(executable).toMatch(/IF auth\.uid\(\) IS NULL THEN[\s\S]*?SA001/);
    expect(executable).toMatch(/IF NOT FOUND OR public\.is_staff\(\) IS NOT TRUE THEN[\s\S]*?SA001/);
  });

  it("grants EXECUTE to authenticated only — never anon, service_role or PUBLIC", () => {
    const grants = [...sql.matchAll(/GRANT\s+([^;]+);/g)].map((m) => m[1]!.replace(/\s+/g, " "));
    expect(grants).toStrictEqual([
      "EXECUTE ON FUNCTION public.staff_confirm_review_approval(uuid, uuid, uuid, text, text) TO authenticated",
    ]);
    for (const role of ["PUBLIC", "anon", "service_role"]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.staff_confirm_review_approval(uuid, uuid, uuid, text, text) FROM ${role};`);
    }
    // No new table privilege or RLS policy: the table stays staff-read-only and append-only.
    expect(executable).not.toMatch(/GRANT [^;]*ON TABLE|CREATE POLICY|ALTER POLICY|ENABLE ROW LEVEL SECURITY/i);
  });

  it("the actor is auth.uid(), never a parameter", () => {
    const declaration = executable.indexOf("CREATE FUNCTION public.staff_confirm_review_approval");
    const signature = executable.slice(executable.indexOf("(", declaration), executable.indexOf("RETURNS TABLE"));
    expect(signature).toContain("p_project_id uuid");
    expect(signature).toContain("p_invitation_version_id uuid");
    expect(signature).toContain("p_expected_current_review_version_id uuid");
    expect(signature).toContain("p_channel text");
    expect(signature).toContain("p_note text");
    // No parameter can name the approver: no staff/actor/profile parameter exists.
    expect(signature).not.toMatch(/staff|actor|profile|auth\.uid/i);
    expect(signature.match(/^\s*p_\w+ /gm)).toHaveLength(5);
    const insert = executable.slice(executable.indexOf("INSERT INTO public.review_feedback"));
    expect(insert).toMatch(/'STAFF', auth\.uid\(\), p_channel, v_note/);
  });

  it("binds to the CURRENT review of a REQUIRED variant under lock, with CAS, before any write", () => {
    const order = [
      "SA001",
      "SA005",
      "FROM public.projects",
      "FOR NO KEY UPDATE",
      "SA007",
      "version_type = 'REVIEW'",
      "FROM public.project_invitations",
      "SA009",
      "SA010",
      "SA011",
      "INSERT INTO public.review_feedback",
    ];
    const positions = order.map((needle) => executable.indexOf(needle));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toStrictEqual(positions);
    // The invitation row itself is locked before its pointer is compared.
    expect(executable).toMatch(/FROM public\.project_invitations AS pi[\s\S]*?FOR UPDATE;/);
    expect(executable).toMatch(/v_current_id IS DISTINCT FROM p_invitation_version_id/);
    expect(executable).toMatch(/p_expected_current_review_version_id IS DISTINCT FROM v_current_id/);
    // First decision final: neither a second approval nor an approval after a revision request.
    expect(executable).toMatch(/feedback_type IN \('APPROVAL', 'REVISION_REQUEST'\)[\s\S]*?SA011/);
    expect(executable).toContain("IF v_status NOT IN ('CUSTOMER_REVIEW', 'REVISION_REQUIRED', 'APPROVED') THEN");
  });

  it("the SQL required-variant policy equals the TypeScript policy", () => {
    for (const code of SERVICE_PACKAGE_CODES) {
      const variants = requiredInvitationVariantsForPackage(code);
      expect(variants).not.toBeNull();
      expect(executable).toContain(`WHEN '${code}' THEN ARRAY[${variants!.map((v) => `'${v}'`).join(", ")}]::text[]`);
    }
    expect(executable).toMatch(/ELSE NULL/);
  });
});

describe("G. migration 0053 — what it must never touch", () => {
  it("writes one APPROVAL row with message NULL: the note lives in staff_note only", () => {
    const insert = executable.slice(
      executable.indexOf("INSERT INTO public.review_feedback"),
      executable.indexOf("PERFORM public.log_activity"),
    );
    expect(insert).toContain("actor_type, staff_profile_id, approval_channel, staff_note");
    expect(insert).toContain("p_project_id, NULL, p_invitation_version_id, 'APPROVAL', NULL,");
    expect(executable.match(/INSERT INTO/g)).toHaveLength(1);
    expect(executable).not.toMatch(/message\s*=\s*|message, actor_type/);
  });

  it("audits with the existing action type, a STAFF actor and the channel — never the note", () => {
    const activity = executable.slice(executable.indexOf("PERFORM public.log_activity"));
    expect(activity).toContain("'CUSTOMER_APPROVED'");
    expect(activity).toContain("'PROJECT_STATUS_CHANGED'");
    expect(activity).toMatch(/'channel', p_channel/);
    expect(activity).not.toMatch(/p_note|v_note|staff_note/);
    // No new activity action type is introduced by this migration.
    expect(executable).not.toMatch(/STAFF_APPROVED|APPROVED_ON_BEHALF/);
  });

  it("never writes payment, publication or any invitation_versions row, and sets status only from the recompute", () => {
    expect(executable).not.toMatch(/payment_status|published_version_id|published_at|'READY_TO_PUBLISH'|'PUBLISHED'/);
    expect(executable).not.toMatch(/UPDATE public\.invitation_versions|INSERT INTO public\.invitation_versions|UPDATE public\.project_invitations/);
    expect([...executable.matchAll(/status\s*=\s*'([A-Z_]+)'/g)]).toStrictEqual([]);
    expect([...executable.matchAll(/^\s*status = v_outcome$/gm)]).toHaveLength(1);
    expect(executable.match(/review_outcome_for_project\(p_project_id\)/g)).toHaveLength(1);
    // No template, catalog, guest, RSVP or media surface is involved.
    expect(executable).not.toMatch(/templates|template_versions|project_media|guests|rsvps|project_design/);
  });

  it("leaves the customer path byte-identical: 0016 and 0037 are untouched", () => {
    for (const name of [M0016, M0037]) {
      expect(execFileSync("git", ["status", "--porcelain", "--", `supabase/migrations/${name}`], { cwd: ROOT }).toString()).toBe("");
    }
    expect(executable).not.toMatch(/submit_review_feedback|get_customer_review|CREATE OR REPLACE FUNCTION/);
  });

  it("the customer REVIEW read still selects only the four public feedback keys, so the evidence cannot leak", () => {
    const customerRead = readFileSync(join(MIGRATIONS, M0037), "utf8");
    const start = customerRead.indexOf("'feedback', (");
    const feedbackObject = customerRead.slice(start, customerRead.indexOf("FROM public.review_feedback AS rf", start));
    expect([...feedbackObject.matchAll(/'(\w+)', rf\.(\w+)/g)].map((m) => m[2])).toStrictEqual([
      "id",
      "feedback_type",
      "message",
      "created_at",
    ]);
    expect(feedbackObject).not.toMatch(/actor_type|approval_channel|staff_note|staff_profile_id|to_jsonb/);
  });
});

describe("H. the server modules stay inside the staff path", () => {
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const files = [
    "lib/server/invitation-review/confirm-review-approval.ts",
    "lib/server/invitation-review/staff-approval-rpc-error-codes.ts",
    "lib/server/supabase/invitation-review-repository.ts",
    "lib/server/routes/invitation-review.ts",
    "app/api/v2/internal/projects/[id]/review/approvals/route.ts",
  ];

  it("no service_role, no direct table write, no RSVP or guest-token path", () => {
    const code = files.map((file) => strip(readFileSync(join(ROOT, file), "utf8"))).join("\n");
    expect(code).not.toMatch(/service[_-]?role|SERVICE_ROLE/i);
    expect(code).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(code).not.toMatch(/rsvps|guest_token|publish_invitation/);
  });

  it("the approval modules themselves never name publication or payment state", () => {
    // The repository is excluded on purpose: its invitation SELECT has read
    // `published_version_id` since Task 030 and is unchanged by TE-06.
    const scoped = files.filter((file) => !file.endsWith("invitation-review-repository.ts"));
    const code = scoped.map((file) => strip(readFileSync(join(ROOT, file), "utf8"))).join("\n");
    expect(code).not.toMatch(/published_version_id|payment_status|published_at/);
  });

  it("the repository reaches the database only through the two audited review RPCs", () => {
    const code = strip(readFileSync(join(ROOT, "lib/server/supabase/invitation-review-repository.ts"), "utf8"));
    expect([...code.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)].map((m) => m[1]).sort()).toStrictEqual([
      "create_review_version",
      "staff_confirm_review_approval",
    ]);
  });

  it("the route is reachable only by POST through the staff handler", () => {
    const route = readFileSync(join(ROOT, "app/api/v2/internal/projects/[id]/review/approvals/route.ts"), "utf8");
    expect([...route.matchAll(/export async function (\w+)/g)].map((m) => m[1])).toStrictEqual(["POST"]);
    expect(route).toContain("handleConfirmReviewApprovalRequest");
    expect(route).toContain("supabaseStaffAuthGateway");
  });
});
