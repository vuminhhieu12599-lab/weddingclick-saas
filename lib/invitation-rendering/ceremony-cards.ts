import { compareEventsForDisplay } from "./event-ordering";
import type { SnapshotEvent, SnapshotPayloadV1 } from "./snapshot-payload-types";
import { WEDDING_VARIANT_RULES } from "./wedding-variant-rules";
import type { CeremonyTitle, CoupleSide } from "./wedding-domain-types";

/**
 * Runtime-only ceremony-card presentation (docs/DECISIONS.md RF2 "Ceremony-
 * card presentation", Product Owner ruling 2026-10-01). Never persisted:
 * the Snapshot's canonical `events` stay complete and in RF2 display order.
 *
 * One card per operational side of the variant (RF4), always GROOM before
 * BRIDE (COMMON: GROOM → BRIDE; GROOM / BRIDE: that side only), whatever the
 * dates or the staff sort_order between the two sides. A side's card is its
 * own rite only, taken from that side's single-side variant rule (RF2/RF3):
 * GROOM → THANH_HON "Lễ Thành Hôn", BRIDE → VU_QUY "Lễ Vu Quy". The event
 * must carry exactly that side and that rite: no COMMON-side event, no other
 * rite and no other occasion is ever substituted, and a side without a
 * matching event simply has no card. Several candidates on one side resolve
 * by the canonical display order (sort_order → starts_at → id).
 *
 * The visible title is the rite-derived business title; `event.title` itself
 * is never changed and stays available to other surfaces.
 */
export interface CeremonyCardSelection {
  side: CoupleSide;
  /** Rite-derived presentation title (RF3), never the event's own title. */
  title: CeremonyTitle;
  event: SnapshotEvent;
}

/** Presentation order of the two couple sides: GROOM always before BRIDE. */
const CEREMONY_CARD_SIDE_ORDER: readonly CoupleSide[] = ["GROOM", "BRIDE"];

export function selectCeremonyCards(snapshot: Pick<SnapshotPayloadV1, "variant" | "events">): CeremonyCardSelection[] {
  const operationalSides = WEDDING_VARIANT_RULES[snapshot.variant].operationalSides;
  const cards: CeremonyCardSelection[] = [];

  for (const side of CEREMONY_CARD_SIDE_ORDER) {
    if (!operationalSides.includes(side)) continue;
    const { ceremonyOccasion, ceremonyTitle } = WEDDING_VARIANT_RULES[side];
    const [first] = snapshot.events
      .filter((event) => event.side === side && event.occasionType === ceremonyOccasion)
      .sort(compareEventsForDisplay);
    if (first !== undefined) cards.push({ side, title: ceremonyTitle, event: first });
  }

  return cards;
}
