import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InvitationVariant, MediaType } from "../../domain";
import type { ProjectMediaRecord } from "../../server/media/media-types";
import type { ProjectDesignRecord } from "../../server/project-design/project-design-types";
import type { ProjectEventRecord } from "../../server/project-events/project-events-types";
import type { WeddingDetailsRecord } from "../../server/wedding-details/wedding-details-types";
import { SnapshotPayloadInvariantError, buildSnapshotPayload } from "../build-snapshot-payload";
import { extractSnapshotMediaRefs } from "../extract-snapshot-media-refs";
import { resolveWeddingDomain } from "../resolve-wedding-domain";
import type {
  BuildSnapshotPayloadInput,
  BuildSnapshotPayloadResult,
  SnapshotPayloadV1,
} from "../snapshot-payload-types";

// Pass-through spy: behavior is the real RF-01 resolver; only call counts are observed.
vi.mock("../resolve-wedding-domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../resolve-wedding-domain")>();
  return { ...actual, resolveWeddingDomain: vi.fn(actual.resolveWeddingDomain) };
});

const resolverSpy = vi.mocked(resolveWeddingDomain);

beforeEach(() => {
  resolverSpy.mockClear();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_ID = "project-1";
const TEMPLATE_VERSION_ID = "tv-elegant-editorial-1";
const RENDERER_KEY = "wedding.elegant-editorial.v1";

const LEGACY_LUNAR = "LEGACY_PROJECT_LUNAR_MUST_NOT_LEAK";
const ADDITIONAL_NOTE = "ADDITIONAL_NOTE_MUST_NOT_LEAK";
const EVENT_CREATED_AT = "2001-01-01T01:01:01.111Z";
const EVENT_UPDATED_AT = "2002-02-02T02:02:02.222Z";
const STORAGE_PATH = "projects/STORAGE_PATH_MUST_NOT_LEAK.jpg";
const UNKNOWN_KEY = "__unknownRuntimeKey";
const UNKNOWN_VALUE = "UNKNOWN_RUNTIME_VALUE_MUST_NOT_LEAK";

const project = { id: PROJECT_ID, projectCode: "WC-2026-0001" };

function details(overrides: Partial<WeddingDetailsRecord> = {}): WeddingDetailsRecord {
  return {
    id: "wd-1",
    projectId: PROJECT_ID,
    groomName: "Nguyễn Văn Minh",
    brideName: "Trần Thị Lan",
    groomFather: "Nguyễn Văn A",
    groomMother: "Lê Thị B",
    brideFather: "Trần Văn C",
    brideMother: "Phạm Thị D",
    groomFamilyAddress: "Hà Nội",
    brideFamilyAddress: "Hải Phòng",
    invitationMessage: "Trân trọng kính mời",
    loveStory: "Chúng tôi gặp nhau ở Đà Lạt",
    lunarDateDisplay: LEGACY_LUNAR,
    additionalNote: ADDITIONAL_NOTE,
    groomBankName: "Vietcombank",
    groomBankAccountName: "NGUYEN VAN MINH",
    groomBankAccountNumber: "0011001234567",
    groomBankQrMediaId: "m-qr-groom",
    brideBankName: "Techcombank",
    brideBankAccountName: "TRAN THI LAN",
    brideBankAccountNumber: "1903123456789",
    brideBankQrMediaId: "m-qr-bride",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function event(overrides: Partial<ProjectEventRecord> & Pick<ProjectEventRecord, "id">): ProjectEventRecord {
  return {
    projectId: PROJECT_ID,
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
    createdAt: EVENT_CREATED_AT,
    updatedAt: EVENT_UPDATED_AT,
    lunarDateDisplay: null,
    ...overrides,
  };
}

const events: ProjectEventRecord[] = [
  event({ id: "g-reception", side: "GROOM", occasionType: "RECEPTION", title: "Tiệc cưới nhà trai", sortOrder: 3, startsAt: "2026-10-18T05:00:00.000Z", venueName: "Nhà hàng A", address: "Hà Nội", mapUrl: "https://maps.example/a", description: "Tiệc" }),
  event({ id: "b-vuquy", side: "BRIDE", occasionType: "VU_QUY", title: "Lễ Vu Quy nhà gái", sortOrder: 1, startsAt: "2026-10-17T02:00:00.000Z", lunarDateDisplay: "07/09 Âm lịch", isPrimary: true }),
  event({ id: "c-custom", side: "COMMON", occasionType: "CUSTOM", title: "Chụp ảnh", sortOrder: 5, startsAt: "2026-10-19T02:00:00.000Z", lunarDateDisplay: "CUSTOM LUNAR" }),
  event({ id: "g-thanhhon", side: "GROOM", occasionType: "THANH_HON", title: "Lễ Thành Hôn nhà trai", sortOrder: 2, startsAt: "2026-10-18T02:00:00.000Z", lunarDateDisplay: "08/09 Âm lịch", isPrimary: true }),
  event({ id: "b-reception", side: "BRIDE", occasionType: "RECEPTION", title: "Tiệc cưới nhà gái", sortOrder: 4, startsAt: "2026-10-17T05:00:00.000Z" }),
];

function mediaRow(id: string, mediaType: MediaType, sortOrder: number, overrides: Partial<ProjectMediaRecord> = {}): ProjectMediaRecord {
  return {
    id,
    projectId: PROJECT_ID,
    mediaType,
    storageBucket: "project-media",
    storagePath: STORAGE_PATH,
    mimeType: mediaType === "AUDIO" ? "audio/mpeg" : "image/jpeg",
    sizeBytes: 1000,
    width: null,
    height: null,
    altText: "alt",
    sortOrder,
    createdBy: "staff-user-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const media: ProjectMediaRecord[] = [
  mediaRow("m-gallery-b", "GALLERY", 1),
  mediaRow("m-cover-2", "COVER", 1),
  mediaRow("m-audio", "AUDIO", 0),
  mediaRow("m-gallery-c", "GALLERY", 0),
  mediaRow("m-cover-1", "COVER", 0),
  mediaRow("m-gallery-a", "GALLERY", 1),
  mediaRow("m-qr-groom", "QR_GROOM", 0),
  mediaRow("m-qr-bride", "QR_BRIDE", 0),
  mediaRow("m-qr-common", "QR_COMMON", 0),
  mediaRow("m-unreferenced", "QR_GROOM", 9),
];

function design(overrides: Partial<ProjectDesignRecord> = {}): ProjectDesignRecord {
  return {
    id: "design-1",
    projectId: PROJECT_ID,
    templateVersionId: TEMPLATE_VERSION_ID,
    paletteKey: "ivory",
    fontPresetKey: "editorial-serif",
    effectPresetKey: "light",
    sectionSettings: { gallery: false, loveStory: false, gift: false, music: false, invitationMessage: false },
    designSettings: { heroLayout: "split", ornamentScale: 1.5 },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const templateVersion = { id: TEMPLATE_VERSION_ID, versionNumber: 1, rendererKey: RENDERER_KEY, manifest: {}, retiredAt: null };

function input(overrides: Partial<BuildSnapshotPayloadInput> = {}): BuildSnapshotPayloadInput {
  return {
    project,
    variant: "COMMON",
    weddingDetails: details(),
    events,
    media,
    design: design(),
    templateVersion,
    ...overrides,
  };
}

function build(overrides: Partial<BuildSnapshotPayloadInput> = {}): BuildSnapshotPayloadResult {
  return buildSnapshotPayload(input(overrides));
}

function success(overrides: Partial<BuildSnapshotPayloadInput> = {}): SnapshotPayloadV1 {
  const result = build(overrides);
  if (result.status !== "SUCCESS") {
    throw new Error(`Expected SUCCESS, got ${JSON.stringify(result.issues)}`);
  }
  expect(result.issues).toEqual([]);
  return result.payload;
}

function issueCodes(result: BuildSnapshotPayloadResult): string[] {
  return result.issues.map((issue) => issue.code);
}

function expectBlocked(result: BuildSnapshotPayloadResult, codes: string[]): void {
  expect(result.status).toBe("BLOCKED");
  expect(issueCodes(result)).toEqual(codes);
  expect(result.issues.every((issue) => issue.severity === "BLOCKING")).toBe(true);
  expect("payload" in result).toBe(false);
}

const noCeremonyEvents = [
  event({ id: "only-reception", side: "COMMON", occasionType: "RECEPTION" }),
  event({ id: "only-vuquy", side: "BRIDE", occasionType: "VU_QUY" }),
];

const noGift = {
  groomBankName: null,
  groomBankAccountName: null,
  groomBankAccountNumber: null,
  groomBankQrMediaId: null,
  brideBankName: null,
  brideBankAccountName: null,
  brideBankAccountNumber: null,
  brideBankQrMediaId: null,
} satisfies Partial<WeddingDetailsRecord>;

// ---------------------------------------------------------------------------
// Missing source / names / aggregation (S12, S13, S13a)
// ---------------------------------------------------------------------------

describe("missing wedding_details", () => {
  it("returns exactly [WEDDING_DETAILS_MISSING], no payload, and never calls the resolver", () => {
    const result = build({ weddingDetails: null });
    expectBlocked(result, ["WEDDING_DETAILS_MISSING"]);
    expect(resolverSpy).not.toHaveBeenCalled();
  });

  it("does not add name or ceremony issues even when the events have no ceremony", () => {
    const result = build({ weddingDetails: null, events: noCeremonyEvents });
    expectBlocked(result, ["WEDDING_DETAILS_MISSING"]);
    expect(resolverSpy).not.toHaveBeenCalled();
  });
});

describe("name validation and issue aggregation", () => {
  it("A: missing groom name only", () => {
    expectBlocked(build({ weddingDetails: details({ groomName: null }) }), ["GROOM_NAME_MISSING"]);
  });

  it("B: missing (whitespace-only) bride name only", () => {
    expectBlocked(build({ weddingDetails: details({ brideName: "   " }) }), ["BRIDE_NAME_MISSING"]);
  });

  it("C: both names missing, groom first", () => {
    expectBlocked(build({ weddingDetails: details({ brideName: null, groomName: "" }) }), [
      "GROOM_NAME_MISSING",
      "BRIDE_NAME_MISSING",
    ]);
  });

  it("D: both names missing plus missing ceremony: builder issues, then resolver issues", () => {
    const result = build({
      weddingDetails: details({ groomName: " ", brideName: null }),
      events: noCeremonyEvents,
    });
    expectBlocked(result, ["GROOM_NAME_MISSING", "BRIDE_NAME_MISSING", "REQUIRED_CEREMONY_EVENT_MISSING"]);
  });

  it("calls the resolver once with the real canonical inputs even when names are missing", () => {
    const wd = details({ groomName: null });
    build({ variant: "BRIDE", weddingDetails: wd });
    expect(resolverSpy).toHaveBeenCalledTimes(1);
    expect(resolverSpy).toHaveBeenCalledWith({ variant: "BRIDE", weddingDetails: wd, events });
  });

  it("preserves the resolver issue object unchanged when only the ceremony is missing", () => {
    const result = build({ events: noCeremonyEvents });
    expectBlocked(result, ["REQUIRED_CEREMONY_EVENT_MISSING"]);
    const resolverIssues = resolveWeddingDomain({ variant: "COMMON", weddingDetails: details(), events: noCeremonyEvents }).issues;
    expect(result.issues).toEqual(resolverIssues);
  });

  it("blocks each variant without its required ceremony", () => {
    const vuQuyOnly = [event({ id: "vq", side: "BRIDE", occasionType: "VU_QUY" })];
    const thanhHonOnly = [event({ id: "th", side: "GROOM", occasionType: "THANH_HON" })];
    expectBlocked(build({ variant: "COMMON", events: vuQuyOnly }), ["REQUIRED_CEREMONY_EVENT_MISSING"]);
    expectBlocked(build({ variant: "GROOM", events: vuQuyOnly }), ["REQUIRED_CEREMONY_EVENT_MISSING"]);
    expectBlocked(build({ variant: "BRIDE", events: thanhHonOnly }), ["REQUIRED_CEREMONY_EVENT_MISSING"]);
  });

  it("does not trim or rewrite stored names on SUCCESS", () => {
    const payload = success({ weddingDetails: details({ groomName: "  Minh  " }) });
    expect(payload.people.groom).toEqual({ side: "GROOM", name: "  Minh  " });
  });
});

// ---------------------------------------------------------------------------
// Template pinning + source invariants
// ---------------------------------------------------------------------------

describe("template pinning", () => {
  it("pins the exact templateVersionId and rendererKey", () => {
    const payload = success();
    expect(payload.template).toEqual({ templateVersionId: TEMPLATE_VERSION_ID, rendererKey: RENDERER_KEY });
  });

  it("uses a later-looking rendererKey verbatim (no latest/fallback substitution)", () => {
    const payload = success({ templateVersion: { id: TEMPLATE_VERSION_ID, rendererKey: "wedding.elegant-editorial.v7" } });
    expect(payload.template.rendererKey).toBe("wedding.elegant-editorial.v7");
  });

  it("throws a typed invariant error when design and template version disagree", () => {
    expect(() => build({ templateVersion: { id: "tv-other", rendererKey: RENDERER_KEY } })).toThrow(
      SnapshotPayloadInvariantError,
    );
  });

  it("throws on an empty rendererKey", () => {
    expect(() => build({ templateVersion: { id: TEMPLATE_VERSION_ID, rendererKey: "" } })).toThrow(
      SnapshotPayloadInvariantError,
    );
  });

  it("checks the pin before the business path (also with missing wedding_details)", () => {
    expect(() =>
      build({ weddingDetails: null, templateVersion: { id: "tv-other", rendererKey: RENDERER_KEY } }),
    ).toThrow(SnapshotPayloadInvariantError);
  });
});

describe("source invariants", () => {
  it("rejects sources from a different Project", () => {
    expect(() => build({ design: design({ projectId: "project-2" }) })).toThrow(SnapshotPayloadInvariantError);
    expect(() => build({ weddingDetails: details({ projectId: "project-2" }) })).toThrow(SnapshotPayloadInvariantError);
    expect(() => build({ events: [...events, event({ id: "x", projectId: "project-2" })] })).toThrow(
      SnapshotPayloadInvariantError,
    );
    expect(() => build({ media: [...media, mediaRow("x", "GALLERY", 0, { projectId: "project-2" })] })).toThrow(
      SnapshotPayloadInvariantError,
    );
  });

  it("rejects duplicate media ids, unknown media types and non-integer sortOrder", () => {
    expect(() => build({ media: [mediaRow("dup", "GALLERY", 0), mediaRow("dup", "COVER", 0)] })).toThrow(
      SnapshotPayloadInvariantError,
    );
    expect(() => build({ media: [mediaRow("m", "BANNER" as MediaType, 0)] })).toThrow(SnapshotPayloadInvariantError);
    expect(() => build({ media: [mediaRow("m", "GALLERY", 1.5)] })).toThrow(SnapshotPayloadInvariantError);
  });

  it("rejects non-flat design settings", () => {
    const nested = { nested: { a: 1 } } as unknown as Record<string, string>;
    expect(() => build({ design: design({ designSettings: nested }) })).toThrow(SnapshotPayloadInvariantError);
    expect(() => build({ design: design({ sectionSettings: { n: Number.NaN } }) })).toThrow(
      SnapshotPayloadInvariantError,
    );
  });
});

// ---------------------------------------------------------------------------
// Variant SUCCESS payloads
// ---------------------------------------------------------------------------

describe("COMMON / GROOM / BRIDE success payloads", () => {
  it("COMMON", () => {
    const payload = success({ variant: "COMMON" });
    expect(payload.payloadSchemaVersion).toBe(1);
    expect(payload.project).toEqual({ code: "WC-2026-0001" });
    expect(payload.variant).toBe("COMMON");
    expect(payload.people.primarySide).toBe("GROOM");
    expect(payload.people.secondarySide).toBe("BRIDE");
    expect(payload.operationalSides).toEqual(["GROOM", "BRIDE"]);
    expect(payload.events.map((e) => e.id)).toEqual(["b-vuquy", "g-thanhhon", "g-reception", "b-reception", "c-custom"]);
    expect(payload.ceremony).toEqual({
      eventId: "g-thanhhon",
      occasionType: "THANH_HON",
      title: "Lễ Thành Hôn",
      startsAt: "2026-10-18T02:00:00.000Z",
      timezone: "Asia/Ho_Chi_Minh",
      lunarDateDisplay: "08/09 Âm lịch",
    });
    expect(Object.keys(payload.gift)).toEqual(["groom", "bride"]);
    expect(payload.media.qr).toEqual({ groomMediaId: "m-qr-groom", brideMediaId: "m-qr-bride" });
    expect(payload.sections.gift).toBe(true);
  });

  it("GROOM", () => {
    const payload = success({ variant: "GROOM" });
    expect(payload.variant).toBe("GROOM");
    expect(payload.people.primarySide).toBe("GROOM");
    expect(payload.people.secondarySide).toBe("BRIDE");
    expect(payload.operationalSides).toEqual(["GROOM"]);
    expect(payload.events.map((e) => e.id)).toEqual(["g-thanhhon", "g-reception", "c-custom"]);
    expect(payload.ceremony.eventId).toBe("g-thanhhon");
    expect(payload.ceremony.title).toBe("Lễ Thành Hôn");
    expect(payload.ceremony.lunarDateDisplay).toBe("08/09 Âm lịch");
    expect(Object.keys(payload.gift)).toEqual(["groom"]);
    expect(payload.media.qr).toEqual({ groomMediaId: "m-qr-groom" });
    expect(payload.sections.gift).toBe(true);
  });

  it("BRIDE", () => {
    const payload = success({ variant: "BRIDE" });
    expect(payload.variant).toBe("BRIDE");
    expect(payload.people.primarySide).toBe("BRIDE");
    expect(payload.people.secondarySide).toBe("GROOM");
    expect(payload.operationalSides).toEqual(["BRIDE"]);
    expect(payload.events.map((e) => e.id)).toEqual(["b-vuquy", "b-reception", "c-custom"]);
    expect(payload.ceremony).toEqual({
      eventId: "b-vuquy",
      occasionType: "VU_QUY",
      title: "Lễ Vu Quy",
      startsAt: "2026-10-17T02:00:00.000Z",
      timezone: "Asia/Ho_Chi_Minh",
      lunarDateDisplay: "07/09 Âm lịch",
    });
    expect(Object.keys(payload.gift)).toEqual(["bride"]);
    expect(payload.media.qr).toEqual({ brideMediaId: "m-qr-bride" });
    expect(payload.sections.gift).toBe(true);
  });

  it.each<InvitationVariant>(["COMMON", "GROOM", "BRIDE"])("%s: events and ceremony match RF-01 exactly", (variant) => {
    const payload = success({ variant });
    const resolution = resolveWeddingDomain({ variant, weddingDetails: details(), events });
    if (resolution.status !== "RESOLVED") throw new Error("fixture must resolve");
    expect(payload.events.map((e) => e.id)).toEqual(resolution.visibleEvents.map((e) => e.id));
    expect(payload.ceremony.eventId).toBe(resolution.ceremony.eventId);
    expect(payload.ceremony.title).toBe(resolution.ceremony.title);
    expect(payload.people.primarySide).toBe(resolution.primarySide);
    expect(payload.people.secondarySide).toBe(resolution.secondarySide);
    expect(payload.operationalSides).toEqual(resolution.operationalSides);
  });

  it("people and families carry explicit sides and exact values", () => {
    const payload = success();
    expect(payload.people.groom).toEqual({ side: "GROOM", name: "Nguyễn Văn Minh" });
    expect(payload.people.bride).toEqual({ side: "BRIDE", name: "Trần Thị Lan" });
    expect(payload.families).toEqual({
      groom: { side: "GROOM", father: "Nguyễn Văn A", mother: "Lê Thị B", address: "Hà Nội" },
      bride: { side: "BRIDE", father: "Trần Văn C", mother: "Phạm Thị D", address: "Hải Phòng" },
    });
  });

  it("event entries hold exactly the frozen rendering fields", () => {
    const payload = success();
    const reception = payload.events.find((e) => e.id === "g-reception");
    expect(reception).toEqual({
      id: "g-reception",
      occasionType: "RECEPTION",
      side: "GROOM",
      title: "Tiệc cưới nhà trai",
      startsAt: "2026-10-18T05:00:00.000Z",
      timezone: "Asia/Ho_Chi_Minh",
      venueName: "Nhà hàng A",
      address: "Hà Nội",
      mapUrl: "https://maps.example/a",
      description: "Tiệc",
      sortOrder: 3,
      isPrimary: false,
      lunarDateDisplay: null,
    });
  });

  it("ceremony title is the business title while the event keeps its own title and lunar text", () => {
    const payload = success();
    const ceremonyEntry = payload.events.find((e) => e.id === payload.ceremony.eventId);
    expect(ceremonyEntry?.title).toBe("Lễ Thành Hôn nhà trai");
    expect(payload.ceremony.lunarDateDisplay).toBe(ceremonyEntry?.lunarDateDisplay);
    expect(payload.ceremony.startsAt).toBe(ceremonyEntry?.startsAt);
    expect(payload.ceremony.timezone).toBe(ceremonyEntry?.timezone);
  });

  it("ceremony lunar is null when the ceremony event has none, never the legacy value", () => {
    const noLunar = events.map((e) => (e.id === "g-thanhhon" ? { ...e, lunarDateDisplay: null } : e));
    const payload = success({ events: noLunar });
    expect(payload.ceremony.lunarDateDisplay).toBeNull();
    expect(JSON.stringify(payload)).not.toContain(LEGACY_LUNAR);
  });

  it("content passes canonical values through unchanged", () => {
    const payload = success({ weddingDetails: details({ invitationMessage: "  Kính mời  ", loveStory: null }) });
    expect(payload.content).toEqual({ invitationMessage: "  Kính mời  ", loveStory: null });
  });

  it("has exactly the frozen top-level keys", () => {
    expect(Object.keys(success()).sort()).toEqual(
      [
        "payloadSchemaVersion",
        "project",
        "template",
        "variant",
        "people",
        "families",
        "ceremony",
        "events",
        "operationalSides",
        "content",
        "gift",
        "media",
        "sections",
        "design",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Gift / QR (S7, S8, S9)
// ---------------------------------------------------------------------------

describe("gift and QR", () => {
  it("1: whitespace-only bank text with no QR is not meaningful", () => {
    const payload = success({
      variant: "GROOM",
      weddingDetails: details({ ...noGift, groomBankName: "   ", groomBankAccountNumber: "\t" }),
    });
    expect(payload.gift).toEqual({});
    expect(payload.sections.gift).toBe(false);
  });

  it("2: a QR-only operational side is meaningful", () => {
    const payload = success({ variant: "BRIDE", weddingDetails: details({ ...noGift, brideBankQrMediaId: "m-qr-bride" }) });
    expect(payload.gift).toEqual({
      bride: { side: "BRIDE", bankName: null, bankAccountName: null, bankAccountNumber: null, bankQrMediaId: "m-qr-bride" },
    });
    expect(payload.media.qr).toEqual({ brideMediaId: "m-qr-bride" });
    expect(payload.sections.gift).toBe(true);
  });

  it("3: GROOM never exposes bride gift or QR", () => {
    const payload = success({
      variant: "GROOM",
      weddingDetails: details({ groomBankName: null, groomBankAccountName: null, groomBankAccountNumber: null, groomBankQrMediaId: null }),
    });
    expect(payload.gift).toEqual({});
    expect(payload.media.qr).toEqual({});
    expect(payload.sections.gift).toBe(false);
    const json = JSON.stringify(payload);
    expect(json).not.toContain("Techcombank");
    expect(json).not.toContain("1903123456789");
    expect(json).not.toContain("m-qr-bride");
  });

  it("4: BRIDE never exposes groom gift or QR", () => {
    const payload = success({
      variant: "BRIDE",
      weddingDetails: details({ brideBankName: null, brideBankAccountName: null, brideBankAccountNumber: null, brideBankQrMediaId: null }),
    });
    expect(payload.gift).toEqual({});
    expect(payload.media.qr).toEqual({});
    expect(payload.sections.gift).toBe(false);
    const json = JSON.stringify(payload);
    expect(json).not.toContain("Vietcombank");
    expect(json).not.toContain("0011001234567");
    expect(json).not.toContain("m-qr-groom");
  });

  it("5: COMMON with both sides meaningful includes both with the §2.7 field set", () => {
    const payload = success({ variant: "COMMON" });
    expect(payload.gift).toEqual({
      groom: { side: "GROOM", bankName: "Vietcombank", bankAccountName: "NGUYEN VAN MINH", bankAccountNumber: "0011001234567", bankQrMediaId: "m-qr-groom" },
      bride: { side: "BRIDE", bankName: "Techcombank", bankAccountName: "TRAN THI LAN", bankAccountNumber: "1903123456789", bankQrMediaId: "m-qr-bride" },
    });
  });

  it("6: no meaningful operational side gives an empty gift object", () => {
    const payload = success({ variant: "COMMON", weddingDetails: details(noGift) });
    expect(payload.gift).toEqual({});
    expect(payload.sections.gift).toBe(false);
  });

  it("keeps stored whitespace in a meaningful side's other fields", () => {
    const payload = success({ variant: "GROOM", weddingDetails: details({ ...noGift, groomBankName: "  ", groomBankAccountNumber: " 123 " }) });
    expect(payload.gift.groom).toEqual({ side: "GROOM", bankName: "  ", bankAccountName: null, bankAccountNumber: " 123 ", bankQrMediaId: null });
  });

  it("COMMON with only one meaningful side omits the other", () => {
    const payload = success({ variant: "COMMON", weddingDetails: details({ ...noGift, brideBankAccountNumber: "999" }) });
    expect(Object.keys(payload.gift)).toEqual(["bride"]);
  });

  it("never creates commonMediaId, even with a QR_COMMON project media row", () => {
    for (const variant of ["COMMON", "GROOM", "BRIDE"] as const) {
      const payload = success({ variant });
      expect("commonMediaId" in payload.media.qr).toBe(false);
      expect(JSON.stringify(payload)).not.toContain("m-qr-common");
    }
  });

  it("QR ids come from the wedding_details pointer, not from QR_* media rows", () => {
    const payload = success({ variant: "GROOM", weddingDetails: details({ groomBankQrMediaId: "m-unreferenced" }) });
    expect(payload.media.qr).toEqual({ groomMediaId: "m-unreferenced" });
    const withoutQrRows = success({ variant: "GROOM", media: media.filter((m) => !m.mediaType.startsWith("QR_")) });
    expect(withoutQrRows.media.qr).toEqual({ groomMediaId: "m-qr-groom" });
  });
});

// ---------------------------------------------------------------------------
// Media (RF11 rule C)
// ---------------------------------------------------------------------------

describe("media", () => {
  it("selects cover/audio by canonical order and keeps the gallery in canonical order", () => {
    const payload = success();
    expect(payload.media.coverMediaId).toBe("m-cover-1");
    expect(payload.media.audioMediaId).toBe("m-audio");
    expect(payload.media.galleryMediaIds).toEqual(["m-gallery-c", "m-gallery-a", "m-gallery-b"]);
  });

  it("does not depend on the source media array order", () => {
    const base = success();
    expect(success({ media: [...media].reverse() }).media).toEqual(base.media);
    expect(success({ media: [media[4], media[2], media[0], ...media.slice(5), media[1], media[3]] }).media).toEqual(base.media);
  });

  it("with no media, stores an empty gallery and omits cover/audio", () => {
    const payload = success({ media: [] });
    expect(payload.media.galleryMediaIds).toEqual([]);
    expect("coverMediaId" in payload.media).toBe(false);
    expect("audioMediaId" in payload.media).toBe(false);
    expect(payload.sections.gallery).toBe(false);
    expect(payload.sections.music).toBe(false);
  });

  it("does not require dimensions", () => {
    const withDims = media.map((m, i) => (i % 2 === 0 ? { ...m, width: 1200, height: 800 } : m));
    expect(success({ media: withDims }).media).toEqual(success().media);
  });

  it("stores stable ids only", () => {
    const json = JSON.stringify(success());
    expect(json).not.toContain(STORAGE_PATH);
    expect(json).not.toContain("project-media");
    expect(json).not.toContain("image/jpeg");
    expect(json).not.toContain("staff-user-1");
  });
});

describe("media reference extraction", () => {
  it("returns cover, gallery, audio, groom QR, bride QR in payload order", () => {
    expect(extractSnapshotMediaRefs(success())).toEqual([
      "m-cover-1",
      "m-gallery-c",
      "m-gallery-a",
      "m-gallery-b",
      "m-audio",
      "m-qr-groom",
      "m-qr-bride",
    ]);
  });

  it("excludes unreferenced media and the QR_COMMON row", () => {
    const refs = extractSnapshotMediaRefs(success());
    expect(refs).not.toContain("m-unreferenced");
    expect(refs).not.toContain("m-qr-common");
    expect(refs).not.toContain("m-cover-2");
  });

  it("follows variant QR filtering", () => {
    expect(extractSnapshotMediaRefs(success({ variant: "GROOM" }))).not.toContain("m-qr-bride");
    expect(extractSnapshotMediaRefs(success({ variant: "BRIDE" }))).not.toContain("m-qr-groom");
  });

  it("deduplicates, keeping the first occurrence", () => {
    const payload = success({ weddingDetails: details({ groomBankQrMediaId: "m-gallery-a", brideBankQrMediaId: "m-gallery-a" }) });
    expect(extractSnapshotMediaRefs(payload)).toEqual(["m-cover-1", "m-gallery-c", "m-gallery-a", "m-gallery-b", "m-audio"]);
  });

  it("returns [] when nothing is referenced", () => {
    expect(extractSnapshotMediaRefs(success({ media: [], weddingDetails: details(noGift) }))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sections (S1–S7, S10)
// ---------------------------------------------------------------------------

describe("sections", () => {
  it("has exactly the five frozen keys", () => {
    expect(Object.keys(success().sections).sort()).toEqual(["gallery", "gift", "invitationMessage", "loveStory", "music"]);
  });

  it.each([
    [null, false],
    ["", false],
    ["  \n\t ", false],
    ["Trân trọng", true],
  ])("invitationMessage / loveStory %j -> %s", (value, expected) => {
    const payload = success({ weddingDetails: details({ invitationMessage: value, loveStory: value }) });
    expect(payload.sections.invitationMessage).toBe(expected);
    expect(payload.sections.loveStory).toBe(expected);
  });

  it("gallery and music follow media presence", () => {
    expect(success({ media: [] }).sections).toMatchObject({ gallery: false, music: false });
    expect(success({ media: [mediaRow("g", "GALLERY", 0)] }).sections).toMatchObject({ gallery: true, music: false });
    expect(success({ media: [mediaRow("a", "AUDIO", 0)] }).sections).toMatchObject({ gallery: false, music: true });
  });

  it("gift: text-only, QR-only and opposite-side-only", () => {
    expect(success({ variant: "GROOM", weddingDetails: details({ ...noGift, groomBankName: "VCB" }) }).sections.gift).toBe(true);
    expect(success({ variant: "GROOM", weddingDetails: details({ ...noGift, groomBankQrMediaId: "m-qr-groom" }) }).sections.gift).toBe(true);
    expect(success({ variant: "GROOM", weddingDetails: details({ ...noGift, brideBankName: "TCB", brideBankQrMediaId: "m-qr-bride" }) }).sections.gift).toBe(false);
    expect(success({ variant: "BRIDE", weddingDetails: details({ ...noGift, groomBankName: "VCB" }) }).sections.gift).toBe(false);
  });

  it("is never changed by design.sectionSettings", () => {
    const allOff = success({ design: design({ sectionSettings: { invitationMessage: false, loveStory: false, gallery: false, music: false, gift: false } }) });
    const allOn = success({ design: design({ sectionSettings: { invitationMessage: true, loveStory: true, gallery: true, music: true, gift: true } }) });
    const empty = success({ design: design({ sectionSettings: {} }) });
    const expected = { invitationMessage: true, loveStory: true, gallery: true, music: true, gift: true };
    expect(allOff.sections).toEqual(expected);
    expect(allOn.sections).toEqual(expected);
    expect(empty.sections).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// Design snapshot
// ---------------------------------------------------------------------------

describe("design snapshot", () => {
  it("copies the five design fields unchanged", () => {
    expect(success().design).toEqual({
      paletteKey: "ivory",
      fontPresetKey: "editorial-serif",
      effectPresetKey: "light",
      sectionSettings: { gallery: false, loveStory: false, gift: false, music: false, invitationMessage: false },
      designSettings: { heroLayout: "split", ornamentScale: 1.5 },
    });
  });

  it("copies a __proto__ key as data without altering the prototype", () => {
    const settings = JSON.parse('{"__proto__": "x", "a": 1}') as Record<string, string | number>;
    const payload = success({ design: design({ designSettings: settings }) });
    expect(Object.getPrototypeOf(payload.design.designSettings)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(payload.design.designSettings))).toEqual(settings);
  });
});

// ---------------------------------------------------------------------------
// Leak protection
// ---------------------------------------------------------------------------

describe("unknown-key and internal leak protection", () => {
  function withUnknown<T extends object>(value: T): T {
    return { ...value, [UNKNOWN_KEY]: UNKNOWN_VALUE, guestDisplayName: "GUEST_MUST_NOT_LEAK", rsvpState: "RSVP_MUST_NOT_LEAK", signedUrl: "https://signed.example/SIGNED_URL_MUST_NOT_LEAK", internalNote: "STAFF_NOTE_MUST_NOT_LEAK" };
  }

  const payload = success({
    project: withUnknown({ ...project, status: "IN_PROGRESS", customer: { name: "CUSTOMER_MUST_NOT_LEAK" } }),
    weddingDetails: withUnknown(details()),
    events: events.map(withUnknown),
    media: media.map(withUnknown),
    design: withUnknown(design()),
    templateVersion: withUnknown({ ...templateVersion, manifest: { secret: "MANIFEST_MUST_NOT_LEAK" } }),
  });
  const json = JSON.stringify(payload);

  it.each([
    UNKNOWN_KEY,
    UNKNOWN_VALUE,
    "GUEST_MUST_NOT_LEAK",
    "RSVP_MUST_NOT_LEAK",
    "SIGNED_URL_MUST_NOT_LEAK",
    "STAFF_NOTE_MUST_NOT_LEAK",
    "CUSTOMER_MUST_NOT_LEAK",
    "IN_PROGRESS",
    "MANIFEST_MUST_NOT_LEAK",
    LEGACY_LUNAR,
    ADDITIONAL_NOTE,
    EVENT_CREATED_AT,
    EVENT_UPDATED_AT,
    STORAGE_PATH,
    PROJECT_ID,
    "createdAt",
    "updatedAt",
    "projectId",
    "additionalNote",
    "storagePath",
  ])("serialized payload does not contain %s", (sentinel) => {
    expect(json).not.toContain(sentinel);
  });

  it("event entries have exactly the frozen keys even with extra runtime keys", () => {
    for (const entry of payload.events) {
      expect(Object.keys(entry).sort()).toEqual(
        ["id", "occasionType", "side", "title", "startsAt", "timezone", "venueName", "address", "mapUrl", "description", "sortOrder", "isPrimary", "lunarDateDisplay"].sort(),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// JSON / determinism / mutation safety
// ---------------------------------------------------------------------------

describe("JSON serialization", () => {
  it.each<InvitationVariant>(["COMMON", "GROOM", "BRIDE"])("%s payload survives a JSON round trip", (variant) => {
    const payload = success({ variant });
    const roundTripped = JSON.parse(JSON.stringify(payload)) as SnapshotPayloadV1;
    expect(roundTripped).toStrictEqual(payload);
    expect(roundTripped.payloadSchemaVersion).toBe(1);
    expect(extractSnapshotMediaRefs(roundTripped)).toEqual(extractSnapshotMediaRefs(payload));
  });

  it("contains no undefined values", () => {
    const visit = (value: unknown): void => {
      expect(value).not.toBeUndefined();
      if (value !== null && typeof value === "object") {
        for (const child of Object.values(value)) visit(child);
      }
    };
    visit(success({ media: [], weddingDetails: details(noGift) }));
    visit(success());
  });
});

describe("determinism", () => {
  it("ignores event/media input order, object identity and JSON reconstruction", () => {
    const base = success();
    expect(success({ events: [...events].reverse(), media: [...media].reverse() })).toStrictEqual(base);
    expect(success(structuredClone(input()))).toStrictEqual(base);
    expect(success(JSON.parse(JSON.stringify(input())) as BuildSnapshotPayloadInput)).toStrictEqual(base);
  });
});

describe("input mutation safety", () => {
  it("does not mutate any input", () => {
    const original = input();
    const frozenCopy = structuredClone(original);
    success(original);
    expect(original).toStrictEqual(frozenCopy);
  });

  it("does not share mutable objects with the input", () => {
    const source = input();
    const payload = success(source);

    payload.design.sectionSettings.gallery = true;
    payload.design.designSettings.heroLayout = "changed";
    payload.events[0].title = "changed";
    payload.operationalSides.push("GROOM");
    if (payload.gift.groom) payload.gift.groom.bankName = "changed";

    expect(source.design.sectionSettings.gallery).toBe(false);
    expect(source.design.designSettings.heroLayout).toBe("split");
    expect(source.events.every((e) => e.title !== "changed")).toBe(true);
    expect(source.weddingDetails?.groomBankName).toBe("Vietcombank");
    expect(success(source)).toStrictEqual(success());
  });

  it("two builds do not share objects", () => {
    const a = success();
    const b = success();
    expect(a.design.sectionSettings).not.toBe(b.design.sectionSettings);
    expect(a.events[0]).not.toBe(b.events[0]);
  });
});
