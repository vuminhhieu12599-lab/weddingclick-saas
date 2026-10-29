import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildRendererFixtureSourceInput } from "../../../../templates/core/fixtures/renderer-fixture-sources";
import { SE_DUYEN_V1_EDITOR_MANIFEST } from "../../../../templates/editor/wedding/se-duyen-v1";
import { buildInvitationWording } from "../../../../templates/wedding/se-duyen/v1/sections/invitation-wording";
import { buildSnapshotPayload } from "../../../invitation-rendering/build-snapshot-payload";
import type {
  BuildSnapshotPayloadInput,
  SnapshotPayloadV1,
  SnapshotWeddingDetailsSource,
} from "../../../invitation-rendering/snapshot-payload-types";
import { checkPublicationReadiness, SE_DUYEN_SUPPORTED_WORDING_TOKENS } from "../publication-readiness";

/**
 * SD-V1-RELEASE-01: the two Product Owner rules that gate a Se Duyên
 * invitation on the one path into the publication pipeline — at least one
 * genuine customer photograph in ANY slot, and no unresolved placeholder in
 * the customer's invitation sentence.
 */

const SD_KEY = "wedding.se-duyen.v1";
const SD2_KEY = "wedding.se-duyen.v2";
const SLOT_KEYS = SE_DUYEN_V1_EDITOR_MANIFEST.mediaSlots.map((slot) => slot.key);
const GALLERY_SLOT_KEYS = SE_DUYEN_V1_EDITOR_MANIFEST.mediaSlots
  .filter((slot) => slot.sectionKey === "gallery")
  .map((slot) => slot.key);

function requireDetails(details: SnapshotWeddingDetailsSource | null): SnapshotWeddingDetailsSource {
  if (details === null) throw new Error("the shared fixture must carry wedding details");
  return details;
}

const fixture = buildRendererFixtureSourceInput({ variant: "COMMON" });
const fixtureDetails = requireDetails(fixture.weddingDetails);

/** Real slot-assignable Project photographs from the shared fixture. */
const PHOTO_IDS = fixture.media.filter((item) => item.mediaType === "GALLERY").map((item) => item.id);
const EMPTY_SLOTS = Object.fromEntries(SLOT_KEYS.map((key) => [key, [] as string[]]));

interface Options {
  readonly slots?: Record<string, readonly string[]>;
  readonly message?: string | null;
  readonly rendererKey?: string;
  /** Omit `templateMedia` entirely, as a LEGACY_ROLES renderer does. */
  readonly legacyMedia?: true;
}

function snapshot(options: Options = {}): SnapshotPayloadV1 {
  const input: BuildSnapshotPayloadInput = {
    ...fixture,
    weddingDetails: { ...fixtureDetails, invitationMessage: options.message ?? null },
    templateVersion: { ...fixture.templateVersion, rendererKey: options.rendererKey ?? SD_KEY },
  };
  if (options.legacyMedia === undefined) {
    input.templateMedia = {
      slots: { ...EMPTY_SLOTS, ...(options.slots ?? {}) },
      gallerySlotKeys: GALLERY_SLOT_KEYS,
    };
  }
  const built = buildSnapshotPayload(input);
  if (built.status !== "SUCCESS") throw new Error("the fixture snapshot must build");
  return built.payload;
}

const codes = (payload: SnapshotPayloadV1) => checkPublicationReadiness(payload).map((issue) => issue.code);

describe("other templates are unaffected", () => {
  it("every other renderer returns no issues, with no photo and an unresolvable placeholder", () => {
    const legacy = snapshot({ rendererKey: fixture.templateVersion.rendererKey, legacyMedia: true, message: "Kính mời {ten}" });
    expect(legacy.template.rendererKey).not.toBe(SD_KEY);
    expect(checkPublicationReadiness(legacy)).toStrictEqual([]);
  });

  it("the rules key off the renderer alone: the same empty Snapshot blocks only under Se Duyên", () => {
    expect(checkPublicationReadiness(snapshot({ rendererKey: "wedding.our-wedding-story.v2" }))).toStrictEqual([]);
    expect(codes(snapshot())).toStrictEqual(["SE_DUYEN_CUSTOMER_PHOTO_REQUIRED"]);
  });
});

describe("SD-V2-01: v2 carries the same rules as v1", () => {
  // The two rules are about the DIRECTION, not one implementation of it, so
  // a Project published on v2 is gated exactly as one on v1. A version left
  // out of the guard would publish without them (CLAUDE.md §22).
  it("blocks a v2 Project with no photograph in any slot, with the same issue code", () => {
    expect(codes(snapshot({ rendererKey: SD2_KEY }))).toStrictEqual(["SE_DUYEN_CUSTOMER_PHOTO_REQUIRED"]);
  });

  it("blocks an unresolvable placeholder under v2 too", () => {
    const payload = snapshot({ rendererKey: SD2_KEY, slots: { gallery: [PHOTO_IDS[0] as string] }, message: "Kính mời {ten}" });
    expect(codes(payload)).toStrictEqual(["SE_DUYEN_UNSUPPORTED_WORDING_TOKEN"]);
  });

  it("passes a v2 Project with one real photograph and supported tokens, exactly as v1 does", () => {
    const options = { slots: { gallery: [PHOTO_IDS[0] as string] }, message: "Kính mời {guest} tới dự {ceremonyTitle}" };
    expect(checkPublicationReadiness(snapshot({ rendererKey: SD2_KEY, ...options }))).toStrictEqual([]);
    expect(checkPublicationReadiness(snapshot({ rendererKey: SD_KEY, ...options }))).toStrictEqual([]);
  });
});

describe("at least one genuine customer photograph, in any slot", () => {
  it("blocks a Project with no photograph in any slot", () => {
    const issues = checkPublicationReadiness(snapshot());
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("SE_DUYEN_CUSTOMER_PHOTO_REQUIRED");
    expect(issues[0]?.severity).toBe("BLOCKING");
    expect(issues[0]?.message).toContain("at least one real customer photograph");
  });

  it("blocks when the Snapshot carries no slot media at all (fail safe, never pass by absence)", () => {
    expect(codes(snapshot({ legacyMedia: true }))).toStrictEqual(["SE_DUYEN_CUSTOMER_PHOTO_REQUIRED"]);
  });

  it.each(SLOT_KEYS)("one photograph in %s alone satisfies the rule — no slot is privileged", (key) => {
    expect(checkPublicationReadiness(snapshot({ slots: { [key]: [PHOTO_IDS[0] as string] } }))).toStrictEqual([]);
  });

  it("the album counts, and openingPhoto is specifically NOT required", () => {
    const albumOnly = snapshot({ slots: { gallery: PHOTO_IDS.slice(0, 2) } });
    expect(albumOnly.media.templateSlots?.openingPhoto).toStrictEqual([]);
    expect(checkPublicationReadiness(albumOnly)).toStrictEqual([]);
  });

  it("only real Project photographs can satisfy it: the renderer's own artwork is never Project media", () => {
    // Every id in `templateSlots` was already proved to be a slot-assignable
    // photo of this Project by the builder, so a decorative or demo image
    // cannot appear here at all.
    expect(() =>
      snapshot({ slots: { openingPhoto: ["/renderers/wedding/se-duyen/v1/lotus-fate-medallion.webp"] } }),
    ).toThrow(/not an assignable Project photo/);
  });
});

describe("no unresolved placeholder in the invitation sentence", () => {
  it("the supported vocabulary is exactly {guest} and {ceremonyTitle}", () => {
    expect(SE_DUYEN_SUPPORTED_WORDING_TOKENS).toStrictEqual(["{guest}", "{ceremonyTitle}"]);
  });

  const withPhoto = (message: string | null) => snapshot({ slots: { openingPhoto: [PHOTO_IDS[0] as string] }, message });

  it("passes a sentence using both supported tokens, and one with no placeholder at all", () => {
    expect(checkPublicationReadiness(withPhoto("Trân trọng kính mời {guest} đến dự {ceremonyTitle}."))).toStrictEqual([]);
    expect(checkPublicationReadiness(withPhoto("Sự hiện diện của quý khách là niềm vinh hạnh của gia đình."))).toStrictEqual([]);
    expect(checkPublicationReadiness(withPhoto(null))).toStrictEqual([]);
    expect(checkPublicationReadiness(withPhoto(""))).toStrictEqual([]);
  });

  it("blocks an unsupported token and quotes it back to Staff", () => {
    const issues = checkPublicationReadiness(withPhoto("Kính mời {ten} và {guest}"));
    expect(issues.map((issue) => issue.code)).toStrictEqual(["SE_DUYEN_UNSUPPORTED_WORDING_TOKEN"]);
    expect(issues[0]?.severity).toBe("BLOCKING");
    expect(issues[0]?.message).toContain("{ten}");
    expect(issues[0]?.message).not.toContain("{guest},");
  });

  it("blocks the right token in the wrong case — substitution is case-sensitive", () => {
    expect(codes(withPhoto("Kính mời {Guest}"))).toStrictEqual(["SE_DUYEN_UNSUPPORTED_WORDING_TOKEN"]);
    expect(codes(withPhoto("Kính mời {ceremonytitle}"))).toStrictEqual(["SE_DUYEN_UNSUPPORTED_WORDING_TOKEN"]);
  });

  it("blocks a malformed placeholder rather than treating a stray brace as ordinary text", () => {
    expect(codes(withPhoto("Kính mời {guest"))).toStrictEqual(["SE_DUYEN_UNSUPPORTED_WORDING_TOKEN"]);
    expect(codes(withPhoto("Kính mời guest}"))).toStrictEqual(["SE_DUYEN_UNSUPPORTED_WORDING_TOKEN"]);
    expect(codes(withPhoto("Kính mời {{guest}}"))).toStrictEqual(["SE_DUYEN_UNSUPPORTED_WORDING_TOKEN"]);
  });

  it("names at most three offenders and counts the rest", () => {
    const message = checkPublicationReadiness(withPhoto("{a} {b} {c} {d} {e}"))[0]?.message ?? "";
    expect(message).toContain("{a}, {b}, {c}");
    expect(message).toContain("and 2 more");
    expect(message).not.toContain("{d}");
  });

  it("an empty placeholder is unsupported too", () => {
    expect(codes(withPhoto("Kính mời {}"))).toStrictEqual(["SE_DUYEN_UNSUPPORTED_WORDING_TOKEN"]);
  });
});

describe("shape, order and purity", () => {
  it("both rules report together, photograph first, every issue BLOCKING", () => {
    const issues = checkPublicationReadiness(snapshot({ message: "Kính mời {ten}" }));
    expect(issues.map((issue) => issue.code)).toStrictEqual([
      "SE_DUYEN_CUSTOMER_PHOTO_REQUIRED",
      "SE_DUYEN_UNSUPPORTED_WORDING_TOKEN",
    ]);
    expect(issues.every((issue) => issue.severity === "BLOCKING")).toBe(true);
  });

  it("reads the Snapshot without changing it", () => {
    const payload = snapshot({ message: "Kính mời {ten}" });
    const before = JSON.stringify(payload);
    checkPublicationReadiness(payload);
    expect(JSON.stringify(payload)).toBe(before);
  });
});

describe("the guard is wired into the only path that creates a REVIEW", () => {
  const USE_CASE_FILE = join(__dirname, "../create-review-version.ts");
  const source = readFileSync(USE_CASE_FILE, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

  it("createReviewVersion runs the guard and returns BLOCKED before anything is persisted", () => {
    expect(source).toContain('from "./publication-readiness"');
    const checkedAt = source.indexOf("checkPublicationReadiness(snapshot)");
    const persistedAt = source.indexOf("deps.reviews.createReviewVersion(");
    expect(checkedAt).toBeGreaterThan(-1);
    expect(persistedAt).toBeGreaterThan(-1);
    expect(checkedAt).toBeLessThan(persistedAt);
    expect(source).toMatch(/return \{ status: "BLOCKED", issues: \[firstReadinessIssue, \.\.\.otherReadinessIssues\] \};/);
  });

  it("publication is only ever a copy of an approved REVIEW, so gating review gates publishing", () => {
    const publish = readFileSync(join(__dirname, "../../invitation-publish/publish-invitation.ts"), "utf8");
    // The publish use case builds nothing and inspects no content; the REVIEW
    // row is the only publication source. If that ever changes, this guard
    // needs a second home and this assertion should fail loudly.
    expect(publish).toContain("Nothing is built here: no draft load, no Snapshot, no media extraction.");
  });
});

describe("the renderer and the guard share one token vocabulary", () => {
  const WORDING_FILE = join(__dirname, "../../../../templates/wedding/se-duyen/v1/sections/invitation-wording.ts");

  it("the renderer substitutes exactly the tokens the guard allows, and nothing else", () => {
    const source = readFileSync(WORDING_FILE, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const substituted = [...source.matchAll(/\/\\\{(\w+)\\\}\/g/g)].map((match) => `{${match[1] as string}}`);
    expect(substituted.sort()).toStrictEqual([...SE_DUYEN_SUPPORTED_WORDING_TOKENS].sort());
  });

  it("a sentence that passes the guard keeps the customer's own words verbatim", () => {
    const wording = buildInvitationWording({
      message: "Trân trọng kính mời {guest} đến dự {ceremonyTitle} của gia đình chúng tôi.",
      guestText: "Anh Hiếu và gia đình",
      salutation: "Trân trọng kính mời",
      ceremonyTitle: "Lễ Vu Quy",
    });
    expect(wording.lead).toBe("");
    expect(wording.body).toBe("đến dự Lễ Vu Quy của gia đình chúng tôi.");
  });
});
