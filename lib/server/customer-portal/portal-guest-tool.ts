import { requiredInvitationVariantsForPackage, resolveGuestInvitationVariant, normalizeGuestDisplayName, type InvitationVariant } from "../../domain";
import { resolveAccessLink } from "../access-links/resolve-access-link";
import { generateDormantGuestTokenHash } from "../auth/dormant-guest-token";
import { ApiError } from "../errors/api-error";
import { issueGuestLink } from "../guest-links/issue-guest-link";
import type { AccessLinkResolutionRepository } from "../supabase/access-link-resolution-repository";
import { isValidUuid } from "../validation/uuid";
import type {
  CustomerPortalGuestListRow,
  CustomerPortalGuestRow,
  PortalGuestConflictReason,
  PortalGuestGateway,
  PortalGuestLinkGateway,
  PortalGuestRecord,
  PortalGuestRsvpRecord,
  PortalIssuedGuestLink,
  PortalGuestToolMode,
  UpdatePortalGuestParams,
} from "./portal-guest-types";

/**
 * Task 033E-A — Customer Portal Guest Tool use cases (docs/API_CONTRACT.md
 * §25; docs/DECISIONS.md "Task 033E-A"). Order for every mutation:
 *
 *   raw PORTAL token → Task 026 `resolveAccessLink` (PORTAL only) → projectId
 *   → Project-pinned context: published pointer + active PERSONALIZED_GUEST
 *     (re-checked on EVERY request; 403 otherwise) + package mode
 *   → body read/validation (only after authorization)
 *   → ONE conditional write pinned by `project_id = projectId`
 *   → read-only classification only when the write matched no row.
 *
 * The browser never supplies a Project id. A guest id only targets a row of
 * the resolved Project; a foreign or unknown id is 404 (no oracle). No
 * restore or delete exists here. Personalized link ISSUE / REGENERATE (Task
 * 033E-B) delegates to the shared 033B1 `issueGuestLink` with a gateway
 * pinned to the resolved Project.
 */

export interface PortalGuestToolDependencies {
  resolution: AccessLinkResolutionRepository;
  guests: PortalGuestGateway;
  guestLinks: PortalGuestLinkGateway;
  now?: () => Date;
}

/** A customer-facing CONFLICT carrying its stable reason (409 + `reason`). */
export class PortalGuestConflictError extends ApiError {
  readonly reason: PortalGuestConflictReason;

  constructor(reason: PortalGuestConflictReason, message: string) {
    super("CONFLICT", message);
    this.name = "PortalGuestConflictError";
    this.reason = reason;
  }
}

/** `projects.package_code_snapshot` → Guest Tool mode; unknown packages have none (fail closed). */
export function guestToolModeForPackage(packageCode: string): PortalGuestToolMode | null {
  const variants = requiredInvitationVariantsForPackage(packageCode);
  if (variants === null) return null;
  if (variants.length === 1 && variants[0] === "COMMON") return "COMMON_ONLY";
  if (variants.length === 2 && variants.includes("GROOM") && variants.includes("BRIDE")) return "GROOM_OR_BRIDE";
  return null;
}

/** Customer row: `linkIssued` → read-only link status; NULL variant resolved per API §7.3 (never guessed for SEPARATE). */
export function presentPortalGuest(record: PortalGuestRecord, mode: PortalGuestToolMode): CustomerPortalGuestRow {
  return {
    guestId: record.id,
    displayName: record.displayName,
    invitationVariant: resolveGuestInvitationVariant(record.invitationVariant, mode === "COMMON_ONLY" ? "COMMON" : "SEPARATE"),
    status: record.revoked ? "REVOKED" : "ACTIVE",
    linkStatus: record.linkIssued ? "ISSUED" : "NOT_ISSUED",
  };
}

/** Active guests first, then revoked; repository order kept within each group. */
export function presentPortalGuests(records: readonly PortalGuestRecord[], mode: PortalGuestToolMode): CustomerPortalGuestRow[] {
  const rows = records.map((record) => presentPortalGuest(record, mode));
  return [...rows.filter((row) => row.status === "ACTIVE"), ...rows.filter((row) => row.status === "REVOKED")];
}

/**
 * Task 033E-C — attaches each guest's compact RSVP status, joined ONLY by
 * `rsvps.guest_id = guests.id` (never a name, side, token or slug). Fails
 * closed if an RSVP names a guest outside this Project's list, a guest has
 * two rows, or attendance/party size break the 0018/0032 rule. Independent
 * of link and revoke state: a revoked guest keeps its historical status.
 */
export function attachGuestRsvpStatuses(
  rows: readonly CustomerPortalGuestRow[],
  rsvps: readonly PortalGuestRsvpRecord[],
): CustomerPortalGuestListRow[] {
  const byGuest = new Map<string, PortalGuestRsvpRecord>();
  const guestIds = new Set(rows.map((row) => row.guestId));
  for (const rsvp of rsvps) {
    if (!guestIds.has(rsvp.guestId) || byGuest.has(rsvp.guestId)) {
      throw new Error("Guest RSVP integrity fault");
    }
    const counted = rsvp.attendance === "ATTENDING" || rsvp.attendance === "MAYBE";
    const validSize = counted ? Number.isInteger(rsvp.partySize) && rsvp.partySize >= 1 && rsvp.partySize <= 20 : rsvp.partySize === 0;
    if (!validSize) {
      throw new Error("Guest RSVP integrity fault");
    }
    byGuest.set(rsvp.guestId, rsvp);
  }
  return rows.map((row) => {
    const rsvp = byGuest.get(row.guestId);
    if (rsvp === undefined) return { ...row, rsvpStatus: "NOT_RESPONDED", rsvpPartySize: null };
    return { ...row, rsvpStatus: rsvp.attendance, rsvpPartySize: rsvp.attendance === "NOT_ATTENDING" ? null : rsvp.partySize };
  });
}

interface AuthorizedGuestTool {
  projectId: string;
  mode: PortalGuestToolMode;
}

async function authorizeGuestTool(rawToken: string, deps: PortalGuestToolDependencies): Promise<AuthorizedGuestTool> {
  const context = await resolveAccessLink({ rawToken, expectedLinkType: "PORTAL" }, deps.resolution, deps.now);
  const tool = await deps.guests.getGuestToolContext(context.projectId);
  if (tool.packageCode === null) {
    throw new Error("Portal Project could not be loaded");
  }
  if (!tool.published || !tool.personalizedGuestEntitled) {
    throw new ApiError("FORBIDDEN", "Guest tool is not available for this project");
  }
  const mode = guestToolModeForPackage(tool.packageCode);
  if (mode === null) {
    throw new Error("Unsupported package for guest tool");
  }
  return { projectId: context.projectId, mode };
}

async function readJsonBody(readBody: () => Promise<unknown>): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await readBody();
  } catch {
    throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

const BODY_KEYS = new Set(["displayName", "invitationVariant"]);

/**
 * `{ displayName[, invitationVariant] }` only. COMMON_ONLY: the variant is
 * absent or exactly COMMON (the server writes COMMON regardless). GROOM_OR_BRIDE:
 * GROOM or BRIDE — required on create, optional on edit; never defaulted.
 */
export function parsePortalGuestBody(
  body: Record<string, unknown>,
  mode: PortalGuestToolMode,
  purpose: "CREATE" | "EDIT",
): { displayName: string; invitationVariant: InvitationVariant | undefined } {
  if (Reflect.ownKeys(body).some((key) => typeof key !== "string" || !BODY_KEYS.has(key))) {
    throw new ApiError("BAD_REQUEST", "Request body contains an unknown field");
  }
  const displayName = normalizeGuestDisplayName(body.displayName);
  if (displayName === null) {
    throw new ApiError("BAD_REQUEST", "displayName must be 1-200 characters");
  }
  const hasVariant = Object.hasOwn(body, "invitationVariant");
  const variant = body.invitationVariant;
  if (mode === "COMMON_ONLY") {
    if (hasVariant && variant !== "COMMON") {
      throw new ApiError("BAD_REQUEST", "invitationVariant is not valid for this project");
    }
    return { displayName, invitationVariant: purpose === "CREATE" ? "COMMON" : undefined };
  }
  if (!hasVariant && purpose === "EDIT") {
    return { displayName, invitationVariant: undefined };
  }
  if (variant !== "GROOM" && variant !== "BRIDE") {
    throw new ApiError("BAD_REQUEST", "invitationVariant must be GROOM or BRIDE");
  }
  return { displayName, invitationVariant: variant };
}

function targetGuestId(rawGuestId: string): string {
  // Malformed ids are indistinguishable from unknown or foreign ones.
  if (!isValidUuid(rawGuestId)) {
    throw new ApiError("NOT_FOUND", "Guest not found");
  }
  return rawGuestId;
}

/** POST /api/v2/public/portal/guests — a new active guest with a dormant hash and no link. */
export async function createPortalGuest(
  rawToken: string,
  readBody: () => Promise<unknown>,
  deps: PortalGuestToolDependencies,
): Promise<CustomerPortalGuestRow> {
  const { projectId, mode } = await authorizeGuestTool(rawToken, deps);
  const input = parsePortalGuestBody(await readJsonBody(readBody), mode, "CREATE");
  if (input.invitationVariant === undefined) {
    throw new Error("Create requires a resolved invitation variant");
  }
  const record = await deps.guests.insertGuest(projectId, {
    displayName: input.displayName,
    invitationVariant: input.invitationVariant,
    tokenHash: generateDormantGuestTokenHash(),
  });
  return presentPortalGuest(record, mode);
}

/**
 * PATCH /api/v2/public/portal/guests/[guestId] — display name (before or
 * after issuance; the link keeps working, nothing is regenerated) and, for
 * SEPARATE only, the side while no link has been issued. One conditional
 * UPDATE; a 0-row result is classified read-only (404 / 409).
 */
export async function updatePortalGuest(
  rawToken: string,
  rawGuestId: string,
  readBody: () => Promise<unknown>,
  deps: PortalGuestToolDependencies,
): Promise<CustomerPortalGuestRow> {
  const { projectId, mode } = await authorizeGuestTool(rawToken, deps);
  const guestId = targetGuestId(rawGuestId);
  const input = parsePortalGuestBody(await readJsonBody(readBody), mode, "EDIT");

  const params: UpdatePortalGuestParams = { displayName: input.displayName };
  if (input.invitationVariant === "GROOM" || input.invitationVariant === "BRIDE") {
    params.invitationVariant = input.invitationVariant;
  }
  const updated = await deps.guests.updateGuest(projectId, guestId, params);
  if (updated !== null) {
    return presentPortalGuest(updated, mode);
  }

  const state = await deps.guests.getGuestState(projectId, guestId);
  if (state === null) {
    throw new ApiError("NOT_FOUND", "Guest not found");
  }
  if (state.revoked) {
    throw new PortalGuestConflictError("GUEST_REVOKED", "Guest is revoked");
  }
  if (params.invitationVariant !== undefined && state.linkIssued && state.invitationVariant !== params.invitationVariant) {
    throw new PortalGuestConflictError("SIDE_LOCKED", "Invitation side is locked after the personalized link was issued");
  }
  throw new PortalGuestConflictError("CONCURRENT_CHANGE", "Guest changed concurrently; reload and retry");
}

/** POST /api/v2/public/portal/guests/[guestId]/revoke — soft revoke; no DELETE, no RSVP write, no restore. */
export async function revokePortalGuest(
  rawToken: string,
  rawGuestId: string,
  deps: PortalGuestToolDependencies,
): Promise<CustomerPortalGuestRow> {
  const { projectId, mode } = await authorizeGuestTool(rawToken, deps);
  const guestId = targetGuestId(rawGuestId);

  const revoked = await deps.guests.revokeGuest(projectId, guestId);
  if (revoked !== null) {
    return presentPortalGuest(revoked, mode);
  }

  const state = await deps.guests.getGuestState(projectId, guestId);
  if (state === null) {
    throw new ApiError("NOT_FOUND", "Guest not found");
  }
  if (state.revoked) {
    throw new PortalGuestConflictError("ALREADY_REVOKED", "Guest is already revoked");
  }
  throw new PortalGuestConflictError("CONCURRENT_CHANGE", "Guest changed concurrently; reload and retry");
}

/**
 * POST /api/v2/public/portal/guests/[guestId]/access-link (Task 033E-B) —
 * body `{ action: "ISSUE" | "REGENERATE" }`. After the Portal gate (PORTAL
 * token → Project, published, entitled), the shared `issueGuestLink` runs
 * with the Project-pinned gateway: it re-checks the entitlement, decides
 * ISSUE vs REGENERATE validity from `token_issued_at` (never the browser),
 * refuses revoked guests, resolves the variant (§7.3) and the PUBLISHED slug,
 * and rotates the token in one conditional UPDATE that also pins the
 * variant. A 409 is classified read-only into a stable reason.
 */
export async function issuePortalGuestLink(
  rawToken: string,
  rawGuestId: string,
  readBody: () => Promise<unknown>,
  deps: PortalGuestToolDependencies,
): Promise<PortalIssuedGuestLink> {
  const { projectId } = await authorizeGuestTool(rawToken, deps);
  const guestId = targetGuestId(rawGuestId);
  let body: unknown;
  try {
    body = await readBody();
  } catch {
    throw new ApiError("BAD_REQUEST", "Request body must be { action }");
  }

  try {
    const issued = await issueGuestLink(projectId, guestId, body, { projectId }, deps.guestLinks);
    return { personalizedUrl: issued.invitationPath, linkStatus: "ISSUED" };
  } catch (error) {
    if (!(error instanceof ApiError) || error.kind !== "CONFLICT") throw error;
    const state = await deps.guests.getGuestState(projectId, guestId);
    if (state === null) {
      throw new ApiError("NOT_FOUND", "Guest not found");
    }
    if (state.revoked) {
      throw new PortalGuestConflictError("GUEST_REVOKED", "Guest is revoked");
    }
    throw new PortalGuestConflictError("CONCURRENT_CHANGE", "Guest changed concurrently; reload and retry");
  }
}
