import type { InvitationVariant } from "./invitation-variant";

/**
 * Canonical package → required invitation variants (Task 030).
 *
 * Sources: docs/DECISIONS.md "Commercial Packages" (one common invitation
 * vs. separate groom-side + bride-side invitations), docs/PRODUCT.md §3,
 * docs/PHYSICAL_DATABASE_PLAN.md §2.18 [R-Q2] ("SEPARATE package → GROOM +
 * BRIDE"), ./service-package-code.ts.
 *
 * Keyed by `projects.package_code_snapshot` (the Project's agreed package,
 * never the live catalog). Mirrored exactly by `create_review_version`
 * (migration 0036), which enforces it in the database; a static test keeps
 * the two in agreement. An unknown package code has no policy (`null`) and
 * must fail closed — it is never guessed.
 */
const REQUIRED_INVITATION_VARIANTS_BY_PACKAGE: Readonly<Record<string, readonly InvitationVariant[]>> = Object.freeze({
  COMMON: Object.freeze(["COMMON"] as const),
  SEPARATE: Object.freeze(["GROOM", "BRIDE"] as const),
});

export function requiredInvitationVariantsForPackage(packageCode: string): readonly InvitationVariant[] | null {
  return Object.hasOwn(REQUIRED_INVITATION_VARIANTS_BY_PACKAGE, packageCode)
    ? REQUIRED_INVITATION_VARIANTS_BY_PACKAGE[packageCode]
    : null;
}

/**
 * docs/API_CONTRACT.md §7.3 — the invitation a personalized guest belongs
 * to (Task 033B1). An explicit `guests.invitation_variant` is used as is.
 * `NULL` resolves to `COMMON` only for a COMMON-package Project; for any
 * other package it is an incomplete configuration (`null`) and is never
 * guessed as GROOM or BRIDE. Mirrored by `resolve_public_guest` (0042).
 */
export function resolveGuestInvitationVariant(
  guestVariant: InvitationVariant | null,
  packageCode: string,
): InvitationVariant | null {
  if (guestVariant !== null) return guestVariant;
  return packageCode === "COMMON" ? "COMMON" : null;
}
