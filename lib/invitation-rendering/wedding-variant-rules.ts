import type { EventSide, InvitationVariant, OccasionType } from "../domain";
import type { CeremonyTitle, CoupleSide } from "./wedding-domain-types";

/**
 * One tier of RF2 ceremony selection, evaluated only within the candidate
 * set. `PRIMARY_ON_SIDE` = the `isPrimary` candidate on `side`;
 * `EARLIEST_ON_SIDE` = the earliest candidate on `side`; `EARLIEST` = the
 * earliest candidate regardless of side.
 */
export type CeremonyTier =
  | { kind: "PRIMARY_ON_SIDE"; side: EventSide }
  | { kind: "EARLIEST_ON_SIDE"; side: EventSide }
  | { kind: "EARLIEST" };

export interface WeddingVariantRules {
  visibleSides: readonly EventSide[];
  ceremonyOccasion: OccasionType;
  ceremonyTitle: CeremonyTitle;
  ceremonyTiers: readonly CeremonyTier[];
  primarySide: CoupleSide;
  secondarySide: CoupleSide;
  operationalSides: readonly CoupleSide[];
}

/**
 * The single table of variant business rules (docs/DECISIONS.md RF2, RF3,
 * RF4). Templates never re-implement any of this.
 */
export const WEDDING_VARIANT_RULES: Readonly<Record<InvitationVariant, WeddingVariantRules>> = {
  COMMON: {
    visibleSides: ["GROOM", "BRIDE", "COMMON"],
    ceremonyOccasion: "THANH_HON",
    ceremonyTitle: "Lễ Thành Hôn",
    // RF2 blocker correction B2: no primary GROOM/BRIDE tier for COMMON.
    ceremonyTiers: [
      { kind: "PRIMARY_ON_SIDE", side: "COMMON" },
      { kind: "EARLIEST_ON_SIDE", side: "COMMON" },
      { kind: "EARLIEST" },
    ],
    primarySide: "GROOM",
    secondarySide: "BRIDE",
    operationalSides: ["GROOM", "BRIDE"],
  },
  GROOM: {
    visibleSides: ["GROOM", "COMMON"],
    ceremonyOccasion: "THANH_HON",
    ceremonyTitle: "Lễ Thành Hôn",
    ceremonyTiers: [
      { kind: "PRIMARY_ON_SIDE", side: "GROOM" },
      { kind: "PRIMARY_ON_SIDE", side: "COMMON" },
      { kind: "EARLIEST_ON_SIDE", side: "COMMON" },
      { kind: "EARLIEST" },
    ],
    primarySide: "GROOM",
    secondarySide: "BRIDE",
    operationalSides: ["GROOM"],
  },
  BRIDE: {
    visibleSides: ["BRIDE", "COMMON"],
    ceremonyOccasion: "VU_QUY",
    ceremonyTitle: "Lễ Vu Quy",
    ceremonyTiers: [
      { kind: "PRIMARY_ON_SIDE", side: "BRIDE" },
      { kind: "PRIMARY_ON_SIDE", side: "COMMON" },
      { kind: "EARLIEST_ON_SIDE", side: "COMMON" },
      { kind: "EARLIEST" },
    ],
    primarySide: "BRIDE",
    secondarySide: "GROOM",
    operationalSides: ["BRIDE"],
  },
};
