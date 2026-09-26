import type { InvitationVariant, PrototypeWeddingData, SideDetails } from "./types";

/**
 * Single centralized variant resolver (CLAUDE.md §5 — business rules live in
 * one place, not independently inside each template). Every direction reads
 * name/family order, ceremony wording, and which side's operational data
 * (reception/venue/directions/gift) to show from here.
 */
export interface ResolvedInvitation {
  variant: InvitationVariant;
  primary: SideDetails;
  secondary: SideDetails;
  ceremonyTitle: string;
  /**
   * The side whose family home hosts the rite named by `ceremonyTitle`:
   * Thành Hôn at the groom's home (COMMON/GROOM), Vu Quy at the bride's.
   */
  ceremonyHost: SideDetails;
  /** COMMON: both sides, independently. GROOM/BRIDE: that side only. */
  operationalSides: SideDetails[];
}

export function resolveInvitation(
  data: PrototypeWeddingData,
  variant: InvitationVariant
): ResolvedInvitation {
  const brideIsPrimary = variant === "BRIDE";
  const primary = brideIsPrimary ? data.bride : data.groom;
  const secondary = brideIsPrimary ? data.groom : data.bride;
  const ceremonyTitle = brideIsPrimary ? "Lễ Vu Quy" : "Lễ Thành Hôn";
  const ceremonyHost = brideIsPrimary ? data.bride : data.groom;
  const operationalSides = variant === "COMMON" ? [data.groom, data.bride] : [primary];

  return { variant, primary, secondary, ceremonyTitle, ceremonyHost, operationalSides };
}

/**
 * Per-side reception heading, from the same rule as `ceremonyTitle`: the
 * groom's side hosts the Thành Hôn reception, the bride's side the Vu Quy
 * reception. Needed for COMMON, where both sides' event cards render.
 */
export function resolveReceptionTitle(data: PrototypeWeddingData, side: SideDetails): string {
  return side === data.bride ? "Tiệc mừng Lễ Vu Quy" : "Tiệc mừng Lễ Thành Hôn";
}
