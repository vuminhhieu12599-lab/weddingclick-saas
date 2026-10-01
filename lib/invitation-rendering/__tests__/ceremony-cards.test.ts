import { describe, expect, it } from "vitest";

import type { InvitationVariant } from "../../domain";
import { selectCeremonyCards } from "../ceremony-cards";
import type { SnapshotEvent } from "../snapshot-payload-types";

/**
 * docs/DECISIONS.md RF2 "Ceremony-card presentation" (Micro-Checkpoint 7):
 * one card per operational side, GROOM before BRIDE, the side's own rite only,
 * canonical display order within a side, rite-derived titles.
 */
function ev(overrides: Partial<SnapshotEvent> & Pick<SnapshotEvent, "id" | "side" | "occasionType">): SnapshotEvent {
  return {
    title: `${overrides.id} title tại tư gia`,
    startsAt: "2026-10-18T02:00:00.000Z",
    timezone: "Asia/Ho_Chi_Minh",
    venueName: null,
    address: null,
    mapUrl: null,
    description: null,
    sortOrder: 0,
    isPrimary: false,
    lunarDateDisplay: null,
    ...overrides,
  };
}

function cards(variant: InvitationVariant, events: SnapshotEvent[]) {
  return selectCeremonyCards({ variant, events }).map((card) => [card.side, card.title, card.event.id]);
}

const groomThanhHon = ev({ id: "g-thanhhon", side: "GROOM", occasionType: "THANH_HON", startsAt: "2026-10-18T02:00:00.000Z", sortOrder: 5 });
// Earlier date AND a better sort_order than the groom ceremony.
const brideVuQuy = ev({ id: "b-vuquy", side: "BRIDE", occasionType: "VU_QUY", startsAt: "2026-10-17T02:00:00.000Z", sortOrder: 0 });
const extras = [
  ev({ id: "b-reception", side: "BRIDE", occasionType: "RECEPTION", sortOrder: 0 }),
  ev({ id: "c-reception", side: "COMMON", occasionType: "RECEPTION", sortOrder: 0 }),
  ev({ id: "c-thanhhon", side: "COMMON", occasionType: "THANH_HON", sortOrder: 0 }),
  ev({ id: "c-custom", side: "COMMON", occasionType: "CUSTOM", sortOrder: 0 }),
];

describe("selectCeremonyCards", () => {
  it("A/B: COMMON shows GROOM then BRIDE, even when the bride ceremony is earlier and sorts first", () => {
    const events = [brideVuQuy, ...extras, groomThanhHon];
    expect(cards("COMMON", events)).toEqual([
      ["GROOM", "Lễ Thành Hôn", "g-thanhhon"],
      ["BRIDE", "Lễ Vu Quy", "b-vuquy"],
    ]);
    expect(cards("COMMON", [...events].reverse())).toEqual(cards("COMMON", events));
  });

  it("C: extra canonical events are never cards, and the input list is not changed", () => {
    const events = [brideVuQuy, ...extras, groomThanhHon];
    const before = structuredClone(events);
    const ids = cards("COMMON", events).map(([, , id]) => id);
    for (const extra of extras) expect(ids).not.toContain(extra.id);
    expect(events).toEqual(before);
  });

  it("D/E: GROOM shows only the groom ceremony; BRIDE only the bride ceremony", () => {
    // RF2 visibility already removes the other side's events; even if present, they never become cards.
    expect(cards("GROOM", [brideVuQuy, ...extras, groomThanhHon])).toEqual([["GROOM", "Lễ Thành Hôn", "g-thanhhon"]]);
    expect(cards("BRIDE", [brideVuQuy, ...extras, groomThanhHon])).toEqual([["BRIDE", "Lễ Vu Quy", "b-vuquy"]]);
  });

  it("F: a wrong rite or a COMMON-side ceremony is never substituted; a missing side has no card", () => {
    const wrongRites = [
      ev({ id: "g-vuquy", side: "GROOM", occasionType: "VU_QUY" }),
      ev({ id: "b-thanhhon", side: "BRIDE", occasionType: "THANH_HON" }),
      ev({ id: "g-reception", side: "GROOM", occasionType: "RECEPTION" }),
      ...extras,
    ];
    expect(cards("COMMON", wrongRites)).toEqual([]);
    expect(cards("GROOM", wrongRites)).toEqual([]);
    expect(cards("BRIDE", wrongRites)).toEqual([]);
    expect(cards("COMMON", [brideVuQuy, ...wrongRites])).toEqual([["BRIDE", "Lễ Vu Quy", "b-vuquy"]]);
  });

  it("G: several same-side candidates resolve by sort_order, then starts_at, then id", () => {
    const bySort = [
      ev({ id: "g-a", side: "GROOM", occasionType: "THANH_HON", sortOrder: 2, startsAt: "2026-10-01T00:00:00.000Z" }),
      ev({ id: "g-b", side: "GROOM", occasionType: "THANH_HON", sortOrder: 1, startsAt: "2026-10-30T00:00:00.000Z" }),
    ];
    expect(cards("GROOM", bySort)[0]?.[2]).toBe("g-b");
    const byTime = [
      ev({ id: "g-a", side: "GROOM", occasionType: "THANH_HON", sortOrder: 1, startsAt: "2026-10-20T00:00:00.000Z" }),
      ev({ id: "g-b", side: "GROOM", occasionType: "THANH_HON", sortOrder: 1, startsAt: "2026-10-19T00:00:00.000Z" }),
    ];
    expect(cards("GROOM", byTime)[0]?.[2]).toBe("g-b");
    const byId = [
      ev({ id: "g-b", side: "GROOM", occasionType: "THANH_HON", sortOrder: 1 }),
      ev({ id: "g-a", side: "GROOM", occasionType: "THANH_HON", sortOrder: 1 }),
    ];
    expect(cards("GROOM", byId)[0]?.[2]).toBe("g-a");
  });

  it("H/I: the card title is rite-derived and the event keeps its own canonical title", () => {
    const [groom, bride] = selectCeremonyCards({ variant: "COMMON", events: [brideVuQuy, groomThanhHon] });
    expect(groom?.title).toBe("Lễ Thành Hôn");
    expect(bride?.title).toBe("Lễ Vu Quy");
    expect(groom?.event.title).toBe("g-thanhhon title tại tư gia");
    expect(bride?.event.title).toBe("b-vuquy title tại tư gia");
  });
});
