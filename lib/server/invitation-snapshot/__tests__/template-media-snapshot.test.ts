import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { MediaType } from "../../../domain";
import { buildInvitationViewModel } from "../../../invitation-rendering/build-invitation-view-model";
import { buildSnapshotPayload, SnapshotPayloadInvariantError } from "../../../invitation-rendering/build-snapshot-payload";
import { extractSnapshotMediaRefs } from "../../../invitation-rendering/extract-snapshot-media-refs";
import type { MediaResolver } from "../../../invitation-rendering/invitation-view-model-types";
import { RendererSelectionError } from "../../../invitation-rendering/renderer-selection-errors";
import { resolveSnapshotMedia } from "../../../invitation-rendering/resolve-snapshot-media";
import type { BuildSnapshotPayloadInput, SnapshotMediaSource, SnapshotPayloadV1 } from "../../../invitation-rendering/snapshot-payload-types";
import { createFixtureMediaResolver } from "../../../../templates/core/fixtures/fixture-media-resolver";
import {
  buildRendererFixtureSourceInput,
  FIXTURE_MEDIA_IDS,
  FIXTURE_PROJECT_ID,
  FIXTURE_TEMPLATE_VERSION_ID,
} from "../../../../templates/core/fixtures/renderer-fixture-sources";
import { lookupTemplateEditorManifest } from "../../../../templates/core/production-editor-manifests";
import type { StaffContext } from "../../auth/staff-context";
import { assertStoredReviewSnapshot } from "../../invitation-review/assert-stored-review-snapshot";
import { STORED_TEMPLATE_SLOTS_INVALID } from "../../invitation-review/assert-stored-template-slots";
import type { MediaGateway } from "../../media/media-gateway";
import type { TemplateMediaSlotItem } from "../../template-media/template-media-slot-types";
import { buildTemplateMediaSource, SnapshotTemplateMediaInvariantError } from "../build-template-media-source";
import { loadSnapshotPayloadInput, type SnapshotContentSourceGateways } from "../load-snapshot-payload-input";

/**
 * TE-04 — template media slots frozen into Snapshot payload v1, media refs,
 * InvitationViewModel and the stored-Snapshot read gate
 * (docs/DECISIONS.md "TE-04").
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const EE_KEY = "wedding.elegant-editorial.v1";
const VH_KEY = "wedding.vietnamese-heritage.v1";
const VH_MANIFEST = lookupTemplateEditorManifest(VH_KEY)!;
const OTHER_VERSION = "00000000-0000-4000-8000-0000000000f2";

const PHOTO = {
  A: "00000000-0000-4000-8000-0000000003a1",
  B: "00000000-0000-4000-8000-0000000003a2",
  C: "00000000-0000-4000-8000-0000000003a3",
  D: "00000000-0000-4000-8000-0000000003a4",
  E: "00000000-0000-4000-8000-0000000003a5",
} as const;
const SOCIAL = "00000000-0000-4000-8000-0000000003b1";
const QR_COMMON = "00000000-0000-4000-8000-0000000003b2";

/** Captured from the pre-TE-04 commit 1661d978 (same fixtures, same code path): legacy payload, ViewModel and media-ref hashes. */
const PRE_TE04_GOLDEN: Readonly<Record<string, string>> = {
  "COMMON:minimal": "4a8c3dc9310e176d79b09186de2f9532c53824624fc57268fd50707f4dbe6a02",
  "COMMON:minimal:vm": "09f232e0203b4279476e09c2a92f7b8a5bbc8590766566b51dde8ca7395ea882",
  "COMMON:minimal:refs": "efa0f348b023ab7f472f855631365216ad40010aa5a4bbb6fa329a42e5266ddc",
  "COMMON:rich": "feecd58a813546dfd950940a1b1e1d6f80c73f2a692e31eee0b80ec8487d1a8e",
  "COMMON:rich:vm": "76b69ea52183cee6004ef37bf9678cc4e9198b70405ca49b99ec97249a052581",
  "COMMON:rich:refs": "9b4c0d59e3cd11b5f15472e0cf76cd646cf5a63edb27388cab3d0c6a64e43290",
  "GROOM:minimal": "c03d597c03d41249b5b2d15e74dae78f3b0b32e91d94b662eb48dca5ab39ef30",
  "GROOM:minimal:vm": "47cab46e58300317bbd1a7b0cc1599b03f259fc504bea5d80bcd730231de5322",
  "GROOM:minimal:refs": "0cc8750a5b3f4e7dd8f51e8b653a7dee039db7354a00e1503c5162ffb63f9f87",
  "GROOM:rich": "75dc0cbe45af3c7ba19f4423da011d51f7a25f52a3f13b5ea57e95e7832afc9a",
  "GROOM:rich:vm": "aeb28f4f64517a03d6f3cbd067c23d8aae97ea0fb94ae8b4276482427b970d12",
  "GROOM:rich:refs": "6e0f46d371265ed0811506212f03407a2dcfd59815549b2f8fbd40dd24b2eac0",
  "BRIDE:minimal": "e4889791b6c887ad364296946000736070b592e60d003eef621a181d607391f8",
  "BRIDE:minimal:vm": "27dba2bfae30e8c91a093181c5eb5e4817f08d12a936309394d2b707b876c2f6",
  "BRIDE:minimal:refs": "ee0f94a280d6b92df8ebe43d757cb46f2a8590c5d8f2a945c851ee6add6276bf",
  "BRIDE:rich": "e41c94ba55a27db8f1afdb776c13b957774245d6ca104a21800a95790a34fb6f",
  "BRIDE:rich:vm": "ce2cfaf377b831c5e0d6456b5bdfe45bf38b6e9106edca727128be18c185b5b9",
  "BRIDE:rich:refs": "430e9dd0f8fd721b2288a705582aecdba730a00e632014bbdec6b812c492e9e9"
};

/** A structurally loose view of a stored payload, for corruption tests only. */
interface MutablePayload {
  media: Record<string, unknown> & { templateSlots: Record<string, unknown> };
  sections: Record<string, unknown>;
  template: Record<string, unknown>;
}

const sha = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function legacyInput(variant: "COMMON" | "GROOM" | "BRIDE", rich: boolean): BuildSnapshotPayloadInput {
  return buildRendererFixtureSourceInput(
    rich
      ? { variant, portraits: "PRESENT", photoStory: "PRESENT", loveStoryPhoto: "PRESENT", galleryCount: 7 }
      : { variant, timeline: "ABSENT", dressCode: "ABSENT", galleryCount: 0 },
  );
}

function built(input: BuildSnapshotPayloadInput): SnapshotPayloadV1 {
  const result = buildSnapshotPayload(input);
  if (result.status !== "SUCCESS") throw new Error("fixture blocked");
  return result.payload;
}

/** The Project media inventory of a Vietnamese Heritage fixture: legacy rows + PHOTO rows + semantic extras. */
function vhMedia(): SnapshotMediaSource[] {
  const base = buildRendererFixtureSourceInput({ variant: "COMMON", portraits: "PRESENT", loveStoryPhoto: "PRESENT" }).media;
  const photos = Object.values(PHOTO).map((id, index) => ({ id, projectId: FIXTURE_PROJECT_ID, mediaType: "PHOTO" as MediaType, sortOrder: index }));
  return [
    ...base,
    ...photos,
    { id: SOCIAL, projectId: FIXTURE_PROJECT_ID, mediaType: "SOCIAL_SHARE_COVER", sortOrder: 0 },
    { id: QR_COMMON, projectId: FIXTURE_PROJECT_ID, mediaType: "QR_COMMON", sortOrder: 0 },
  ];
}

type Assignments = Partial<Record<string, readonly string[]>>;

function rowsFor(assignments: Assignments): TemplateMediaSlotItem[] {
  return Object.entries(assignments).flatMap(([slotKey, ids]) =>
    (ids ?? []).map((projectMediaId, position) => ({ slotKey, position, projectMediaId })),
  );
}

function vhInput(
  variant: "COMMON" | "GROOM" | "BRIDE",
  assignments: Assignments,
  overrides: { loveStory?: string | null; media?: SnapshotMediaSource[] } = {},
): BuildSnapshotPayloadInput {
  const base = buildRendererFixtureSourceInput({ variant });
  const media = overrides.media ?? vhMedia();
  const weddingDetails =
    overrides.loveStory === undefined || base.weddingDetails === null ? base.weddingDetails : { ...base.weddingDetails, loveStory: overrides.loveStory };
  return {
    ...base,
    weddingDetails,
    media,
    templateVersion: { id: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: VH_KEY },
    templateMedia: buildTemplateMediaSource(VH_MANIFEST, rowsFor(assignments), media),
  };
}

const CLUSTER_AND_GALLERY: Assignments = { portraitCluster: [PHOTO.A, PHOTO.B, PHOTO.C], gallery: [PHOTO.A, PHOTO.D] };

// ---------------------------------------------------------------------------

describe("Elegant Editorial (LEGACY_ROLES) non-regression", () => {
  it.each(["COMMON", "GROOM", "BRIDE"] as const)("%s payload, ViewModel and refs are byte-identical to pre-TE-04", async (variant) => {
    for (const rich of [false, true]) {
      const key = `${variant}:${rich ? "rich" : "minimal"}`;
      const payload = built(legacyInput(variant, rich));
      expect(Object.prototype.hasOwnProperty.call(payload.media, "templateSlots")).toBe(false);
      expect(sha(payload), key).toBe(PRE_TE04_GOLDEN[key]);
      expect(sha(extractSnapshotMediaRefs(payload)), `${key}:refs`).toBe(PRE_TE04_GOLDEN[`${key}:refs`]);
      const viewModel = buildInvitationViewModel({ snapshot: payload, mediaResolutions: await resolveSnapshotMedia(payload, createFixtureMediaResolver()) });
      expect(Object.prototype.hasOwnProperty.call(viewModel.media, "templateSlots")).toBe(false);
      expect(sha(viewModel), `${key}:vm`).toBe(PRE_TE04_GOLDEN[`${key}:vm`]);
    }
  });

  it("the loader never reads slot rows for LEGACY_ROLES and adds no templateMedia", async () => {
    const listSlotItems = vi.fn(async () => [] as TemplateMediaSlotItem[]);
    const canonical = legacyInput("GROOM", true);
    const input = await loadSnapshotPayloadInput(canonicalOf(canonical), STAFF, gateways(canonical.media, listSlotItems, canonical));
    expect(listSlotItems).not.toHaveBeenCalled();
    expect(Object.prototype.hasOwnProperty.call(input, "templateMedia")).toBe(false);
    expect(sha(built(input))).toBe(PRE_TE04_GOLDEN["GROOM:rich"]);
  });
});

describe("TEMPLATE_SLOTS Snapshot (Vietnamese Heritage v1)", () => {
  it("freezes exactly every declared slot, empty slots as [], assignment order kept", () => {
    const payload = built(vhInput("COMMON", { portraitCluster: [PHOTO.C, PHOTO.A, PHOTO.B] }));
    expect(payload.media.templateSlots).toStrictEqual({
      gallery: [],
      heroPhoto: [],
      loveStoryPhoto: [],
      portraitCluster: [PHOTO.C, PHOTO.A, PHOTO.B],
    });
    expect(Object.keys(payload.media.templateSlots ?? {}).sort()).toEqual(VH_MANIFEST.mediaSlots.map((slot) => slot.key).sort());
  });

  it("allows the same photo in different slots", () => {
    const payload = built(vhInput("COMMON", { heroPhoto: [PHOTO.A], ...CLUSTER_AND_GALLERY }));
    expect(payload.media.templateSlots?.heroPhoto).toEqual([PHOTO.A]);
    expect(payload.media.templateSlots?.portraitCluster).toEqual([PHOTO.A, PHOTO.B, PHOTO.C]);
    expect(payload.media.templateSlots?.gallery).toEqual([PHOTO.A, PHOTO.D]);
  });

  it("omits every legacy layout reference and never converts legacy roles implicitly", () => {
    const payload = built(vhInput("COMMON", {}));
    for (const key of ["coverMediaId", "portrait", "photoStoryMediaIds", "loveStoryPhotoMediaId"]) {
      expect(Object.prototype.hasOwnProperty.call(payload.media, key), key).toBe(false);
    }
    expect(payload.media.galleryMediaIds).toEqual([]);
    // COVER / GALLERY / portrait / Love Story photo rows exist in the inventory but enter no slot.
    expect(Object.values(payload.media.templateSlots ?? {}).flat()).toEqual([]);
  });

  it("accepts an explicitly assigned legacy photograph (COVER / GALLERY row)", () => {
    const payload = built(vhInput("COMMON", { heroPhoto: [FIXTURE_MEDIA_IDS.COVER], gallery: [FIXTURE_MEDIA_IDS.GALLERY_2, PHOTO.E] }));
    expect(payload.media.templateSlots?.heroPhoto).toEqual([FIXTURE_MEDIA_IDS.COVER]);
    expect(payload.media.templateSlots?.gallery).toEqual([FIXTURE_MEDIA_IDS.GALLERY_2, PHOTO.E]);
  });

  it("keeps semantic media (audio, QR, gift) working", () => {
    const payload = built(vhInput("COMMON", {}));
    expect(payload.media.audioMediaId).toBe(FIXTURE_MEDIA_IDS.AUDIO);
    expect(payload.media.qr).toStrictEqual({ groomMediaId: FIXTURE_MEDIA_IDS.QR_GROOM, brideMediaId: FIXTURE_MEDIA_IDS.QR_BRIDE });
    expect(payload.sections.music).toBe(true);
    expect(payload.sections.gift).toBe(true);
  });

  it("COMMON / GROOM / BRIDE of the same version freeze the same slot set", () => {
    const sets = (["COMMON", "GROOM", "BRIDE"] as const).map((variant) => built(vhInput(variant, CLUSTER_AND_GALLERY)).media.templateSlots);
    expect(sets[1]).toStrictEqual(sets[0]);
    expect(sets[2]).toStrictEqual(sets[0]);
  });
});

describe("section visibility (TEMPLATE_SLOTS)", () => {
  it("gallery follows the manifest gallery-linked slot", () => {
    expect(built(vhInput("COMMON", {})).sections.gallery).toBe(false);
    expect(built(vhInput("COMMON", { gallery: [PHOTO.D] })).sections.gallery).toBe(true);
    expect(built(vhInput("COMMON", { heroPhoto: [PHOTO.A], portraitCluster: [PHOTO.B] })).sections.gallery).toBe(false);
  });

  it("the gallery link comes from manifest sectionKey, not the slot name", () => {
    const source = buildTemplateMediaSource(VH_MANIFEST, [], vhMedia());
    expect(source.gallerySlotKeys).toEqual(VH_MANIFEST.mediaSlots.filter((slot) => slot.sectionKey === "gallery").map((slot) => slot.key));
    const code = readFileSync(join(ROOT, "lib/server/invitation-snapshot/build-template-media-source.ts"), "utf8");
    expect(code).toMatch(/slot\.sectionKey === "gallery"/);
    expect(code).not.toMatch(/key === "gallery"|slotKey === "gallery"/);
  });

  it("a Love Story photo never creates the section; text keeps it without a photo", () => {
    expect(built(vhInput("COMMON", { loveStoryPhoto: [PHOTO.E] }, { loveStory: null })).sections.loveStory).toBe(false);
    const textOnly = built(vhInput("COMMON", {}));
    expect(textOnly.content.loveStory).not.toBeNull();
    expect(textOnly.sections.loveStory).toBe(true);
  });

  it("photoStory stays false and music/gift/timeline/dressCode keep their canonical rules", () => {
    const sections = built(vhInput("COMMON", CLUSTER_AND_GALLERY)).sections;
    expect(sections.photoStory).toBe(false);
    expect(sections).toMatchObject({ music: true, gift: true, timeline: true, dressCode: true });
  });
});

describe("slot source validation before the Snapshot", () => {
  const media = vhMedia();
  const reject = (rows: TemplateMediaSlotItem[], inventory = media) =>
    expect(() => buildTemplateMediaSource(VH_MANIFEST, rows, inventory)).toThrow(SnapshotTemplateMediaInvariantError);

  it("rejects an undeclared slot", () => reject(rowsFor({ coverPhoto: [PHOTO.A] })));
  it("rejects SINGLE overflow", () => reject(rowsFor({ heroPhoto: [PHOTO.A, PHOTO.B] })));
  it("rejects finite maxCount overflow", () => reject(rowsFor({ portraitCluster: [PHOTO.A, PHOTO.B, PHOTO.C, PHOTO.D] })));
  it("rejects non-contiguous positions", () => reject([{ slotKey: "gallery", position: 1, projectMediaId: PHOTO.A }]));
  it("rejects duplicate media inside one slot", () =>
    reject([
      { slotKey: "gallery", position: 0, projectMediaId: PHOTO.A },
      { slotKey: "gallery", position: 1, projectMediaId: PHOTO.A },
    ]));
  it("rejects media missing from the Project inventory", () => reject(rowsFor({ gallery: ["00000000-0000-4000-8000-0000000009ff"] })));
  it.each([FIXTURE_MEDIA_IDS.AUDIO, FIXTURE_MEDIA_IDS.QR_GROOM, FIXTURE_MEDIA_IDS.QR_BRIDE, QR_COMMON, SOCIAL])(
    "rejects media that is now not slot-assignable (%s)",
    (id) => reject(rowsFor({ gallery: [id] })),
  );
  it("rejects an assigned photo whose row has since become AUDIO", () => {
    const changed = media.map((item) => (item.id === PHOTO.A ? { ...item, mediaType: "AUDIO" as MediaType } : item));
    reject(rowsFor({ gallery: [PHOTO.A] }), changed);
  });
  it("rejects a LEGACY_ROLES manifest", () => {
    expect(() => buildTemplateMediaSource(lookupTemplateEditorManifest(EE_KEY)!, [], media)).toThrow(SnapshotTemplateMediaInvariantError);
  });
  it("the pure builder re-checks assignability (defense in depth)", () => {
    const input = vhInput("COMMON", {});
    expect(() => buildSnapshotPayload({ ...input, templateMedia: { slots: { ...input.templateMedia!.slots, gallery: [FIXTURE_MEDIA_IDS.AUDIO] }, gallerySlotKeys: ["gallery"] } })).toThrow(
      SnapshotPayloadInvariantError,
    );
  });
});

describe("media references / pinning", () => {
  it("pins every slot id, slot keys lexical, positions in order, deduplicated globally", () => {
    const payload = built(vhInput("COMMON", { heroPhoto: [PHOTO.E], ...CLUSTER_AND_GALLERY }));
    const refs = extractSnapshotMediaRefs(payload);
    // Semantic refs first (unchanged order), then gallery → heroPhoto → loveStoryPhoto → portraitCluster.
    expect(refs).toEqual([FIXTURE_MEDIA_IDS.AUDIO, FIXTURE_MEDIA_IDS.QR_GROOM, FIXTURE_MEDIA_IDS.QR_BRIDE, PHOTO.A, PHOTO.D, PHOTO.E, PHOTO.B, PHOTO.C]);
  });

  it("Part J: cluster A,B,C + gallery A,D → exactly four unique slot refs, deterministic", () => {
    const payload = built(vhInput("COMMON", CLUSTER_AND_GALLERY));
    const slotRefs = extractSnapshotMediaRefs(payload).filter((id) => (Object.values(PHOTO) as string[]).includes(id));
    expect(slotRefs).toEqual([PHOTO.A, PHOTO.D, PHOTO.B, PHOTO.C]);
    expect(extractSnapshotMediaRefs(structuredClone(payload))).toEqual(extractSnapshotMediaRefs(payload));
  });

  it("traversal does not depend on stored JSON key order", () => {
    const payload = built(vhInput("COMMON", CLUSTER_AND_GALLERY));
    const reordered = structuredClone(payload);
    const slots = reordered.media.templateSlots!;
    reordered.media.templateSlots = Object.fromEntries(Object.keys(slots).reverse().map((key) => [key, slots[key]!]));
    expect(extractSnapshotMediaRefs(reordered)).toEqual(extractSnapshotMediaRefs(payload));
  });

  it("pins no unassigned Project media", () => {
    const refs = extractSnapshotMediaRefs(built(vhInput("COMMON", { gallery: [PHOTO.D] })));
    for (const id of [PHOTO.A, PHOTO.B, FIXTURE_MEDIA_IDS.COVER, FIXTURE_MEDIA_IDS.GALLERY_1, FIXTURE_MEDIA_IDS.PORTRAIT_GROOM, FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO, SOCIAL]) {
      expect(refs).not.toContain(id);
    }
  });

  it("create_review_version pins exactly extractSnapshotMediaRefs(payload) (no RPC signature change)", () => {
    const code = readFileSync(join(ROOT, "lib/server/invitation-review/create-review-version.ts"), "utf8");
    expect(code).toMatch(/mediaIds: extractSnapshotMediaRefs\(snapshot\)/);
  });
});

describe("InvitationViewModel templateSlots", () => {
  it("resolves each slot in order; UNAVAILABLE stays in place; each id resolved once", async () => {
    const payload = built(vhInput("COMMON", CLUSTER_AND_GALLERY));
    const inner = createFixtureMediaResolver({ unavailableMediaIds: [PHOTO.B] });
    const resolveMedia = vi.fn((id: string) => inner.resolveMedia(id));
    const resolver: MediaResolver = { resolveMedia };
    const viewModel = buildInvitationViewModel({ snapshot: payload, mediaResolutions: await resolveSnapshotMedia(payload, resolver) });
    const slots = viewModel.media.templateSlots!;
    expect(Object.keys(slots).sort()).toEqual(["gallery", "heroPhoto", "loveStoryPhoto", "portraitCluster"]);
    expect(slots.portraitCluster?.map((entry) => [entry.status, entry.mediaId])).toEqual([
      ["RESOLVED", PHOTO.A],
      ["UNAVAILABLE", PHOTO.B],
      ["RESOLVED", PHOTO.C],
    ]);
    expect(slots.gallery?.map((entry) => entry.mediaId)).toEqual([PHOTO.A, PHOTO.D]);
    expect(slots.heroPhoto).toEqual([]);
    expect(slots.gallery?.[0]).not.toBe(slots.portraitCluster?.[0]);
    expect(slots.gallery?.[0]).toStrictEqual(slots.portraitCluster?.[0]);
    expect(resolveMedia.mock.calls.filter(([id]) => id === PHOTO.A)).toHaveLength(1);
    expect(viewModel.media.cover).toBeUndefined();
    expect(viewModel.media.gallery).toEqual([]);
    expect(viewModel.media.audio?.status).toBe("RESOLVED");
  });
});

describe("stored Snapshot validation (every persisted read path)", () => {
  const vhPayload = built(vhInput("GROOM", { heroPhoto: [PHOTO.A], ...CLUSTER_AND_GALLERY }));
  const stored = (payload: unknown, rendererKey = VH_KEY) => ({ variant: "GROOM" as const, templateVersionId: FIXTURE_TEMPLATE_VERSION_ID, rendererKey, payload });
  const mutate = (fn: (payload: MutablePayload) => void): unknown => {
    const copy = structuredClone(vhPayload) as unknown as MutablePayload;
    fn(copy);
    return copy;
  };
  const invalid = (payload: unknown, rendererKey = VH_KEY) =>
    expect(() => assertStoredReviewSnapshot(stored(payload, rendererKey))).toThrow(STORED_TEMPLATE_SLOTS_INVALID);

  it("accepts a valid slot Snapshot and historical Elegant Editorial Snapshots unchanged", () => {
    expect(assertStoredReviewSnapshot(stored(vhPayload))).toBe(vhPayload);
    for (const rich of [false, true]) {
      const legacy = built(legacyInput("GROOM", rich));
      expect(assertStoredReviewSnapshot({ variant: "GROOM", templateVersionId: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: EE_KEY, payload: legacy })).toBe(legacy);
    }
  });

  it("rejects malformed template slot structures", () => {
    invalid(mutate((p) => Object.assign(p.media, { templateSlots: [] })));
    invalid(mutate((p) => Object.assign(p.media, { templateSlots: null })));
    invalid(mutate((p) => Reflect.deleteProperty(p.media, "templateSlots")));
    invalid(mutate((p) => delete p.media.templateSlots.heroPhoto));
    invalid(mutate((p) => (p.media.templateSlots.coverPhoto = [])));
    invalid(mutate((p) => (p.media.templateSlots.gallery = "x")));
    invalid(mutate((p) => (p.media.templateSlots.gallery = ["not-a-uuid"])));
    invalid(mutate((p) => (p.media.templateSlots.gallery = [PHOTO.A, PHOTO.A])));
    invalid(mutate((p) => (p.media.templateSlots.portraitCluster = [PHOTO.A, PHOTO.B, PHOTO.C, PHOTO.D])));
    invalid(mutate((p) => (p.media.templateSlots.heroPhoto = [PHOTO.A, PHOTO.B])));
  });

  it("rejects legacy layout references and gallery inconsistency in a slot Snapshot", () => {
    invalid(mutate((p) => (p.media.coverMediaId = PHOTO.A)));
    invalid(mutate((p) => (p.media.portrait = {})));
    invalid(mutate((p) => (p.media.photoStoryMediaIds = [])));
    invalid(mutate((p) => (p.media.loveStoryPhotoMediaId = PHOTO.A)));
    invalid(mutate((p) => (p.media.galleryMediaIds = [PHOTO.A])));
    invalid(mutate((p) => (p.sections.gallery = false)));
    invalid(mutate((p) => {
      p.media.templateSlots.gallery = [];
    }));
  });

  it("rejects a model mismatch in either direction", () => {
    const legacyWithSlots = structuredClone(built(legacyInput("GROOM", false))) as unknown as MutablePayload;
    legacyWithSlots.media.templateSlots = {};
    invalid(legacyWithSlots, EE_KEY);
    const vhWithoutSlots = { ...structuredClone(built(legacyInput("GROOM", false))), template: { templateVersionId: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: VH_KEY } };
    invalid(vhWithoutSlots, VH_KEY);
  });

  it("fails closed for a renderer with no editor manifest (no default)", () => {
    const unknown = mutate((p) => (p.template.rendererKey = "wedding.unknown.v1"));
    const error = (() => {
      try {
        assertStoredReviewSnapshot(stored(unknown, "wedding.unknown.v1"));
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(RendererSelectionError);
    expect((error as RendererSelectionError).code).toBe("RENDERER_KEY_NOT_REGISTERED");
  });

  it("all persisted Snapshot read paths go through the gate", () => {
    for (const file of [
      "lib/server/invitation-review/build-review-version-preview.ts",
      "lib/server/customer-review/load-customer-review.ts",
      "lib/server/public-invitation/load-public-invitation.ts",
      "lib/server/customer-portal/load-customer-portal.ts",
    ]) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).toMatch(/assertStoredReviewSnapshot\(/);
    }
  });
});

// ---------------------------------------------------------------------------
// Draft loading, immutability and switching
// ---------------------------------------------------------------------------

const STAFF: StaffContext<string> = { userId: "00000000-0000-4000-8000-0000000000a1", role: "STAFF", displayName: "Staff", supabase: "staff-client" };

function canonicalOf(input: BuildSnapshotPayloadInput) {
  const { project, variant, weddingDetails, events, design, templateVersion } = input;
  return { project, variant, weddingDetails, events, design, templateVersion };
}

function gateways(
  media: readonly SnapshotMediaSource[],
  listSlotItems: SnapshotContentSourceGateways<string>["templateSlots"]["listSlotItems"],
  content: Pick<BuildSnapshotPayloadInput, "timelineItems" | "dressCode" | "dressCodeSwatches"> = { timelineItems: [], dressCode: null, dressCodeSwatches: [] },
): SnapshotContentSourceGateways<string> {
  const listProjectMedia: MediaGateway<string>["listProjectMedia"] = async () =>
    media.map((item) => ({ ...item, storageBucket: "project-media", storagePath: `${FIXTURE_PROJECT_ID}/${item.id}`, mimeType: null, sizeBytes: null, width: null, height: null, altText: null, createdBy: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }) as never);
  return {
    media: { listProjectMedia },
    timeline: { listProjectTimelineItems: async () => content.timelineItems as never },
    dressCode: {
      getProjectDressCode: async () =>
        content.dressCode === null ? null : ({ dressCode: content.dressCode, swatches: content.dressCodeSwatches } as never),
    },
    templateSlots: { listSlotItems },
    lookupEditorManifest: lookupTemplateEditorManifest,
  };
}

describe("draft loading, immutable Review and template switching", () => {
  const vhCanonical = () => canonicalOf(vhInput("COMMON", {}));

  it("reads only the CURRENT exact template version's rows and validates them", async () => {
    const listSlotItems = vi.fn(async (_client: string, _projectId: string, versionId: string) =>
      versionId === FIXTURE_TEMPLATE_VERSION_ID ? rowsFor(CLUSTER_AND_GALLERY) : rowsFor({ gallery: [PHOTO.E] }),
    );
    const input = await loadSnapshotPayloadInput(vhCanonical(), STAFF, gateways(vhMedia(), listSlotItems));
    expect(listSlotItems.mock.calls).toEqual([["staff-client", FIXTURE_PROJECT_ID, FIXTURE_TEMPLATE_VERSION_ID]]);
    expect(input.templateMedia?.slots.portraitCluster).toEqual([PHOTO.A, PHOTO.B, PHOTO.C]);
    expect(listSlotItems.mock.calls.some(([, , version]) => version === OTHER_VERSION)).toBe(false);
  });

  it("an invalid draft row blocks the Snapshot (never repaired)", async () => {
    const bad = vi.fn(async () => rowsFor({ portraitCluster: [PHOTO.A, PHOTO.B, PHOTO.C, PHOTO.D] }));
    await expect(loadSnapshotPayloadInput(vhCanonical(), STAFF, gateways(vhMedia(), bad))).rejects.toBeInstanceOf(SnapshotTemplateMediaInvariantError);
  });

  it("an unregistered renderer fails closed before reading slots", async () => {
    const listSlotItems = vi.fn(async () => []);
    const canonical = { ...vhCanonical(), templateVersion: { id: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: "wedding.unknown.v1" } };
    await expect(loadSnapshotPayloadInput(canonical, STAFF, gateways(vhMedia(), listSlotItems))).rejects.toBeInstanceOf(RendererSelectionError);
    expect(listSlotItems).not.toHaveBeenCalled();
  });

  it("a stored Review keeps assignments A after the draft changes to B; a new draft uses B", async () => {
    let draft = rowsFor(CLUSTER_AND_GALLERY);
    const deps = gateways(vhMedia(), async () => draft);
    const reviewPayload = built(await loadSnapshotPayloadInput(vhCanonical(), STAFF, deps));
    const persisted: unknown = JSON.parse(JSON.stringify(reviewPayload));

    draft = rowsFor({ portraitCluster: [PHOTO.E], gallery: [] });

    const rendered = assertStoredReviewSnapshot({ variant: "COMMON", templateVersionId: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: VH_KEY, payload: persisted });
    const viewModel = buildInvitationViewModel({ snapshot: rendered, mediaResolutions: await resolveSnapshotMedia(rendered, createFixtureMediaResolver()) });
    expect(viewModel.media.templateSlots?.portraitCluster?.map((entry) => entry.mediaId)).toEqual([PHOTO.A, PHOTO.B, PHOTO.C]);
    expect(viewModel.media.templateSlots?.gallery?.map((entry) => entry.mediaId)).toEqual([PHOTO.A, PHOTO.D]);

    const nextDraft = built(await loadSnapshotPayloadInput(vhCanonical(), STAFF, deps));
    expect(nextDraft.media.templateSlots?.portraitCluster).toEqual([PHOTO.E]);
  });

  it("switching back to a version reuses its retained rows; no copy across versions", async () => {
    const byVersion: Record<string, TemplateMediaSlotItem[]> = {
      [FIXTURE_TEMPLATE_VERSION_ID]: rowsFor({ heroPhoto: [PHOTO.A] }),
      [OTHER_VERSION]: rowsFor({ heroPhoto: [PHOTO.B] }),
    };
    const deps = gateways(vhMedia(), async (_client, _projectId, version) => byVersion[version] ?? []);
    const forVersion = (id: string) => {
      const canonical = vhCanonical();
      return { ...canonical, design: { ...canonical.design, templateVersionId: id }, templateVersion: { id, rendererKey: VH_KEY } };
    };
    const a = await loadSnapshotPayloadInput(forVersion(FIXTURE_TEMPLATE_VERSION_ID), STAFF, deps);
    const b = await loadSnapshotPayloadInput(forVersion(OTHER_VERSION), STAFF, deps);
    const aAgain = await loadSnapshotPayloadInput(forVersion(FIXTURE_TEMPLATE_VERSION_ID), STAFF, deps);
    expect(a.templateMedia?.slots.heroPhoto).toEqual([PHOTO.A]);
    expect(b.templateMedia?.slots.heroPhoto).toEqual([PHOTO.B]);
    expect(aAgain.templateMedia?.slots).toStrictEqual(a.templateMedia?.slots);
  });

  it("publish copies the approved Review Snapshot and pins; it never reads draft slot rows", () => {
    const sources = readdirSync(join(ROOT, "lib/server/invitation-publish"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(join(ROOT, "lib/server/invitation-publish", name), "utf8"))
      .join("\n");
    expect(sources).not.toMatch(/templateSlots|template_media_slot|listSlotItems|loadSnapshotPayloadInput|buildSnapshotPayload/);
    const publishSql = readFileSync(join(ROOT, "supabase/migrations/20260911041158_0038_publish_invitation.sql"), "utf8");
    expect(publishSql).not.toMatch(/project_template_media_slot_items/);
  });
});

describe("TE-04 scope", () => {
  it("adds no migration (0046 stays the last; 0045 absent)", () => {
    const names = readdirSync(join(ROOT, "supabase/migrations")).sort();
    // OWS-04 (checkpoint maintenance): exactly the data-only catalog seed 0047 may follow 0046.
    // DB-CONSISTENCY-01 (checkpoint maintenance): exactly the data-only VH/RM catalog seed 0048 may follow 0047.
    expect(names.slice(-3)).toEqual(["20260911041206_0046_project_template_media_slots.sql", "20260911041207_0047_seed_our_wedding_story_v1_catalog.sql", "20260911041208_0048_seed_vietnamese_heritage_romantic_minimal_v1_catalog.sql"]);
    expect(names.some((name) => /_0045_/.test(name))).toBe(false);
  });

  it("no committed renderer consumes templateSlots yet (VH-02A will)", () => {
    const walk = (dir: string): string[] =>
      readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? (entry.name === "__tests__" ? [] : walk(`${dir}/${entry.name}`)) : [`${dir}/${entry.name}`],
      );
    for (const file of walk("templates/wedding/elegant-editorial").filter((name) => /\.(ts|tsx)$/.test(name))) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(/templateSlots/);
    }
  });
});
