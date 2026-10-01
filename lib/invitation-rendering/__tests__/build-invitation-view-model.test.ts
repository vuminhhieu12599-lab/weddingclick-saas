import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { InvitationVariant } from "../../domain";
import { buildInvitationViewModel } from "../build-invitation-view-model";
import { buildSnapshotPayload } from "../build-snapshot-payload";
import { extractSnapshotMediaRefs } from "../extract-snapshot-media-refs";
import type {
  BuildInvitationViewModelInput,
  GuestOverlay,
  InvitationViewModel,
  MediaResolution,
} from "../invitation-view-model-types";
import { InvitationViewModelInvariantError } from "../media-resolution";
import { resolveSnapshotMedia } from "../resolve-snapshot-media";
import type { SnapshotPayloadV1 } from "../snapshot-payload-types";
import {
  ADAPTER_SENTINELS,
  RUNTIME_URL_MARKER,
  deepFreeze,
  recordingResolver,
  resolved,
  runtimeUrl,
  snapshot,
  unavailable,
  withAdapterSentinels,
} from "./invitation-view-model-fixtures";

afterEach(() => {
  vi.restoreAllMocks();
});

function completeSet(payload: SnapshotPayloadV1, overrides: Record<string, MediaResolution> = {}): MediaResolution[] {
  return extractSnapshotMediaRefs(payload).map((id) => overrides[id] ?? resolved(id));
}

function build(
  payload: SnapshotPayloadV1 = snapshot(),
  options: { guest?: GuestOverlay; overrides?: Record<string, MediaResolution>; set?: MediaResolution[] } = {},
): InvitationViewModel {
  const input: BuildInvitationViewModelInput = {
    snapshot: payload,
    mediaResolutions: options.set ?? completeSet(payload, options.overrides),
  };
  if (options.guest !== undefined) input.guest = options.guest;
  return buildInvitationViewModel(input);
}

// ---------------------------------------------------------------------------
// Snapshot-only canonical mapping
// ---------------------------------------------------------------------------

describe("buildInvitationViewModel — Snapshot-only non-media mapping (V7–V9)", () => {
  it("copies identity, people, families, ceremony, events, content, gift, sections and design from the Snapshot", () => {
    const payload = snapshot({ variant: "COMMON" });
    const vm = build(payload);

    expect(vm.project).toEqual({ code: "WC-2026-0001" });
    expect(vm.template).toEqual({
      templateVersionId: "tv-elegant-editorial-1",
      rendererKey: "wedding.elegant-editorial.v1",
    });
    expect(vm.variant).toBe("COMMON");
    expect(vm.people.groom).toEqual(payload.people.groom);
    expect(vm.people.bride).toEqual(payload.people.bride);
    expect(vm.families.groom).toEqual(payload.families.groom);
    expect(vm.families.bride).toEqual(payload.families.bride);
    expect(vm.ceremony).toEqual(payload.ceremony);
    expect(vm.events).toEqual(payload.events);
    expect(vm.operationalSides).toEqual(["GROOM", "BRIDE"]);
    // The fixture Snapshot predates the RF7 Timeline amendment: absent timeline reads as [] / false.
    expect("timeline" in payload.content).toBe(false);
    expect(vm.content).toEqual({ ...payload.content, timeline: [], dressCode: null });
    expect(vm.gift).toEqual(payload.gift);
    expect(vm.sections).toEqual({ ...payload.sections, timeline: false, dressCode: false, photoStory: false });
    expect(vm.design).toEqual(payload.design);
  });

  it("has exactly the frozen top-level keys: no RSVP, capabilities, formatted dates or visibility", () => {
    const vm = build(snapshot(), { guest: { displayName: "Anh Hiếu và gia đình" } });

    expect(Object.keys(vm).sort()).toEqual(
      [
        "ceremony",
        "ceremonyCards",
        "content",
        "design",
        "events",
        "families",
        "gift",
        "guest",
        "media",
        "operationalSides",
        "people",
        "project",
        "sections",
        "template",
        "variant",
      ].sort(),
    );
    const serialized = JSON.stringify(vm);
    for (const forbidden of [
      "rsvp",
      "canRsvp",
      "submitRsvp",
      "capabilities",
      "weekday",
      "displayDate",
      "displayTime",
      "countdown",
      "daysUntil",
      "calendar",
      "sectionCapabilities",
      "visibility",
      "payloadSchemaVersion",
    ]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it("carries canonical temporal values only", () => {
    const vm = build(snapshot({ variant: "BRIDE" }));

    expect(Object.keys(vm.ceremony).sort()).toEqual(
      ["eventId", "lunarDateDisplay", "occasionType", "startsAt", "timezone", "title"].sort(),
    );
    expect(vm.ceremony.startsAt).toBe("2026-10-17T02:00:00.000Z");
    expect(vm.ceremony.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(vm.ceremony.lunarDateDisplay).toBe("07/09 Âm lịch");
    expect(vm.ceremony.title).toBe("Lễ Vu Quy");
  });

  it("keeps Snapshot event order without re-sorting", () => {
    const payload = snapshot();
    expect(payload.events.map((event) => event.sortOrder)).toEqual([5, 1]);

    const vm = build(payload);

    expect(vm.events.map((event) => event.id)).toEqual(["g-thanhhon", "c-reception"]);
  });

  it.each<[InvitationVariant, "GROOM" | "BRIDE", "GROOM" | "BRIDE"]>([
    ["COMMON", "GROOM", "BRIDE"],
    ["GROOM", "GROOM", "BRIDE"],
    ["BRIDE", "BRIDE", "GROOM"],
  ])("%s: primary/secondary follow the Snapshot sides by explicit role", (variant, primary, secondary) => {
    const vm = build(snapshot({ variant }));

    expect(vm.people.primarySide).toBe(primary);
    expect(vm.people.secondarySide).toBe(secondary);
    expect(vm.people.primary.side).toBe(primary);
    expect(vm.people.secondary.side).toBe(secondary);
    expect(vm.families.primary.side).toBe(primary);
    expect(vm.families.secondary.side).toBe(secondary);
    expect(vm.people.primary).toEqual(primary === "GROOM" ? vm.people.groom : vm.people.bride);
    expect(vm.people.primary).not.toBe(primary === "GROOM" ? vm.people.groom : vm.people.bride);
  });

  it("rejects a Snapshot whose primary and secondary sides are not distinct couple sides", () => {
    const payload = snapshot();
    payload.people.secondarySide = "GROOM";

    expect(() => build(payload)).toThrow(InvitationViewModelInvariantError);
  });

  it("does not expose a gift side the Snapshot omitted", () => {
    const vm = build(snapshot({ variant: "GROOM" }));

    expect(Object.keys(vm.gift)).toEqual(["groom"]);
    expect(vm.gift.bride).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Resolution-set invariants (M5, V10)
// ---------------------------------------------------------------------------

describe("buildInvitationViewModel — complete resolution set (M5)", () => {
  it("throws for a referenced id with no result, instead of treating it as UNAVAILABLE", () => {
    const payload = snapshot();
    const set = completeSet(payload).filter((result) => result.mediaId !== "m-g2");

    expect(() => build(payload, { set })).toThrow(InvitationViewModelInvariantError);
    expect(() => build(payload, { set })).toThrow(/Missing media resolution.*m-g2/);
  });

  it("throws for a result whose id the Snapshot does not reference", () => {
    const payload = snapshot();
    const set = [...completeSet(payload), resolved("m-unreferenced")];

    expect(() => build(payload, { set })).toThrow(/not referenced by the Snapshot/);
  });

  it("throws for duplicate results for the same id, even when they agree", () => {
    const payload = snapshot();
    const set = [...completeSet(payload), resolved("m-cover")];

    expect(() => build(payload, { set })).toThrow(/Duplicate media resolution.*m-cover/);
  });

  it("throws for a malformed supplied result (empty url)", () => {
    const payload = snapshot();
    const set = completeSet(payload, {
      "m-cover": { status: "RESOLVED", mediaId: "m-cover", url: " ", width: null, height: null },
    });

    expect(() => build(payload, { set })).toThrow(InvitationViewModelInvariantError);
  });

  it("does not depend on result order or object identity", () => {
    const payload = snapshot();
    const set = completeSet(payload, { "m-g2": unavailable("m-g2") });

    const forward = build(payload, { set });
    const reversed = build(structuredClone(payload), { set: structuredClone(set).reverse() });

    expect(reversed).toStrictEqual(forward);
  });
});

// ---------------------------------------------------------------------------
// Media slots (M6–M10, M13)
// ---------------------------------------------------------------------------

describe("buildInvitationViewModel — cover, gallery and audio slots", () => {
  it("has no cover or audio slot when the Snapshot references none", () => {
    const payload = snapshot({ media: { galleryMediaIds: [], qr: {} }, gift: {} });

    const vm = build(payload, { set: [] });

    expect("cover" in vm.media).toBe(false);
    expect("audio" in vm.media).toBe(false);
    expect(vm.media.gallery).toEqual([]);
    expect(vm.media.qr).toEqual({});
  });

  it("keeps a referenced UNAVAILABLE cover as a present slot", () => {
    const vm = build(snapshot(), { overrides: { "m-cover": unavailable("m-cover") } });

    expect(vm.media.cover).toStrictEqual({ status: "UNAVAILABLE", mediaId: "m-cover" });
  });

  it("maps a RESOLVED cover with its runtime url and dimensions", () => {
    const vm = build(snapshot());

    expect(vm.media.cover).toStrictEqual({
      status: "RESOLVED",
      mediaId: "m-cover",
      url: runtimeUrl("m-cover"),
      width: 1200,
      height: 800,
    });
  });

  it("keeps one gallery item per Snapshot id, same order, with UNAVAILABLE items in place", () => {
    const payload = snapshot({
      media: { galleryMediaIds: ["m-g3", "m-g1", "m-g2", "m-g0"], qr: {} },
      gift: {},
    });

    const vm = build(payload, {
      overrides: { "m-g1": unavailable("m-g1"), "m-g0": unavailable("m-g0") },
    });

    expect(vm.media.gallery).toHaveLength(4);
    expect(vm.media.gallery.map((item) => item.mediaId)).toEqual(["m-g3", "m-g1", "m-g2", "m-g0"]);
    expect(vm.media.gallery.map((item) => item.status)).toEqual([
      "RESOLVED",
      "UNAVAILABLE",
      "RESOLVED",
      "UNAVAILABLE",
    ]);
    expect(vm.media.gallery[1]).toStrictEqual({ status: "UNAVAILABLE", mediaId: "m-g1" });
  });

  it("keeps a referenced UNAVAILABLE audio slot with no url or playback state", () => {
    const vm = build(snapshot(), { overrides: { "m-audio": unavailable("m-audio") } });

    expect(vm.media.audio).toStrictEqual({ status: "UNAVAILABLE", mediaId: "m-audio" });
  });

  it("keeps RESOLVED media with null dimensions as RESOLVED, with no fabricated dimensions", () => {
    const vm = build(snapshot(), { overrides: { "m-g1": resolved("m-g1", null, null) } });

    expect(vm.media.gallery[0]).toStrictEqual({
      status: "RESOLVED",
      mediaId: "m-g1",
      url: runtimeUrl("m-g1"),
      width: null,
      height: null,
    });
  });

  it("reuses one result for every role that references the same id, as separate owned slots", () => {
    const payload = snapshot({
      media: { coverMediaId: "m-shared", galleryMediaIds: ["m-shared", "m-g1"], qr: {} },
      gift: {},
    });

    const vm = build(payload, { overrides: { "m-shared": unavailable("m-shared") } });

    expect(vm.media.cover).toStrictEqual(vm.media.gallery[0]);
    expect(vm.media.cover).not.toBe(vm.media.gallery[0]);
  });
});

// ---------------------------------------------------------------------------
// QR (M10, M11)
// ---------------------------------------------------------------------------

// RF7 Timeline amendment: ordered Snapshot values copied unchanged; older v1 payloads read as [] / false.
describe("buildInvitationViewModel — timeline", () => {
  it("copies the ordered Snapshot timeline and sections.timeline as owned values", () => {
    const base = snapshot();
    const payload = {
      ...base,
      content: { ...base.content, timeline: [{ id: "t-2", time: "11:00", label: "Khai tiệc" }, { id: "t-1", time: "08:30", label: "Đón khách" }] },
      sections: { ...base.sections, timeline: true },
    };
    const vm = build(payload);
    expect(vm.content.timeline).toEqual(payload.content.timeline);
    expect(vm.content.timeline[0]).not.toBe(payload.content.timeline[0]);
    expect(vm.sections.timeline).toBe(true);
  });
});

// RF7 Photo Story / Love Story photo amendment: own slots only, resolved through the injected resolver.
describe("[media-batch] buildInvitationViewModel — Photo Story and Love Story photo slots", () => {
  it("[media-batch] older payloads give [] / absent; referenced ids keep order and runtime state", async () => {
    const legacy = build(snapshot());
    expect(legacy.media.photoStory).toEqual([]);
    expect("loveStoryPhoto" in legacy.media).toBe(false);
    const base = snapshot();
    const payload = { ...base, media: { ...base.media, photoStoryMediaIds: ["ps-1", "ps-2"], loveStoryPhotoMediaId: "ls" } };
    const resolver = recordingResolver({ "ps-2": (id) => unavailable(id) });
    const vm = buildInvitationViewModel({ snapshot: payload, mediaResolutions: await resolveSnapshotMedia(payload, resolver) });
    expect(resolver.calls.slice(-3)).toEqual(["ps-1", "ps-2", "ls"]);
    expect(vm.media.photoStory).toEqual([resolved("ps-1"), { status: "UNAVAILABLE", mediaId: "ps-2" }]);
    expect(vm.media.loveStoryPhoto).toEqual(resolved("ls"));
    expect(vm.media.gallery.map((item) => item.mediaId)).toEqual(base.media.galleryMediaIds);
  });
});

// RF7 Dress Code amendment: owned copy; colours re-checked because they become inline CSS.
describe("buildInvitationViewModel — dress code", () => {
  function withDressCode(dressCode: NonNullable<SnapshotPayloadV1["content"]["dressCode"]>) {
    const base = snapshot();
    return { ...base, content: { ...base.content, dressCode }, sections: { ...base.sections, dressCode: true } };
  }

  it("copies description and ordered swatches as owned values", () => {
    const payload = withDressCode({ description: "Tông màu ấm", swatches: [{ id: "s-1", color: "#caa06a" }, { id: "s-2", color: "#3d352b" }] });
    const vm = build(payload);
    expect(vm.content.dressCode).toEqual(payload.content.dressCode);
    expect(vm.content.dressCode?.swatches[0]).not.toBe(payload.content.dressCode.swatches[0]);
    expect(vm.sections.dressCode).toBe(true);
  });

  it.each(["red", "#CAA06A", "url(x)", "#caa06a;color:red", "var(--x)"])("rejects a persisted swatch colour %j", (color) => {
    expect(() => build(withDressCode({ description: null, swatches: [{ id: "s-1", color }] }))).toThrow(InvitationViewModelInvariantError);
  });
});

// RF2 "Ceremony-card presentation" (Micro-Checkpoint 7): runtime-only, derived from the Snapshot events.
describe("buildInvitationViewModel — ceremony cards", () => {
  it("derives owned copies with rite-derived titles and leaves events and event titles untouched", () => {
    const payload = snapshot({ variant: "COMMON" });
    const vm = build(payload);
    expect(vm.events.map((event) => event.id)).toEqual(payload.events.map((event) => event.id));
    // The COMMON fixture has a groom-side THANH_HON but no bride-side VU_QUY: one honest card, no substitute.
    expect(vm.ceremonyCards.map((card) => [card.side, card.title, card.event.id])).toEqual([["GROOM", "Lễ Thành Hôn", "g-thanhhon"]]);
    expect(vm.ceremonyCards[0]?.event.title).toBe("Lễ Thành Hôn nhà trai");
    expect(vm.ceremonyCards[0]?.event).toEqual(vm.events[0]);
    expect(vm.ceremonyCards[0]?.event).not.toBe(vm.events[0]);
    expect(payload).not.toHaveProperty("ceremonyCards");
  });

  it("BRIDE gets the bride-side Vu Quy card", () => {
    const vm = build(snapshot({ variant: "BRIDE" }));
    expect(vm.ceremonyCards.map((card) => [card.side, card.title, card.event.title])).toEqual([["BRIDE", "Lễ Vu Quy", "Lễ Vu Quy nhà gái"]]);
  });
});

// RF7 Product Owner amendment (2026-10-01): optional, additive portrait refs in payload v1.
describe("buildInvitationViewModel — portrait slots", () => {
  function withPortraits(portrait: NonNullable<SnapshotPayloadV1["media"]["portrait"]>, variant: InvitationVariant = "COMMON") {
    const base = snapshot({ variant });
    return { ...base, media: { ...base.media, portrait } };
  }

  it("an older v1 Snapshot without media.portrait gives two absent portrait slots and nothing else changes", () => {
    const legacy = snapshot();
    expect("portrait" in legacy.media).toBe(false);
    const vm = build(legacy);
    expect(vm.media.portrait).toEqual({});
    expect(Object.keys(vm.media).sort()).toEqual(["audio", "cover", "gallery", "photoStory", "portrait", "qr"]);
  });

  it("maps RESOLVED portraits with their runtime url and dimensions, for every variant", () => {
    for (const variant of ["COMMON", "GROOM", "BRIDE"] as const) {
      const vm = build(withPortraits({ groomMediaId: "m-portrait-groom", brideMediaId: "m-portrait-bride" }, variant));
      expect(vm.media.portrait.groom, variant).toEqual(resolved("m-portrait-groom"));
      expect(vm.media.portrait.bride, variant).toEqual(resolved("m-portrait-bride"));
    }
  });

  it("keeps a referenced UNAVAILABLE portrait as a present slot and an unreferenced side absent", () => {
    const vm = build(withPortraits({ groomMediaId: "m-portrait-groom" }), {
      overrides: { "m-portrait-groom": unavailable("m-portrait-groom") },
    });
    expect(vm.media.portrait.groom).toEqual({ status: "UNAVAILABLE", mediaId: "m-portrait-groom" });
    expect("bride" in vm.media.portrait).toBe(false);
    // Never filled from cover or gallery.
    expect(vm.media.cover).toEqual(resolved("m-cover"));
  });

  it("requires a resolution for every referenced portrait (M5): a missing one throws instead of becoming UNAVAILABLE", () => {
    const payload = withPortraits({ groomMediaId: "m-portrait-groom", brideMediaId: "m-portrait-bride" });
    const set = completeSet(payload).filter((entry) => entry.mediaId !== "m-portrait-bride");
    expect(() => build(payload, { set })).toThrow(InvitationViewModelInvariantError);
  });

  it("resolves portraits through the injected resolver once each, after every pre-portrait reference", async () => {
    const payload = withPortraits({ groomMediaId: "m-portrait-groom", brideMediaId: "m-portrait-bride" });
    const resolver = recordingResolver({ "m-portrait-bride": (id) => unavailable(id) });

    const set = await resolveSnapshotMedia(payload, resolver);
    const vm = buildInvitationViewModel({ snapshot: payload, mediaResolutions: set });

    expect(resolver.calls).toEqual([...extractSnapshotMediaRefs(snapshot()), "m-portrait-groom", "m-portrait-bride"]);
    expect(vm.media.portrait.groom?.status).toBe("RESOLVED");
    expect(vm.media.portrait.bride).toEqual({ status: "UNAVAILABLE", mediaId: "m-portrait-bride" });
  });
});

describe("buildInvitationViewModel — QR variant matrix and single reference", () => {
  it.each<[string, InvitationVariant, Record<string, MediaResolution>, Record<string, string>]>([
    ["COMMON groom RESOLVED / bride RESOLVED", "COMMON", {}, { groom: "RESOLVED", bride: "RESOLVED" }],
    [
      "COMMON groom RESOLVED / bride UNAVAILABLE",
      "COMMON",
      { "m-qr-bride": unavailable("m-qr-bride") },
      { groom: "RESOLVED", bride: "UNAVAILABLE" },
    ],
    [
      "COMMON groom UNAVAILABLE / bride RESOLVED",
      "COMMON",
      { "m-qr-groom": unavailable("m-qr-groom") },
      { groom: "UNAVAILABLE", bride: "RESOLVED" },
    ],
    ["GROOM groom only", "GROOM", {}, { groom: "RESOLVED" }],
    ["BRIDE bride only", "BRIDE", {}, { bride: "RESOLVED" }],
  ])("%s", (_label, variant, overrides, expected) => {
    const payload = snapshot({ variant });

    const vm = build(payload, { overrides });

    expect(Object.keys(vm.media.qr).sort()).toEqual(Object.keys(expected).sort());
    for (const [side, status] of Object.entries(expected)) {
      const qrSlot = vm.media.qr[side as "groom" | "bride"];
      expect(qrSlot?.status).toBe(status);
      expect(qrSlot?.mediaId).toBe(`m-qr-${side}`);
    }
    expect("common" in vm.media.qr).toBe(false);
  });

  it("keeps gift bank text and bankQrMediaId unchanged when the QR is UNAVAILABLE", () => {
    const payload = snapshot({ variant: "GROOM" });

    const vm = build(payload, { overrides: { "m-qr-groom": unavailable("m-qr-groom") } });

    expect(vm.gift.groom).toEqual(payload.gift.groom);
    expect(vm.media.qr.groom).toStrictEqual({ status: "UNAVAILABLE", mediaId: "m-qr-groom" });
    expect(vm.media.qr.bride).toBeUndefined();
  });

  it("never substitutes the opposite side's QR", () => {
    const vm = build(snapshot({ variant: "COMMON" }), {
      overrides: { "m-qr-groom": unavailable("m-qr-groom") },
    });

    expect(vm.media.qr.groom).toStrictEqual({ status: "UNAVAILABLE", mediaId: "m-qr-groom" });
    expect(vm.media.qr.bride?.mediaId).toBe("m-qr-bride");
  });

  it("resolves a gift QR through its media.qr id once, never through the gift pointer separately", async () => {
    const payload = snapshot({ variant: "COMMON" });
    const resolver = recordingResolver();

    const set = await resolveSnapshotMedia(payload, resolver);
    const vm = buildInvitationViewModel({ snapshot: payload, mediaResolutions: set });

    expect(resolver.calls.filter((id) => id === "m-qr-groom")).toHaveLength(1);
    expect(resolver.calls.filter((id) => id === "m-qr-bride")).toHaveLength(1);
    expect(vm.gift.groom?.bankQrMediaId).toBe(vm.media.qr.groom?.mediaId);
    expect(vm.gift.bride?.bankQrMediaId).toBe(vm.media.qr.bride?.mediaId);
  });

  it.each([
    ["gift pointer differs from media.qr", (p: SnapshotPayloadV1) => {
      if (p.gift.groom) p.gift.groom.bankQrMediaId = "m-qr-other";
    }],
    ["gift pointer set but media.qr absent", (p: SnapshotPayloadV1) => {
      delete p.media.qr.groomMediaId;
    }],
    ["media.qr set but gift pointer null", (p: SnapshotPayloadV1) => {
      if (p.gift.groom) p.gift.groom.bankQrMediaId = null;
    }],
    ["media.qr set but gift side absent", (p: SnapshotPayloadV1) => {
      delete p.gift.groom;
    }],
  ])("rejects a runtime-mutated Snapshot where the %s", (_label, mutate) => {
    const payload = snapshot({ variant: "COMMON" });
    mutate(payload);

    expect(() => build(payload)).toThrow(InvitationViewModelInvariantError);
  });

  it("accepts a gift side with no QR and no media.qr reference", () => {
    const payload = snapshot({ variant: "GROOM" });
    if (payload.gift.groom) payload.gift.groom.bankQrMediaId = null;
    delete payload.media.qr.groomMediaId;

    const vm = build(payload);

    expect(vm.gift.groom?.bankQrMediaId).toBeNull();
    expect(vm.media.qr).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// sections / design (V6, V7)
// ---------------------------------------------------------------------------

describe("buildInvitationViewModel — sections and design", () => {
  it("keeps sections as content availability when every gallery, audio and QR result is UNAVAILABLE", () => {
    const payload = snapshot();
    const set = extractSnapshotMediaRefs(payload).map(unavailable);

    const vm = build(payload, { set });

    expect(vm.sections).toEqual({
      invitationMessage: true,
      loveStory: false,
      gallery: true,
      music: true,
      gift: true,
      timeline: false,
      dressCode: false,
      photoStory: false,
    });
    expect(vm.media.gallery.every((item) => item.status === "UNAVAILABLE")).toBe(true);
  });

  it("does not apply design.sectionSettings to sections", () => {
    const payload = snapshot();
    expect(payload.design.sectionSettings).toEqual({ gallery: false, music: false });

    const vm = build(payload);

    expect(vm.sections.gallery).toBe(true);
    expect(vm.sections.music).toBe(true);
    expect(vm.design.sectionSettings).toEqual({ gallery: false, music: false });
  });

  it("owns its design objects: mutating the ViewModel design leaves the Snapshot unchanged", () => {
    const payload = snapshot();
    const before = structuredClone(payload);

    const vm = build(payload);
    vm.design.sectionSettings.gallery = true;
    vm.design.designSettings.heroLayout = "MUTATED";
    vm.design.paletteKey = "MUTATED";

    expect(payload).toStrictEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Guest overlay (V1)
// ---------------------------------------------------------------------------

describe("buildInvitationViewModel — guest overlay", () => {
  it("has no guest when no overlay is supplied, and invents no fallback name", () => {
    const vm = build(snapshot());

    expect("guest" in vm).toBe(false);
  });

  it.each(["Anh Hiếu và gia đình", "Em và sự cô đơn", "Team Marketing"])(
    "passes %s through exactly",
    (displayName) => {
      expect(build(snapshot(), { guest: { displayName } }).guest).toStrictEqual({ displayName });
    },
  );

  it("projects only displayName from a runtime overlay with extra keys", () => {
    const overlay = {
      displayName: "Chú B và người thương",
      guestId: "GUEST_ID_SENTINEL",
      token: "GUEST_TOKEN_SENTINEL",
      tokenHash: "TOKEN_HASH_SENTINEL",
      phone: "PHONE_SENTINEL",
      note: "INTERNAL_NOTE_SENTINEL",
    } as GuestOverlay;

    const vm = build(snapshot(), { guest: overlay });

    expect(vm.guest).toStrictEqual({ displayName: "Chú B và người thương" });
    expect(JSON.stringify(vm)).not.toMatch(/SENTINEL/);
  });

  it.each([
    ["an empty displayName", { displayName: "" }],
    ["a non-string displayName", { displayName: 42 }],
    ["a null overlay", null],
  ])("rejects %s", (_label, overlay) => {
    expect(() => build(snapshot(), { guest: overlay as unknown as GuestOverlay })).toThrow(
      InvitationViewModelInvariantError,
    );
  });

  it("isolates guests built from the same Snapshot and media results", () => {
    const payload = snapshot();
    const set = completeSet(payload);
    const payloadBefore = structuredClone(payload);
    const setBefore = structuredClone(set);

    const vmA = build(payload, { set, guest: { displayName: "Guest A" } });
    const vmB = build(payload, { set, guest: { displayName: "Guest B" } });

    const { guest: guestA, ...restA } = vmA;
    const { guest: guestB, ...restB } = vmB;
    expect(guestA).toEqual({ displayName: "Guest A" });
    expect(guestB).toEqual({ displayName: "Guest B" });
    expect(restA).toStrictEqual(restB);

    vmA.people.groom.name = "MUTATED";
    vmA.media.gallery[0] = unavailable("MUTATED");
    vmA.events[0].title = "MUTATED";
    expect(vmB.people.groom.name).toBe("Nguyễn Văn Minh");
    expect(vmB.media.gallery[0].mediaId).toBe("m-g1");
    expect(vmB.events[0].title).toBe("Lễ Thành Hôn nhà trai");
    expect(payload).toStrictEqual(payloadBefore);
    expect(set).toStrictEqual(setBefore);
    expect(JSON.stringify(payload)).not.toContain("Guest A");
  });
});

// ---------------------------------------------------------------------------
// Leaks, mutation safety, determinism, clock (V5, V10, V11)
// ---------------------------------------------------------------------------

describe("buildInvitationViewModel — leaks, mutation safety and determinism", () => {
  it("never leaks resolver extras into media slots", () => {
    const payload = snapshot();
    const set = extractSnapshotMediaRefs(payload).map((id) =>
      withAdapterSentinels(id === "m-g2" ? unavailable(id) : resolved(id)),
    );

    const vm = build(payload, { set });

    expect(JSON.stringify(vm)).not.toMatch(/SENTINEL/);
    expect(Object.keys(vm.media.cover ?? {}).sort()).toEqual(["height", "mediaId", "status", "url", "width"]);
    expect(Object.keys(vm.media.gallery[1]).sort()).toEqual(["mediaId", "status"]);
    for (const key of Object.keys(ADAPTER_SENTINELS)) {
      expect(JSON.stringify(vm)).not.toContain(`"${key}"`);
    }
  });

  it("never leaks unknown runtime keys attached to the Snapshot", () => {
    const payload = snapshot() as SnapshotPayloadV1 & Record<string, unknown>;
    const marker = "SNAPSHOT_RUNTIME_KEY_SENTINEL";
    payload.__unknown = marker;
    Object.assign(payload.people.groom, { __unknown: marker });
    Object.assign(payload.families.bride, { __unknown: marker });
    Object.assign(payload.ceremony, { __unknown: marker });
    Object.assign(payload.events[0], { __unknown: marker });
    Object.assign(payload.content, { __unknown: marker });
    Object.assign(payload.gift.groom ?? {}, { __unknown: marker });
    Object.assign(payload.media, { __unknown: marker });
    Object.assign(payload.sections, { __unknown: marker });
    Object.assign(payload.design, { __unknown: marker });
    Object.assign(payload.template, { __unknown: marker });
    Object.assign(payload.project, { __unknown: marker });

    const vm = build(payload);

    expect(JSON.stringify(vm)).not.toContain(marker);
  });

  it("does not mutate a deeply frozen Snapshot or frozen resolution inputs", () => {
    const payload = deepFreeze(snapshot());
    const set = deepFreeze(completeSet(payload, { "m-g2": unavailable("m-g2") }));
    const payloadBefore = structuredClone(payload);
    const setBefore = structuredClone(set);

    const vm = build(payload, { set });

    expect(payload).toStrictEqual(payloadBefore);
    expect(set).toStrictEqual(setBefore);
    expect(Object.isFrozen(vm.media.cover)).toBe(false);
  });

  it("owns every mutable child: mutating the ViewModel touches neither Snapshot nor results", () => {
    const payload = snapshot();
    const set = completeSet(payload);
    const payloadBefore = structuredClone(payload);
    const setBefore = structuredClone(set);

    const vm = build(payload, { set });
    if (vm.media.cover?.status === "RESOLVED") vm.media.cover.url = "MUTATED";
    vm.media.gallery.push(unavailable("MUTATED"));
    vm.events.reverse();
    vm.operationalSides.pop();
    vm.people.primary.name = "MUTATED";
    vm.families.groom.father = "MUTATED";
    if (vm.gift.groom) vm.gift.groom.bankName = "MUTATED";
    vm.sections.gallery = false;
    vm.content.invitationMessage = "MUTATED";

    expect(payload).toStrictEqual(payloadBefore);
    expect(set).toStrictEqual(setBefore);
    expect(vm.people.groom.name).toBe("Nguyễn Văn Minh");
  });

  it("never writes runtime URLs back into the Snapshot", () => {
    const payload = snapshot();

    const vm = build(payload);

    expect(JSON.stringify(vm)).toContain(RUNTIME_URL_MARKER);
    expect(JSON.stringify(payload)).not.toContain(RUNTIME_URL_MARKER);
    expect(JSON.stringify(payload)).not.toContain("https://media.example");
  });

  it("is deterministic across repeated builds and cloned/reconstructed inputs", () => {
    const payload = snapshot();
    const set = completeSet(payload, { "m-audio": unavailable("m-audio") });
    const guest = { displayName: "Anh Hiếu và gia đình" };

    const first = build(payload, { set, guest });
    const second = build(payload, { set, guest });
    const cloned = build(structuredClone(payload), {
      set: set.map((result) => ({ ...result })),
      guest: { ...guest },
    });

    expect(second).toStrictEqual(first);
    expect(cloned).toStrictEqual(first);
    expect(JSON.stringify(cloned)).toBe(JSON.stringify(first));
  });

  it("does not read the current time", () => {
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Date.now must not be called");
    });
    const perfNow = vi.spyOn(performance, "now").mockImplementation(() => {
      throw new Error("performance.now must not be called");
    });

    expect(() => build(snapshot(), { guest: { displayName: "Guest" } })).not.toThrow();
    expect(dateNow).not.toHaveBeenCalled();
    expect(perfNow).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Static boundary (A1, A2, V9)
// ---------------------------------------------------------------------------

describe("RF-03 production sources — static boundary", () => {
  const files = [
    "invitation-view-model-types.ts",
    "media-resolution.ts",
    "resolve-snapshot-media.ts",
    "build-invitation-view-model.ts",
  ];
  const sources = files.map((file) => [file, readFileSync(join(__dirname, "..", file), "utf8")] as const);

  it.each(sources)("%s imports only RF-01/RF-02/RF-03 modules and shared domain types", (_file, source) => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
    for (const specifier of imports) {
      expect(specifier === "../domain" || /^\.\/[a-z-]+$/.test(specifier)).toBe(true);
    }
  });

  it.each(sources)("%s contains no clock, network, storage, env, browser or record-type references", (_file, source) => {
    for (const forbidden of [
      /supabase/i,
      /service_role/,
      /fetch\(/,
      /process\.env/,
      /\bwindow\b/,
      /\bdocument\b/,
      /\bnavigator\b/,
      /localStorage|sessionStorage/,
      /Date\.now|new Date\(|performance\.now/,
      /sectionCapabilities|rsvpCapability|canRsvp|submitRsvp/,
      /prototypes/,
      /ProjectMediaRecord|WeddingDetailsRecord|ProjectEventRecord|ProjectDesignRecord|mediaType/,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });

  it("the pure builder never touches the resolver", () => {
    const builder = sources.find(([file]) => file === "build-invitation-view-model.ts")?.[1] ?? "";
    expect(builder).not.toMatch(/resolveMedia|MediaResolver|resolveSnapshotMedia|async|await|Promise/);
  });
});

// ---------------------------------------------------------------------------
// End-to-end with real RF-02 output
// ---------------------------------------------------------------------------

describe("RF-02 Snapshot → Layer A → Layer B", () => {
  const PROJECT_ID = "project-1";

  function rf02Snapshot(variant: InvitationVariant): SnapshotPayloadV1 {
    const result = buildSnapshotPayload({
      project: { id: PROJECT_ID, projectCode: "WC-2026-0001" },
      variant,
      weddingDetails: {
        projectId: PROJECT_ID,
        groomName: "Nguyễn Văn Minh",
        brideName: "Trần Thị Lan",
        groomFather: null,
        groomMother: null,
        brideFather: null,
        brideMother: null,
        groomFamilyAddress: null,
        brideFamilyAddress: null,
        invitationMessage: null,
        loveStory: null,
        groomBankName: "Vietcombank",
        groomBankAccountName: null,
        groomBankAccountNumber: null,
        groomBankQrMediaId: "m-qr-groom",
        brideBankName: "Techcombank",
        brideBankAccountName: null,
        brideBankAccountNumber: null,
        brideBankQrMediaId: "m-qr-bride",
      },
      events: [
        {
          id: "g-thanhhon",
          projectId: PROJECT_ID,
          occasionType: "THANH_HON",
          side: "COMMON",
          title: "Lễ Thành Hôn",
          startsAt: "2026-10-18T02:00:00.000Z",
          timezone: "Asia/Ho_Chi_Minh",
          venueName: null,
          address: null,
          mapUrl: null,
          description: null,
          sortOrder: 0,
          isPrimary: true,
          lunarDateDisplay: null,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        {
          id: "b-vuquy",
          projectId: PROJECT_ID,
          occasionType: "VU_QUY",
          side: "BRIDE",
          title: "Lễ Vu Quy",
          startsAt: "2026-10-17T02:00:00.000Z",
          timezone: "Asia/Ho_Chi_Minh",
          venueName: null,
          address: null,
          mapUrl: null,
          description: null,
          sortOrder: 1,
          isPrimary: true,
          lunarDateDisplay: null,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      media: [
        { id: "m-cover", projectId: PROJECT_ID, mediaType: "COVER", sortOrder: 0 },
        { id: "m-g1", projectId: PROJECT_ID, mediaType: "GALLERY", sortOrder: 0 },
        { id: "m-g2", projectId: PROJECT_ID, mediaType: "GALLERY", sortOrder: 1 },
        { id: "m-qr-groom", projectId: PROJECT_ID, mediaType: "QR_GROOM", sortOrder: 0 },
        { id: "m-qr-bride", projectId: PROJECT_ID, mediaType: "QR_BRIDE", sortOrder: 0 },
        { id: "m-qr-common", projectId: PROJECT_ID, mediaType: "QR_COMMON", sortOrder: 0 },
      ],
      timelineItems: [],
      dressCode: null,
      dressCodeSwatches: [],
      design: {
        projectId: PROJECT_ID,
        templateVersionId: "tv-1",
        paletteKey: "ivory",
        fontPresetKey: "serif",
        effectPresetKey: "light",
        sectionSettings: {},
        designSettings: {},
      },
      templateVersion: { id: "tv-1", rendererKey: "wedding.elegant-editorial.v1" },
    });
    if (result.status !== "SUCCESS") throw new Error("Expected SUCCESS");
    return result.payload;
  }

  it.each<[InvitationVariant, string[]]>([
    ["COMMON", ["groom", "bride"]],
    ["GROOM", ["groom"]],
    ["BRIDE", ["bride"]],
  ])("%s builds a ViewModel with QR slots only from Snapshot media.qr", async (variant, qrSides) => {
    const payload = rf02Snapshot(variant);
    const resolver = recordingResolver({ "m-g1": unavailable });

    const set = await resolveSnapshotMedia(payload, resolver);
    const vm = buildInvitationViewModel({ snapshot: payload, mediaResolutions: set });

    expect(Object.keys(vm.media.qr).sort()).toEqual([...qrSides].sort());
    expect(resolver.calls).not.toContain("m-qr-common");
    expect(new Set(resolver.calls).size).toBe(resolver.calls.length);
    expect(vm.media.gallery.map((item) => [item.mediaId, item.status])).toEqual([
      ["m-g1", "UNAVAILABLE"],
      ["m-g2", "RESOLVED"],
    ]);
    expect(vm.sections.gallery).toBe(true);
  });
});
