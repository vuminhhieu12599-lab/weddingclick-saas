import type { InvitationVariant } from "./invitation-variant";

/**
 * LAUNCH-P0-02 — human-friendly public alias of a SEPARATE invitation
 * (docs/API_CONTRACT.md §39, migration 0049), e.g.
 *
 *   GROOM  minh-anh&thu-ha   (groom first: groom-side family)
 *   BRIDE  thu-ha&minh-anh   (bride first: bride-side family)
 *   COMMON none — unchanged by this decision
 *
 * Two lowercase unaccented ASCII name slugs joined by a literal `&`. The
 * shape mirrors the 0049 table CHECK exactly and is disjoint from the 0012
 * canonical `public_slug` shape (which never contains `&`). A routing
 * identifier only, never authorization. Never suffixed automatically.
 */
export const INVITATION_PUBLIC_ALIAS_MAX_LENGTH = 100;

const INVITATION_PUBLIC_ALIAS_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*&[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PublicAliasVariant = Extract<InvitationVariant, "GROOM" | "BRIDE">;

export function isPublicAliasVariant(variant: InvitationVariant): variant is PublicAliasVariant {
  return variant === "GROOM" || variant === "BRIDE";
}

export function isWellFormedInvitationPublicAlias(value: string): boolean {
  return value.length <= INVITATION_PUBLIC_ALIAS_MAX_LENGTH && INVITATION_PUBLIC_ALIAS_PATTERN.test(value);
}

/**
 * Vietnamese name → lowercase unaccented ASCII slug: diacritics removed
 * (NFD), `đ`/`Đ` → `d`, every other run of non-alphanumerics → one hyphen,
 * no leading/trailing hyphen. `null` when nothing usable remains.
 */
export function slugifyPersonName(name: string): string | null {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length === 0 ? null : slug;
}

/** `primary&secondary` from two free-form name parts; `null` when either is unusable or the result is too long. */
export function buildInvitationPublicAlias(primaryName: string, secondaryName: string): string | null {
  const primary = slugifyPersonName(primaryName);
  const secondary = slugifyPersonName(secondaryName);
  if (primary === null || secondary === null) return null;
  const alias = `${primary}&${secondary}`;
  return isWellFormedInvitationPublicAlias(alias) ? alias : null;
}

/**
 * Default alias of one published invitation (Rule of Three):
 * - GROOM → groom name first, then bride;
 * - BRIDE → bride name first, then groom;
 * - COMMON → `null` (no alias; COMMON is unchanged).
 */
export function deriveInvitationPublicAlias(
  variant: InvitationVariant,
  names: { readonly groomName: string; readonly brideName: string },
): string | null {
  if (variant === "GROOM") return buildInvitationPublicAlias(names.groomName, names.brideName);
  if (variant === "BRIDE") return buildInvitationPublicAlias(names.brideName, names.groomName);
  return null;
}

/** Relative public path of an alias. The `&` stays literal (a valid path character). */
export function invitationPublicAliasPath(alias: string): string {
  return `/i/${alias}`;
}
