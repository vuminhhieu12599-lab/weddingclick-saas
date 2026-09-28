import { describe, expect, it } from "vitest";

import type { InvitationVariant } from "../../domain";
import type { ProjectEventRecord } from "../../server/project-events/project-events-types";
import type { WeddingDetailsRecord } from "../../server/wedding-details/wedding-details-types";
import {
  compareEventsForCeremonyEarliest,
  compareEventsForDisplay,
} from "../event-ordering";
import {
  WeddingDomainInvariantError,
  resolveWeddingDomain,
} from "../resolve-wedding-domain";
import type { WeddingDomainResolution } from "../wedding-domain-types";

const LEGACY_LUNAR_SENTINEL = "LEGACY_PROJECT_LUNAR_MUST_NOT_LEAK";

const weddingDetails: WeddingDetailsRecord = {
  id: "wd-1",
  projectId: "project-1",
  groomName: "Nguyễn Văn Minh",
  brideName: "Trần Thị Lan",
  groomFather: "Nguyễn Văn A",
  groomMother: "Lê Thị B",
  brideFather: "Trần Văn C",
  brideMother: "Phạm Thị D",
  groomFamilyAddress: "Hà Nội",
  brideFamilyAddress: "Hải Phòng",
  invitationMessage: "Trân trọng kính mời",
  loveStory: null,
  lunarDateDisplay: LEGACY_LUNAR_SENTINEL,
  additionalNote: "internal only",
  groomBankName: null,
  groomBankAccountName: null,
  groomBankAccountNumber: null,
  groomBankQrMediaId: null,
  brideBankName: null,
  brideBankAccountName: null,
  brideBankAccountNumber: null,
  brideBankQrMediaId: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function event(overrides: Partial<ProjectEventRecord> & Pick<ProjectEventRecord, "id">): ProjectEventRecord {
  return {
    projectId: "project-1",
    occasionType: "THANH_HON",
    side: "COMMON",
    title: `Event ${overrides.id}`,
    startsAt: "2026-10-18T02:00:00.000Z",
    timezone: "Asia/Ho_Chi_Minh",
    venueName: null,
    address: null,
    mapUrl: null,
    description: null,
    sortOrder: 0,
    isPrimary: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    lunarDateDisplay: null,
    ...overrides,
  };
}

function resolve(variant: InvitationVariant, events: ProjectEventRecord[]): WeddingDomainResolution {
  return resolveWeddingDomain({ variant, weddingDetails, events });
}

function ceremonyId(result: WeddingDomainResolution): string | null {
  return result.ceremony?.eventId ?? null;
}

function ids(events: readonly ProjectEventRecord[]): string[] {
  return events.map((e) => e.id);
}

/** A realistic mixed project: both rites, receptions, a custom event. */
const mixedEvents: ProjectEventRecord[] = [
  event({ id: "g-reception", side: "GROOM", occasionType: "RECEPTION", sortOrder: 3, startsAt: "2026-10-18T05:00:00.000Z", lunarDateDisplay: "RECEPTION LUNAR" }),
  event({ id: "b-vuquy", side: "BRIDE", occasionType: "VU_QUY", sortOrder: 1, startsAt: "2026-10-17T02:00:00.000Z", lunarDateDisplay: "07/09 Âm lịch", isPrimary: true }),
  event({ id: "c-custom", side: "COMMON", occasionType: "CUSTOM", sortOrder: 5, startsAt: "2026-10-19T02:00:00.000Z", lunarDateDisplay: "CUSTOM LUNAR" }),
  event({ id: "g-thanhhon", side: "GROOM", occasionType: "THANH_HON", sortOrder: 2, startsAt: "2026-10-18T02:00:00.000Z", lunarDateDisplay: "08/09 Âm lịch", isPrimary: true }),
  event({ id: "b-reception", side: "BRIDE", occasionType: "RECEPTION", sortOrder: 4, startsAt: "2026-10-17T05:00:00.000Z" }),
];

// ---------------------------------------------------------------------------
// §24 Visibility + display order
// ---------------------------------------------------------------------------

describe("visible events", () => {
  it("COMMON includes GROOM, BRIDE and COMMON events, each exactly once", () => {
    const result = resolve("COMMON", mixedEvents);
    expect(ids(result.visibleEvents)).toEqual([
      "b-vuquy",
      "g-thanhhon",
      "g-reception",
      "b-reception",
      "c-custom",
    ]);
    expect(new Set(ids(result.visibleEvents)).size).toBe(mixedEvents.length);
  });

  it("GROOM includes only GROOM and COMMON events", () => {
    const result = resolve("GROOM", mixedEvents);
    expect(ids(result.visibleEvents)).toEqual(["g-thanhhon", "g-reception", "c-custom"]);
    expect(result.visibleEvents.every((e) => e.side !== "BRIDE")).toBe(true);
  });

  it("BRIDE includes only BRIDE and COMMON events", () => {
    const result = resolve("BRIDE", mixedEvents);
    expect(ids(result.visibleEvents)).toEqual(["b-vuquy", "b-reception", "c-custom"]);
    expect(result.visibleEvents.every((e) => e.side !== "GROOM")).toBe(true);
  });

  it("orders by sortOrder, then startsAt, then id", () => {
    const events = [
      event({ id: "e-3", sortOrder: 1, startsAt: "2026-10-18T03:00:00.000Z" }),
      event({ id: "e-2", sortOrder: 1, startsAt: "2026-10-18T02:00:00.000Z" }),
      event({ id: "e-1", sortOrder: 1, startsAt: "2026-10-18T02:00:00.000Z" }),
      event({ id: "e-0", sortOrder: 2, startsAt: "2026-10-01T00:00:00.000Z" }),
      event({ id: "e-9", sortOrder: 0, startsAt: "2026-12-31T00:00:00.000Z" }),
    ];
    expect(ids(resolve("COMMON", events).visibleEvents)).toEqual(["e-9", "e-1", "e-2", "e-3", "e-0"]);
  });

  it("compares startsAt as an instant, not as text", () => {
    const events = [
      // 09:00+07:00 == 02:00Z, later than 01:30Z despite sorting first as text.
      event({ id: "a", startsAt: "2026-10-18T09:00:00+07:00" }),
      event({ id: "b", startsAt: "2026-10-18T01:30:00+00:00" }),
    ];
    expect(ids(resolve("COMMON", events).visibleEvents)).toEqual(["b", "a"]);
  });

  it("display order differs from ceremony earliest order", () => {
    const early = event({ id: "early", sortOrder: 9, startsAt: "2026-10-17T00:00:00.000Z" });
    const late = event({ id: "late", sortOrder: 1, startsAt: "2026-10-18T00:00:00.000Z" });
    expect(compareEventsForDisplay(late, early)).toBeLessThan(0);
    expect(compareEventsForCeremonyEarliest(early, late)).toBeLessThan(0);

    const result = resolve("COMMON", [early, late]);
    expect(ids(result.visibleEvents)).toEqual(["late", "early"]);
    // Ceremony uses "earliest" (startsAt first), not display order.
    expect(ceremonyId(result)).toBe("early");
  });

  it("returns a new array and never mutates the input", () => {
    const input = structuredClone(mixedEvents);
    const snapshot = structuredClone(input);
    const result = resolve("COMMON", input);
    expect(input).toEqual(snapshot);
    expect(ids(input)).toEqual(ids(snapshot));
    expect(result.visibleEvents).not.toBe(input);
    result.visibleEvents[0].title = "mutated";
    expect(input).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// §25 COMMON ceremony
// ---------------------------------------------------------------------------

describe("COMMON ceremony selection", () => {
  it("tier 1: primary COMMON THANH_HON wins", () => {
    const events = [
      event({ id: "c-early", side: "COMMON", startsAt: "2026-10-17T00:00:00.000Z" }),
      event({ id: "c-primary", side: "COMMON", isPrimary: true, startsAt: "2026-10-18T00:00:00.000Z" }),
      event({ id: "g-earliest", side: "GROOM", startsAt: "2026-10-01T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve("COMMON", events))).toBe("c-primary");
  });

  it("tier 2: earliest COMMON wins when no primary COMMON exists", () => {
    const events = [
      event({ id: "c-late", side: "COMMON", startsAt: "2026-10-19T00:00:00.000Z" }),
      event({ id: "c-early", side: "COMMON", startsAt: "2026-10-18T00:00:00.000Z" }),
      event({ id: "g-earlier", side: "GROOM", startsAt: "2026-10-01T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve("COMMON", events))).toBe("c-early");
  });

  it("tier 3: earliest GROOM/BRIDE candidate only when no COMMON candidate exists", () => {
    const events = [
      event({ id: "g-late", side: "GROOM", startsAt: "2026-10-19T00:00:00.000Z", isPrimary: true }),
      event({ id: "b-early", side: "BRIDE", startsAt: "2026-10-18T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve("COMMON", events))).toBe("b-early");
  });

  it("primary GROOM does not jump ahead of a non-primary COMMON candidate", () => {
    const events = [
      event({ id: "g-primary", side: "GROOM", isPrimary: true, startsAt: "2026-10-01T00:00:00.000Z" }),
      event({ id: "c-plain", side: "COMMON", startsAt: "2026-10-18T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve("COMMON", events))).toBe("c-plain");
  });

  it("primary BRIDE does not jump ahead of a non-primary COMMON candidate", () => {
    const events = [
      event({ id: "b-primary", side: "BRIDE", isPrimary: true, startsAt: "2026-10-01T00:00:00.000Z" }),
      event({ id: "c-plain", side: "COMMON", startsAt: "2026-10-18T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve("COMMON", events))).toBe("c-plain");
  });

  it("ignores a primary event of the wrong occasion", () => {
    const events = [
      event({ id: "c-vuquy-primary", side: "COMMON", occasionType: "VU_QUY", isPrimary: true, startsAt: "2026-10-01T00:00:00.000Z" }),
      event({ id: "c-thanhhon", side: "COMMON", startsAt: "2026-10-18T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve("COMMON", events))).toBe("c-thanhhon");
  });

  it("ignores RECEPTION and CUSTOM events, primary or not", () => {
    const events = [
      event({ id: "c-reception", side: "COMMON", occasionType: "RECEPTION", isPrimary: true, startsAt: "2026-10-01T00:00:00.000Z" }),
      event({ id: "c-custom", side: "COMMON", occasionType: "CUSTOM", startsAt: "2026-10-02T00:00:00.000Z" }),
      event({ id: "g-thanhhon", side: "GROOM", startsAt: "2026-10-18T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve("COMMON", events))).toBe("g-thanhhon");
  });

  it("breaks ties deterministically: startsAt, then sortOrder, then id", () => {
    const events = [
      event({ id: "c-b", side: "COMMON", sortOrder: 1 }),
      event({ id: "c-a", side: "COMMON", sortOrder: 1 }),
      event({ id: "c-z", side: "COMMON", sortOrder: 2 }),
    ];
    expect(ceremonyId(resolve("COMMON", events))).toBe("c-a");

    const bySortOrder = [
      event({ id: "c-a", side: "COMMON", sortOrder: 5 }),
      event({ id: "c-b", side: "COMMON", sortOrder: 1 }),
    ];
    expect(ceremonyId(resolve("COMMON", bySortOrder))).toBe("c-b");
  });

  it("picks deterministically if several primary COMMON rows ever match", () => {
    const events = [
      event({ id: "c-p2", side: "COMMON", isPrimary: true, startsAt: "2026-10-19T00:00:00.000Z" }),
      event({ id: "c-p1", side: "COMMON", isPrimary: true, startsAt: "2026-10-18T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve("COMMON", events))).toBe("c-p1");
  });
});

// ---------------------------------------------------------------------------
// §26 GROOM ceremony / §27 BRIDE ceremony (mirrored)
// ---------------------------------------------------------------------------

const sideCases = [
  { variant: "GROOM", own: "GROOM", other: "BRIDE", rite: "THANH_HON", wrongRite: "VU_QUY" },
  { variant: "BRIDE", own: "BRIDE", other: "GROOM", rite: "VU_QUY", wrongRite: "THANH_HON" },
] as const;

describe.each(sideCases)("$variant ceremony selection", ({ variant, own, other, rite, wrongRite }) => {
  it(`tier 1: primary ${own} wins over primary COMMON and earlier events`, () => {
    const events = [
      event({ id: "own-primary", side: own, occasionType: rite, isPrimary: true, startsAt: "2026-10-20T00:00:00.000Z" }),
      event({ id: "c-primary", side: "COMMON", occasionType: rite, isPrimary: true, startsAt: "2026-10-18T00:00:00.000Z" }),
      event({ id: "c-early", side: "COMMON", occasionType: rite, startsAt: "2026-10-01T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve(variant, events))).toBe("own-primary");
  });

  it("tier 2: primary COMMON next", () => {
    const events = [
      event({ id: "own-plain", side: own, occasionType: rite, startsAt: "2026-10-01T00:00:00.000Z" }),
      event({ id: "c-early", side: "COMMON", occasionType: rite, startsAt: "2026-10-02T00:00:00.000Z" }),
      event({ id: "c-primary", side: "COMMON", occasionType: rite, isPrimary: true, startsAt: "2026-10-18T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve(variant, events))).toBe("c-primary");
  });

  it("tier 3: earliest COMMON next", () => {
    const events = [
      event({ id: "own-plain", side: own, occasionType: rite, startsAt: "2026-10-01T00:00:00.000Z" }),
      event({ id: "c-late", side: "COMMON", occasionType: rite, startsAt: "2026-10-19T00:00:00.000Z" }),
      event({ id: "c-early", side: "COMMON", occasionType: rite, startsAt: "2026-10-18T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve(variant, events))).toBe("c-early");
  });

  it(`tier 4: earliest ${own} fallback`, () => {
    const events = [
      event({ id: "own-late", side: own, occasionType: rite, startsAt: "2026-10-19T00:00:00.000Z" }),
      event({ id: "own-early", side: own, occasionType: rite, startsAt: "2026-10-18T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve(variant, events))).toBe("own-early");
  });

  it(`excludes ${other} events, even a primary ${other} ${rite}`, () => {
    const events = [
      event({ id: "other-primary", side: other, occasionType: rite, isPrimary: true, startsAt: "2026-10-01T00:00:00.000Z" }),
      event({ id: "own-plain", side: own, occasionType: rite, startsAt: "2026-10-18T00:00:00.000Z" }),
    ];
    const result = resolve(variant, events);
    expect(ceremonyId(result)).toBe("own-plain");
    expect(ids(result.visibleEvents)).not.toContain("other-primary");
  });

  it(`excludes ${wrongRite} events, even primary ones`, () => {
    const events = [
      event({ id: "own-wrong", side: own, occasionType: wrongRite, isPrimary: true, startsAt: "2026-10-01T00:00:00.000Z" }),
      event({ id: "c-wrong", side: "COMMON", occasionType: wrongRite, isPrimary: true, startsAt: "2026-10-01T00:00:00.000Z" }),
      event({ id: "own-rite", side: own, occasionType: rite, startsAt: "2026-10-18T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve(variant, events))).toBe("own-rite");
  });

  it("excludes RECEPTION and CUSTOM events", () => {
    const events = [
      event({ id: "own-reception", side: own, occasionType: "RECEPTION", isPrimary: true, startsAt: "2026-10-01T00:00:00.000Z" }),
      event({ id: "c-custom", side: "COMMON", occasionType: "CUSTOM", isPrimary: true, startsAt: "2026-10-01T00:00:00.000Z" }),
      event({ id: "c-rite", side: "COMMON", occasionType: rite, startsAt: "2026-10-18T00:00:00.000Z" }),
    ];
    expect(ceremonyId(resolve(variant, events))).toBe("c-rite");
  });

  it("breaks ties deterministically: startsAt, then sortOrder, then id", () => {
    const sameInstant = [
      event({ id: "own-b", side: own, occasionType: rite, sortOrder: 1 }),
      event({ id: "own-a", side: own, occasionType: rite, sortOrder: 1 }),
      event({ id: "own-0", side: own, occasionType: rite, sortOrder: 2 }),
    ];
    expect(ceremonyId(resolve(variant, sameInstant))).toBe("own-a");
    expect(ceremonyId(resolve(variant, [...sameInstant].reverse()))).toBe("own-a");
  });
});

// ---------------------------------------------------------------------------
// §28 Missing ceremony
// ---------------------------------------------------------------------------

describe("missing ceremony", () => {
  const noCandidateCases: Array<{ variant: InvitationVariant; events: ProjectEventRecord[] }> = [
    {
      variant: "COMMON",
      events: [
        event({ id: "c-reception", occasionType: "RECEPTION", isPrimary: true }),
        event({ id: "c-custom", occasionType: "CUSTOM" }),
        event({ id: "b-vuquy", side: "BRIDE", occasionType: "VU_QUY", isPrimary: true }),
      ],
    },
    {
      variant: "GROOM",
      events: [
        event({ id: "g-reception", side: "GROOM", occasionType: "RECEPTION", isPrimary: true }),
        event({ id: "c-vuquy", side: "COMMON", occasionType: "VU_QUY" }),
        event({ id: "b-thanhhon", side: "BRIDE", occasionType: "THANH_HON", isPrimary: true }),
      ],
    },
    {
      variant: "BRIDE",
      events: [
        event({ id: "b-custom", side: "BRIDE", occasionType: "CUSTOM", isPrimary: true }),
        event({ id: "c-thanhhon", side: "COMMON", occasionType: "THANH_HON" }),
        event({ id: "g-vuquy", side: "GROOM", occasionType: "VU_QUY", isPrimary: true }),
      ],
    },
  ];

  it.each(noCandidateCases)("$variant blocks with REQUIRED_CEREMONY_EVENT_MISSING", ({ variant, events }) => {
    const result = resolve(variant, events);
    expect(result.status).toBe("BLOCKED");
    expect(result.ceremony).toBeNull();
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "REQUIRED_CEREMONY_EVENT_MISSING", severity: "BLOCKING" }),
    ]);
    // Still reports the non-ceremony domain data for preview validation.
    expect(result.visibleEvents.length).toBeGreaterThan(0);
  });

  it.each(["COMMON", "GROOM", "BRIDE"] as const)("%s blocks when there are no events at all", (variant) => {
    const result = resolve(variant, []);
    expect(result.status).toBe("BLOCKED");
    expect(result.issues.map((i) => i.code)).toEqual(["REQUIRED_CEREMONY_EVENT_MISSING"]);
    expect(result.visibleEvents).toEqual([]);
  });

  it("a resolved result carries no issues", () => {
    const result = resolve("COMMON", mixedEvents);
    expect(result.status).toBe("RESOLVED");
    expect(result.issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §29 Titles / sides
// ---------------------------------------------------------------------------

describe("titles and sides", () => {
  it.each([
    { variant: "COMMON", title: "Lễ Thành Hôn", primarySide: "GROOM", secondarySide: "BRIDE", operationalSides: ["GROOM", "BRIDE"], ceremony: "g-thanhhon" },
    { variant: "GROOM", title: "Lễ Thành Hôn", primarySide: "GROOM", secondarySide: "BRIDE", operationalSides: ["GROOM"], ceremony: "g-thanhhon" },
    { variant: "BRIDE", title: "Lễ Vu Quy", primarySide: "BRIDE", secondarySide: "GROOM", operationalSides: ["BRIDE"], ceremony: "b-vuquy" },
  ] as const)("$variant", ({ variant, title, primarySide, secondarySide, operationalSides, ceremony }) => {
    const result = resolve(variant, mixedEvents);
    expect(result.variant).toBe(variant);
    expect(result.ceremony?.title).toBe(title);
    expect(result.ceremony?.eventId).toBe(ceremony);
    expect(result.primarySide).toBe(primarySide);
    expect(result.secondarySide).toBe(secondarySide);
    expect(result.operationalSides).toEqual(operationalSides);
  });

  it("keeps the resolved event's own title unchanged", () => {
    const events = [event({ id: "c-1", title: "Lễ Tân Hôn tại tư gia", isPrimary: true })];
    const result = resolve("COMMON", events);
    expect(result.ceremony?.title).toBe("Lễ Thành Hôn");
    expect(result.ceremony?.event.title).toBe("Lễ Tân Hôn tại tư gia");
    expect(result.ceremony?.event).toEqual(events[0]);
    expect(result.ceremony?.occasionType).toBe("THANH_HON");
  });

  it("carries people and families with explicit sides", () => {
    const result = resolve("BRIDE", mixedEvents);
    expect(result.people).toEqual({
      groom: { side: "GROOM", name: "Nguyễn Văn Minh" },
      bride: { side: "BRIDE", name: "Trần Thị Lan" },
    });
    expect(result.families).toEqual({
      groom: { side: "GROOM", father: "Nguyễn Văn A", mother: "Lê Thị B", address: "Hà Nội" },
      bride: { side: "BRIDE", father: "Trần Văn C", mother: "Phạm Thị D", address: "Hải Phòng" },
    });
  });

  it("never exposes the internal additionalNote or legacy lunar field", () => {
    const serialized = JSON.stringify(resolve("COMMON", mixedEvents));
    expect(serialized).not.toContain("internal only");
    expect(serialized).not.toContain(LEGACY_LUNAR_SENTINEL);
  });
});

// ---------------------------------------------------------------------------
// §30 Lunar
// ---------------------------------------------------------------------------

describe("ceremony lunar date", () => {
  it("passes the ceremony event's lunar string through unchanged", () => {
    expect(resolve("GROOM", mixedEvents).ceremony?.lunarDateDisplay).toBe("08/09 Âm lịch");
    expect(resolve("BRIDE", mixedEvents).ceremony?.lunarDateDisplay).toBe("07/09 Âm lịch");
  });

  it("keeps null as null, and ignores the legacy wedding_details lunar value", () => {
    const events = [event({ id: "c-1", isPrimary: true, lunarDateDisplay: null })];
    // A full canonical WeddingDetailsRecord, as a real caller would pass it.
    const legacyDetails: WeddingDetailsRecord = {
      ...weddingDetails,
      lunarDateDisplay: LEGACY_LUNAR_SENTINEL,
    };
    const result = resolveWeddingDomain({ variant: "COMMON", weddingDetails: legacyDetails, events });
    expect(result.ceremony?.eventId).toBe("c-1");
    expect(result.ceremony?.lunarDateDisplay).toBeNull();
  });

  it("never takes another event's lunar value", () => {
    const events = [
      event({ id: "g-thanhhon", side: "GROOM", isPrimary: true, lunarDateDisplay: null }),
      event({ id: "b-vuquy", side: "BRIDE", occasionType: "VU_QUY", lunarDateDisplay: "07/09 Âm lịch" }),
      event({ id: "g-thanhhon-2", side: "GROOM", startsAt: "2026-10-25T00:00:00.000Z", lunarDateDisplay: "OTHER CEREMONY" }),
    ];
    const result = resolve("GROOM", events);
    expect(result.ceremony?.eventId).toBe("g-thanhhon");
    expect(result.ceremony?.lunarDateDisplay).toBeNull();
  });

  it("never takes RECEPTION/CUSTOM lunar text", () => {
    const events = [
      event({ id: "c-reception", occasionType: "RECEPTION", isPrimary: true, startsAt: "2026-10-01T00:00:00.000Z", lunarDateDisplay: "RECEPTION LUNAR" }),
      event({ id: "c-custom", occasionType: "CUSTOM", startsAt: "2026-10-01T00:00:00.000Z", lunarDateDisplay: "CUSTOM LUNAR" }),
      event({ id: "c-thanhhon", lunarDateDisplay: null }),
    ];
    const result = resolve("COMMON", events);
    expect(result.ceremony?.eventId).toBe("c-thanhhon");
    expect(result.ceremony?.lunarDateDisplay).toBeNull();
  });

  it("ceremony lunar value always equals the resolved event entry's value", () => {
    for (const variant of ["COMMON", "GROOM", "BRIDE"] as const) {
      const result = resolve(variant, mixedEvents);
      expect(result.ceremony?.lunarDateDisplay).toBe(result.ceremony?.event.lunarDateDisplay);
      const entry = result.visibleEvents.find((e) => e.id === result.ceremony?.eventId);
      expect(entry?.lunarDateDisplay).toBe(result.ceremony?.lunarDateDisplay);
    }
  });
});

// ---------------------------------------------------------------------------
// §23 / §31 Determinism + object-identity regression
// ---------------------------------------------------------------------------

describe("determinism and explicit side identity", () => {
  const variants = ["COMMON", "GROOM", "BRIDE"] as const;

  function rebuild(e: ProjectEventRecord): ProjectEventRecord {
    // New object identity, keys inserted in a different order.
    return {
      lunarDateDisplay: e.lunarDateDisplay,
      updatedAt: e.updatedAt,
      createdAt: e.createdAt,
      isPrimary: e.isPrimary,
      sortOrder: e.sortOrder,
      description: e.description,
      mapUrl: e.mapUrl,
      address: e.address,
      venueName: e.venueName,
      timezone: e.timezone,
      startsAt: e.startsAt,
      title: e.title,
      side: e.side,
      occasionType: e.occasionType,
      projectId: e.projectId,
      id: e.id,
    };
  }

  it.each(variants)("%s: JSON round-trip, deep clone and rebuilt objects resolve identically", (variant) => {
    const direct = resolveWeddingDomain({ variant, weddingDetails, events: mixedEvents });

    const jsonInput = JSON.parse(
      JSON.stringify({ variant, weddingDetails, events: mixedEvents }),
    ) as Parameters<typeof resolveWeddingDomain>[0];
    const viaJson = resolveWeddingDomain(jsonInput);

    const viaClone = resolveWeddingDomain(
      structuredClone({ variant, weddingDetails, events: mixedEvents }),
    );

    const viaRebuild = resolveWeddingDomain({
      variant,
      weddingDetails: { ...weddingDetails },
      events: mixedEvents.map(rebuild),
    });

    expect(viaJson).toEqual(direct);
    expect(viaClone).toEqual(direct);
    expect(viaRebuild).toEqual(direct);
    expect(JSON.stringify(viaJson)).toBe(JSON.stringify(direct));
  });

  it.each(variants)("%s: the result itself survives a JSON round-trip unchanged", (variant) => {
    const result = resolve(variant, mixedEvents);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each(variants)("%s: input array order does not change the result", (variant) => {
    const direct = resolve(variant, mixedEvents);
    const reversed = resolve(variant, [...mixedEvents].reverse());
    const rotated = resolve(variant, [...mixedEvents.slice(2), ...mixedEvents.slice(0, 2)]);
    expect(reversed).toEqual(direct);
    expect(rotated).toEqual(direct);
  });

  it("same input values produce the same output on repeated calls", () => {
    const first = resolve("GROOM", mixedEvents);
    const second = resolve("GROOM", mixedEvents);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });
});

// ---------------------------------------------------------------------------
// Canonical invariants (data-integrity faults, not business outcomes)
// ---------------------------------------------------------------------------

describe("canonical invariants", () => {
  it.each([
    ["an unparseable startsAt", [event({ id: "x", startsAt: "not-a-date" })]],
    ["an offsetless startsAt", [event({ id: "x", startsAt: "2026-10-18T02:00:00" })]],
    ["an unknown side", [event({ id: "x", side: "FRIEND" as never })]],
    ["an unknown occasion", [event({ id: "x", occasionType: "PARTY" as never })]],
    ["a non-integer sortOrder", [event({ id: "x", sortOrder: 1.5 })]],
    ["duplicate ids", [event({ id: "x" }), event({ id: "x" })]],
  ])("throws WeddingDomainInvariantError for %s", (_label, events) => {
    expect(() => resolve("COMMON", events)).toThrow(WeddingDomainInvariantError);
  });

  it("throws for an unsupported variant", () => {
    expect(() => resolve("FAMILY" as never, mixedEvents)).toThrow(WeddingDomainInvariantError);
  });
});
