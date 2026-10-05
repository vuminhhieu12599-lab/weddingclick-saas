import { resolveGuestInvitationVariant } from "../../domain";
import { generateAccessToken } from "../auth/access-token-crypto";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import { buildPersonalizedInvitationPath } from "./guest-link-path";
import { GUEST_LINK_ACTIONS, type GuestLinkAction, type GuestLinkGateway, type IssuedGuestLink } from "./guest-link-types";

/**
 * Task 033B1 — ISSUE / REGENERATE a personalized guest link (docs/DECISIONS.md
 * "Task 033B1 — Personalized Guest Link Foundation"; docs/API_CONTRACT.md §22).
 *
 * Body is exactly `{ action: "ISSUE" | "REGENERATE" }`. Everything else —
 * token, hash, hint, Project, variant, slug, entitlement — is derived
 * server-side.
 *
 * Actor-neutral: the caller has already authorized access to this Project
 * and passes the matching data client + gateway (today: the staff support
 * route after `requireStaff`; the Customer Portal Guest Tool after PORTAL
 * link resolution, with a Project-pinned gateway — Task 033E-B). Both paths share every
 * rule below, including the PERSONALIZED_GUEST entitlement gate (403 when
 * absent). The gate applies to new ISSUE/REGENERATE only; already-issued
 * links are not affected here (owner decision deferred).
 *
 * `guests.token_hash` is NOT NULL (0017), so every guest already has a
 * dormant hash whose raw token was never delivered; it does not resolve
 * publicly. `guests.token_issued_at` (0042) is the issuance authority
 * (`token_hint` is display-only): ISSUE is allowed only while it is NULL,
 * REGENERATE only once it is set; both rotate the hash/hint in place
 * (§2.19 [R14]) and set `token_issued_at` to now, so the previous token
 * stops resolving immediately. A revoked guest gets no link (409). A guest
 * without a resolvable invitation variant (§7.3) is 422.
 *
 * The fresh raw token (32 CSPRNG bytes, base64url) exists only in the
 * returned path, after the conditional UPDATE confirmed one row. That
 * UPDATE also requires the guest's stored `invitation_variant` to still be
 * the one the slug was resolved from (Task 033E-B race fix): a concurrent
 * side change makes it match nothing → 409, never a dead link.
 */

function parseAction(rawBody: unknown): GuestLinkAction {
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    throw new ApiError("BAD_REQUEST", "Request body must be { action }");
  }
  const keys = Reflect.ownKeys(rawBody);
  const action = (rawBody as Record<string, unknown>).action;
  if (keys.length !== 1 || keys[0] !== "action" || !(GUEST_LINK_ACTIONS as readonly unknown[]).includes(action)) {
    throw new ApiError("BAD_REQUEST", "Action must be ISSUE or REGENERATE");
  }
  return action as GuestLinkAction;
}

export async function issueGuestLink<TClient>(
  rawProjectId: string,
  rawGuestId: string,
  rawBody: unknown,
  client: TClient,
  gateway: GuestLinkGateway<TClient>,
): Promise<IssuedGuestLink> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  if (!isValidUuid(rawGuestId)) {
    throw new ApiError("BAD_REQUEST", "Guest id must be a valid UUID");
  }
  const action = parseAction(rawBody);

  const target = await gateway.getGuestLinkTarget(client, rawProjectId, rawGuestId);
  if (target === null) {
    throw new ApiError("NOT_FOUND", "Guest not found");
  }
  if (!(await gateway.hasPersonalizedGuestEntitlement(client, rawProjectId))) {
    throw new ApiError("FORBIDDEN", "Personalized guest add-on is not active for this project");
  }
  if (target.revoked) {
    throw new ApiError("CONFLICT", "Guest is revoked");
  }
  const expectIssued = action === "REGENERATE";
  if (target.hasIssuedLink !== expectIssued) {
    throw new ApiError("CONFLICT", expectIssued ? "No guest link has been issued yet" : "Guest link already issued; use REGENERATE");
  }

  const variant = resolveGuestInvitationVariant(target.invitationVariant, target.packageCode);
  if (variant === null) {
    throw new ApiError("INVARIANT", "Guest invitation variant must be GROOM or BRIDE");
  }
  const slug = await gateway.getInvitationSlug(client, rawProjectId, variant);
  if (slug === null) {
    throw new ApiError("INVARIANT", "Project has no invitation for the guest variant");
  }

  const generated = generateAccessToken();
  const replaced = await gateway.replaceGuestToken(client, {
    projectId: rawProjectId,
    guestId: rawGuestId,
    expectIssued,
    expectedInvitationVariant: target.invitationVariant,
    tokenHash: generated.tokenHash,
    tokenHint: generated.tokenHint,
  });
  if (!replaced) {
    throw new ApiError("CONFLICT", "Guest link changed concurrently; reload and retry");
  }

  return {
    guestId: rawGuestId,
    projectId: rawProjectId,
    invitationVariant: variant,
    invitationPath: buildPersonalizedInvitationPath(slug, generated.rawToken),
  };
}
