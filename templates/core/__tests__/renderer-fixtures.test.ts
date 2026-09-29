import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS, type InvitationVariant } from "../../../lib/domain";
import { RendererSelectionError } from "../../../lib/invitation-rendering/renderer-selection-errors";
import { createFixtureMediaResolver, FIXTURE_MEDIA_URL_BASE, fixtureMediaUrl } from "../fixtures/fixture-media-resolver";
import {
  RendererFixtureError,
  buildRendererFixture,
  runRendererFixturePipeline,
} from "../fixtures/renderer-fixture-pipeline";
import {
  FIXTURE_EVENT_IDS,
  FIXTURE_GUESTS,
  FIXTURE_MEDIA_IDS,
  FIXTURE_PROJECT_CODE,
  FIXTURE_TEMPLATE_VERSION_ID,
  buildRendererFixtureSourceInput,
} from "../fixtures/renderer-fixture-sources";
import { PRODUCTION_COMPATIBILITY_REGISTRY } from "../production-renderer-manifests";

/**
 * RF-06A deterministic pipeline fixtures (docs/DECISIONS.md "RF-06-0 …"
 * P23, P37, P38, P42): canonical fixture records through the real RF-02 →
 * RF-03 A → RF-03 B → RF-04 functions into the production registry.
 */

const EE_KEY = "wedding.elegant-editorial.v1";
const ALL_TRUE = { invitationMessage: true, loveStory: true, gallery: true, music: true, gift: true };
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn(() => {
    throw new Error("network access is forbidden in RF-06A fixtures");
  });
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("per-variant pipeline success", () => {
  it("COMMON: Lễ Thành Hôn, groom primary, both families and both operational sides", async () => {
    const { snapshot, viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });

    expect(viewModel.variant).toBe("COMMON");
    expect(viewModel.ceremony).toMatchObject({
      eventId: FIXTURE_EVENT_IDS.THANH_HON_GROOM,
      occasionType: "THANH_HON",
      title: "Lễ Thành Hôn",
    });
    expect(viewModel.people.primary).toStrictEqual({ side: "GROOM", name: "Nguyễn Minh Khôi" });
    expect(viewModel.people.secondary).toStrictEqual({ side: "BRIDE", name: "Trần Ngọc Hân" });
    expect(viewModel.families.primary.side).toBe("GROOM");
    expect(viewModel.families.secondary.side).toBe("BRIDE");
    expect(viewModel.operationalSides).toStrictEqual(["GROOM", "BRIDE"]);
    expect(Object.keys(viewModel.gift)).toStrictEqual(["groom", "bride"]);
    expect(Object.keys(viewModel.media.qr)).toStrictEqual(["groom", "bride"]);
    expect(viewModel.events.map((e) => e.id).sort()).toStrictEqual(Object.values(FIXTURE_EVENT_IDS).sort());
    expect(snapshot.variant).toBe("COMMON");
    expect(selection.effectiveSections).toStrictEqual(ALL_TRUE);
  });

  it("GROOM: Lễ Thành Hôn, groom primary, groom-side operations only", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "GROOM" });

    expect(viewModel.variant).toBe("GROOM");
    expect(viewModel.ceremony).toMatchObject({
      eventId: FIXTURE_EVENT_IDS.THANH_HON_GROOM,
      occasionType: "THANH_HON",
      title: "Lễ Thành Hôn",
    });
    expect(viewModel.people.primary.side).toBe("GROOM");
    expect(viewModel.people.secondary.side).toBe("BRIDE");
    expect(viewModel.families.primary).toMatchObject({ side: "GROOM", father: "Nguyễn Văn Đức" });
    expect(viewModel.operationalSides).toStrictEqual(["GROOM"]);
    expect(Object.keys(viewModel.gift)).toStrictEqual(["groom"]);
    expect(Object.keys(viewModel.media.qr)).toStrictEqual(["groom"]);
    expect(viewModel.events.map((e) => e.side)).not.toContain("BRIDE");
    expect(viewModel.events.map((e) => e.id).sort()).toStrictEqual(
      [FIXTURE_EVENT_IDS.THANH_HON_GROOM, FIXTURE_EVENT_IDS.RECEPTION_COMMON].sort(),
    );
    expect(selection.effectiveSections).toStrictEqual(ALL_TRUE);
  });

  it("BRIDE: Lễ Vu Quy, bride primary, bride-side operations only", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "BRIDE" });

    expect(viewModel.variant).toBe("BRIDE");
    expect(viewModel.ceremony).toMatchObject({
      eventId: FIXTURE_EVENT_IDS.VU_QUY_BRIDE,
      occasionType: "VU_QUY",
      title: "Lễ Vu Quy",
    });
    expect(viewModel.people.primary).toStrictEqual({ side: "BRIDE", name: "Trần Ngọc Hân" });
    expect(viewModel.people.secondary).toStrictEqual({ side: "GROOM", name: "Nguyễn Minh Khôi" });
    expect(viewModel.families.primary).toMatchObject({ side: "BRIDE", father: "Trần Quốc Việt" });
    expect(viewModel.families.secondary.side).toBe("GROOM");
    expect(viewModel.operationalSides).toStrictEqual(["BRIDE"]);
    expect(Object.keys(viewModel.gift)).toStrictEqual(["bride"]);
    expect(Object.keys(viewModel.media.qr)).toStrictEqual(["bride"]);
    expect(viewModel.events.map((e) => e.side)).not.toContain("GROOM");
    expect(viewModel.events.map((e) => e.id).sort()).toStrictEqual(
      [FIXTURE_EVENT_IDS.VU_QUY_BRIDE, FIXTURE_EVENT_IDS.RECEPTION_BRIDE, FIXTURE_EVENT_IDS.RECEPTION_COMMON].sort(),
    );
    expect(selection.effectiveSections).toStrictEqual(ALL_TRUE);
  });

  it.each(INVITATION_VARIANTS)("%s never substitutes the wrong rite", async (variant) => {
    const { viewModel, snapshot } = await buildRendererFixture({ variant });
    const expected = variant === "BRIDE" ? "Lễ Vu Quy" : "Lễ Thành Hôn";
    expect(snapshot.ceremony.title).toBe(expected);
    expect(viewModel.ceremony.title).toBe(expected);
    expect(JSON.stringify(viewModel.ceremony)).not.toContain(variant === "BRIDE" ? "Thành Hôn" : "Vu Quy");
  });

  it.each(INVITATION_VARIANTS)("%s: rendererKey and templateVersionId continuity, RF-04 selection", async (variant) => {
    const { snapshot, viewModel, selection } = await buildRendererFixture({ variant });

    expect(snapshot.payloadSchemaVersion).toBe(1);
    expect(snapshot.project.code).toBe(FIXTURE_PROJECT_CODE);
    expect(snapshot.template).toStrictEqual({ templateVersionId: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: EE_KEY });
    expect(viewModel.template).toStrictEqual(snapshot.template);
    expect(selection.rendererKey).toBe(EE_KEY);
    expect(selection.compatibilityManifest).toStrictEqual(PRODUCTION_COMPATIBILITY_REGISTRY.compatibility.lookup(EE_KEY));
    expect(Object.keys(selection.effectiveSections)).toStrictEqual([
      "invitationMessage",
      "loveStory",
      "gallery",
      "music",
      "gift",
    ]);
    expect(viewModel.design).toMatchObject({
      paletteKey: "green-ivory",
      fontPresetKey: "editorial-classic",
      effectPresetKey: "STANDARD",
    });
  });

  it.each(INVITATION_VARIANTS)("%s: canonical content survives the pipeline verbatim", async (variant) => {
    const { viewModel } = await buildRendererFixture({ variant });
    expect(viewModel.content.invitationMessage).toContain("Trân trọng kính mời");
    expect(viewModel.content.loveStory).toContain("\n");
    const reception = viewModel.events.find((e) => e.id === FIXTURE_EVENT_IDS.RECEPTION_COMMON);
    expect(reception).toMatchObject({
      venueName: "Trung tâm Hội nghị Hoa Sữa",
      address: "200 Đường Hoa Sữa, TP. Hồ Chí Minh",
      mapUrl: "https://maps.example.invalid/reception",
      timezone: "Asia/Ho_Chi_Minh",
      lunarDateDisplay: null,
    });
  });
});

describe("media resolution", () => {
  it("RESOLVED media enters the ViewModel in canonical roles and order", async () => {
    const { viewModel, mediaResolutions } = await buildRendererFixture({ variant: "COMMON" });
    expect(viewModel.media.cover).toStrictEqual({
      status: "RESOLVED",
      mediaId: FIXTURE_MEDIA_IDS.COVER,
      url: fixtureMediaUrl(FIXTURE_MEDIA_IDS.COVER),
      width: 1200,
      height: 1600,
    });
    expect(viewModel.media.gallery.map((m) => m.mediaId)).toStrictEqual([
      FIXTURE_MEDIA_IDS.GALLERY_1,
      FIXTURE_MEDIA_IDS.GALLERY_2,
      FIXTURE_MEDIA_IDS.GALLERY_3,
    ]);
    expect(viewModel.media.audio).toStrictEqual({
      status: "RESOLVED",
      mediaId: FIXTURE_MEDIA_IDS.AUDIO,
      url: fixtureMediaUrl(FIXTURE_MEDIA_IDS.AUDIO),
      width: null,
      height: null,
    });
    expect(viewModel.media.qr.groom?.mediaId).toBe(FIXTURE_MEDIA_IDS.QR_GROOM);
    expect(viewModel.media.qr.bride?.mediaId).toBe(FIXTURE_MEDIA_IDS.QR_BRIDE);
    expect(mediaResolutions.every((m) => m.status === "RESOLVED")).toBe(true);
  });

  it("fixture URLs are inert and never enter the Snapshot", async () => {
    const { snapshot, viewModel } = await buildRendererFixture({ variant: "COMMON" });
    expect(FIXTURE_MEDIA_URL_BASE).toMatch(/^https:\/\/[a-z-]+\.invalid\//);
    expect(JSON.stringify(snapshot)).not.toContain(FIXTURE_MEDIA_URL_BASE);
    expect(JSON.stringify(viewModel)).toContain(FIXTURE_MEDIA_URL_BASE);
  });

  it("UNAVAILABLE media keeps its role and position and does not change visibility", async () => {
    const { viewModel, selection } = await buildRendererFixture({
      variant: "COMMON",
      unavailableMediaIds: [FIXTURE_MEDIA_IDS.GALLERY_2, FIXTURE_MEDIA_IDS.QR_GROOM, FIXTURE_MEDIA_IDS.AUDIO],
    });
    expect(viewModel.media.gallery.map((m) => m.status)).toStrictEqual(["RESOLVED", "UNAVAILABLE", "RESOLVED"]);
    expect(viewModel.media.gallery[1]).toStrictEqual({ status: "UNAVAILABLE", mediaId: FIXTURE_MEDIA_IDS.GALLERY_2 });
    expect(viewModel.media.qr.groom).toStrictEqual({ status: "UNAVAILABLE", mediaId: FIXTURE_MEDIA_IDS.QR_GROOM });
    expect(viewModel.media.audio?.status).toBe("UNAVAILABLE");
    expect(viewModel.gift.groom?.bankAccountNumber).toBe("9001000000001");
    expect(selection.effectiveSections).toStrictEqual(ALL_TRUE);
  });

  it("the fixture resolver answers deterministically without storage lookup", async () => {
    const resolver = createFixtureMediaResolver({ unavailableMediaIds: ["b"] });
    expect(await resolver.resolveMedia("a")).toStrictEqual({
      status: "RESOLVED",
      mediaId: "a",
      url: `${FIXTURE_MEDIA_URL_BASE}a`,
      width: null,
      height: null,
    });
    expect(await resolver.resolveMedia("b")).toStrictEqual({ status: "UNAVAILABLE", mediaId: "b" });
  });
});

describe("guest and lunar foundation", () => {
  it("unpersonalized: no guest overlay", async () => {
    const { viewModel } = await buildRendererFixture({ variant: "COMMON" });
    expect(Object.prototype.hasOwnProperty.call(viewModel, "guest")).toBe(false);
  });

  it.each(Object.entries(FIXTURE_GUESTS))("personalized %s: display name verbatim", async (_label, guest) => {
    for (const variant of INVITATION_VARIANTS) {
      const { viewModel, snapshot } = await buildRendererFixture({ variant, guest });
      expect(viewModel.guest).toStrictEqual({ displayName: guest.displayName });
      expect(JSON.stringify(snapshot)).not.toContain(guest.displayName);
    }
  });

  it.each(INVITATION_VARIANTS)("%s: lunar PRESENT is the ceremony event's own text; ABSENT is null", async (variant) => {
    const present = await buildRendererFixture({ variant });
    const absent = await buildRendererFixture({ variant, ceremonyLunar: "ABSENT" });
    expect(present.viewModel.ceremony.lunarDateDisplay).toBe(
      variant === "BRIDE" ? "Nhằm ngày 08 tháng 09 năm Bính Ngọ" : "Nhằm ngày 09 tháng 09 năm Bính Ngọ",
    );
    expect(absent.viewModel.ceremony.lunarDateDisplay).toBeNull();
    for (const event of present.viewModel.events) {
      if (event.id !== present.viewModel.ceremony.eventId && event.occasionType === "RECEPTION") {
        expect(event.lunarDateDisplay).toBeNull();
      }
    }
  });

  it("staff section settings flow through RF-04 effective visibility", async () => {
    const { selection } = await buildRendererFixture({ variant: "GROOM", sectionSettings: { gallery: false } });
    expect(selection.effectiveSections).toStrictEqual({ ...ALL_TRUE, gallery: false });
  });
});

describe("fixture primitives and fail-closed composition", () => {
  it("uses only canonical ECMAScript-safe timestamps", () => {
    const input = buildRendererFixtureSourceInput({ variant: "COMMON" });
    for (const event of input.events) {
      expect(event.startsAt).toMatch(CANONICAL_TIMESTAMP);
      expect(event.createdAt).toMatch(CANONICAL_TIMESTAMP);
      expect(event.timezone).toBe("Asia/Ho_Chi_Minh");
    }
  });

  it("returns fresh inputs that share nothing between calls", () => {
    const a = buildRendererFixtureSourceInput({ variant: "COMMON" });
    const b = buildRendererFixtureSourceInput({ variant: "COMMON" });
    expect(a).toStrictEqual(b);
    expect(a.events).not.toBe(b.events);
    expect(a.weddingDetails).not.toBe(b.weddingDetails);
    (a.events as unknown[]).length = 0;
    expect(buildRendererFixtureSourceInput({ variant: "COMMON" }).events).toHaveLength(4);
  });

  it("an unregistered renderer key stays fail-closed under RF-04", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "COMMON" });
    input.templateVersion = { ...input.templateVersion, rendererKey: "wedding.elegant-editorial.v2" };
    await expect(
      runRendererFixturePipeline(input, { resolver: createFixtureMediaResolver() }),
    ).rejects.toSatisfy((error) => error instanceof RendererSelectionError && error.code === "RENDERER_KEY_NOT_REGISTERED");
  });

  it("a blocked fixture Snapshot is reported, never rendered", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "BRIDE" });
    input.events = input.events.filter((event) => event.occasionType !== "VU_QUY");
    await expect(runRendererFixturePipeline(input, { resolver: createFixtureMediaResolver() })).rejects.toThrow(
      new RendererFixtureError("Renderer fixture Snapshot is blocked: REQUIRED_CEREMONY_EVENT_MISSING"),
    );
  });
});

describe("determinism", () => {
  const variants: InvitationVariant[] = [...INVITATION_VARIANTS];

  it.each(variants)("%s: two builds serialize identically and share no objects", async (variant) => {
    const options = { variant, guest: FIXTURE_GUESTS.PLAYFUL, unavailableMediaIds: [FIXTURE_MEDIA_IDS.GALLERY_3] };
    const first = await buildRendererFixture(options);
    const second = await buildRendererFixture(options);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(second.viewModel).not.toBe(first.viewModel);
    expect(second.snapshot.events).not.toBe(first.snapshot.events);
  });

  it("does not read the clock or randomness", async () => {
    const now = vi.spyOn(Date, "now");
    const random = vi.spyOn(Math, "random");
    await buildRendererFixture({ variant: "BRIDE", guest: FIXTURE_GUESTS.LONG });
    expect(now).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
    now.mockRestore();
    random.mockRestore();
  });
});
