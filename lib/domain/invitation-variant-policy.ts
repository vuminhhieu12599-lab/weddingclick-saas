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
