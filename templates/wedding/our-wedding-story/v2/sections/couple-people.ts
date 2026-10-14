import type { InvitationViewModel, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";

/** One person of The Couple: their explicit side, canonical name and own portrait (if any). */
export interface CouplePerson {
  readonly side: CoupleSide;
  readonly name: string;
  readonly portrait: ResolvedMedia | undefined;
}

/** The two person-bound portrait slots (docs/DECISIONS.md "OWS-01"), each a resolved photo or absent. */
export interface CouplePortraits {
  readonly groom: ResolvedMedia | undefined;
  readonly bride: ResolvedMedia | undefined;
}

/**
 * The Couple in resolver display order: `people.primary` then
 * `people.secondary` (COMMON/GROOM: groom first; BRIDE: bride first). Each
 * portrait is chosen by the person's explicit `side` — `groomPortrait` only
 * ever for the groom, `bridePortrait` only ever for the bride — so a photo,
 * its caption and its name always follow the same person, and a missing
 * portrait is never borrowed from the other person or another slot.
 */
export function orderedCouplePeople(people: InvitationViewModel["people"], portraits: CouplePortraits): readonly [CouplePerson, CouplePerson] {
  const person = (entry: InvitationViewModel["people"]["primary"]): CouplePerson => ({
    side: entry.side,
    name: entry.name,
    portrait: entry.side === "GROOM" ? portraits.groom : portraits.bride,
  });
  return [person(people.primary), person(people.secondary)];
}

/** The approved composition by how many of the two portraits resolved. */
export type CoupleLayout = "STAGGER" | "SINGLE" | "NAMES_ONLY";

export function coupleLayout(people: readonly CouplePerson[]): CoupleLayout {
  const withPhoto = people.filter((entry) => entry.portrait !== undefined).length;
  if (withPhoto === 2) return "STAGGER";
  return withPhoto === 1 ? "SINGLE" : "NAMES_ONLY";
}
