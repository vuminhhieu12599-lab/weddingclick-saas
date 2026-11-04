import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { InvitationRendererCapabilitiesV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { RendererEffectiveSections } from "../../../../../lib/invitation-rendering/renderer-selection";
import type { BuildSnapshotPayloadInput, SnapshotDesignSettingValue, SnapshotMediaSource } from "../../../../../lib/invitation-rendering/snapshot-payload-types";
import { buildTemplateMediaSource } from "../../../../../lib/server/invitation-snapshot/build-template-media-source";
import type { TemplateMediaSlotItem } from "../../../../../lib/server/template-media/template-media-slot-types";
import { createFixtureMediaResolver } from "../../../../core/fixtures/fixture-media-resolver";
import { runRendererFixturePipeline, type RendererFixture } from "../../../../core/fixtures/renderer-fixture-pipeline";
import {
  FIXTURE_PROJECT_ID,
  buildRendererFixtureSourceInput,
  type RendererFixtureSourceOptions,
} from "../../../../core/fixtures/renderer-fixture-sources";
import {
  createProductionCompatibilityRegistry,
  type ProductionCompatibilityRegistryV1,
} from "../../../../core/production-renderer-manifests";
import { HONG_AN_V2_EDITOR_MANIFEST } from "../../../../editor/wedding/hong-an-v2";
import { HONG_AN_V1_MANIFEST } from "../../v1/manifest";
import { HONG_AN_V2_COPY } from "../copy";
import { HONG_AN_V2_MANIFEST } from "../manifest";
import { resolveScriptureQuote } from "../sections/scripture-quote";

// next/font loaders only run under the Next compiler; `npm run build` proves the real configuration.
vi.mock("../fonts", () => ({ HONG_AN_V2_FONT_VARIABLES_CLASS_NAME: "ha2-test-font-variables" }));

const { HongAnV2 } = await import("../hong-an-v2");

/**
 * HA-CONTENT-01 — the one thing Hồng Ân v2 exists to add: a Staff-configured
 * Scripture quote, shown consistently in the two approved places, defaulting
 * to the template's own approved copy and never falsely attributed.
 *
 * Hồng Ân v1 is frozen and keeps its own suite; this file covers v2's
 * difference and proves v1 is untouched. Every ViewModel comes from the real
 * pipeline (canonical fixture records → Snapshot → media resolution →
 * ViewModel → RF-04 selection), so a manifest that could not be registered
 * in production cannot pass these tests either.
 */

const EMPTY: InvitationRendererCapabilitiesV1 = Object.freeze({});
const DEFAULT_VERSE = HONG_AN_V2_COPY.scripture.verse;
const DEFAULT_REFERENCE = HONG_AN_V2_COPY.scripture.reference;

const CUSTOM_VERSE = "Tình yêu thương tha thứ tất cả, tin tưởng tất cả, chịu đựng tất cả.";
const CUSTOM_REFERENCE = "1 Cr 13,7";

const OPENING_PHOTO = "00000000-0000-4000-8000-0000000007a1";

const HA2_REGISTRY: ProductionCompatibilityRegistryV1 = createProductionCompatibilityRegistry([HONG_AN_V2_MANIFEST]);

function slotRows(assignments: Partial<Record<string, readonly string[]>>): TemplateMediaSlotItem[] {
  return Object.entries(assignments).flatMap(([slotKey, ids]) =>
    (ids ?? []).map((projectMediaId, position) => ({ slotKey, position, projectMediaId })),
  );
}

function ha2Source(
  options: RendererFixtureSourceOptions,
  designSettings: Record<string, SnapshotDesignSettingValue>,
): BuildSnapshotPayloadInput {
  const input = buildRendererFixtureSourceInput(options);
  const { design, compatibility } = HONG_AN_V2_MANIFEST;
  const photos: SnapshotMediaSource[] = [OPENING_PHOTO].map((id, index) => ({
    id,
    projectId: FIXTURE_PROJECT_ID,
    mediaType: "PHOTO",
    sortOrder: index,
  }));
  const media = [...input.media, ...photos];
  return {
    ...input,
    media,
    design: {
      ...input.design,
      paletteKey: design.palettes[0] as string,
      fontPresetKey: design.fontPresets[0] as string,
      effectPresetKey: design.effectPresets[0] as string,
      // The Project's configured settings, carried by the Snapshot exactly
      // as a real `project_design` row would be.
      designSettings,
    },
    templateVersion: { ...input.templateVersion, rendererKey: compatibility.rendererKey },
    templateMedia: buildTemplateMediaSource(HONG_AN_V2_EDITOR_MANIFEST, slotRows({ openingPhoto: [OPENING_PHOTO] }), media),
  };
}

async function ha2Fixture(designSettings: Record<string, SnapshotDesignSettingValue> = {}): Promise<RendererFixture> {
  return runRendererFixturePipeline(ha2Source({ variant: "COMMON" }, designSettings), {
    resolver: createFixtureMediaResolver({}),
    registry: HA2_REGISTRY,
  });
}

function render(
  viewModel: InvitationViewModel,
  sections: RendererEffectiveSections,
  capabilities: InvitationRendererCapabilitiesV1 = EMPTY,
): string {
  return renderToStaticMarkup(<HongAnV2 viewModel={viewModel} sections={sections} capabilities={capabilities} />);
}

/** How many times a string appears in the rendered markup. */
function occurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/**
 * The approved composition shows the verse three times: behind the doors
 * (the cover), on the photo hero, and in the "Lời Chúa" section. All three
 * must agree, which is the point of resolving the quote once.
 */
const VERSE_PLACES = 3;

describe("Hồng Ân v2 Scripture quote — the configured value", () => {
  it("falls back to the approved default verse AND reference when nothing is configured", async () => {
    const { viewModel, selection } = await ha2Fixture();
    const html = render(viewModel, selection.effectiveSections);
    expect(occurrences(html, DEFAULT_VERSE)).toBe(VERSE_PLACES);
    expect(occurrences(html, DEFAULT_REFERENCE)).toBe(VERSE_PLACES);
    expect(html).not.toContain(CUSTOM_VERSE);
  });

  it("shows a configured verse and reference in every place, and the default nowhere", async () => {
    const { viewModel, selection } = await ha2Fixture({
      scriptureVerse: CUSTOM_VERSE,
      scriptureReference: CUSTOM_REFERENCE,
    });
    const html = render(viewModel, selection.effectiveSections);
    expect(occurrences(html, CUSTOM_VERSE)).toBe(VERSE_PLACES);
    expect(occurrences(html, CUSTOM_REFERENCE)).toBe(VERSE_PLACES);
    expect(html).not.toContain(DEFAULT_VERSE);
    expect(html).not.toContain(DEFAULT_REFERENCE);
  });

  it("never attributes a configured verse to the default reference when no reference is configured", async () => {
    const { viewModel, selection } = await ha2Fixture({ scriptureVerse: CUSTOM_VERSE });
    const html = render(viewModel, selection.effectiveSections);
    expect(occurrences(html, CUSTOM_VERSE)).toBe(VERSE_PLACES);
    // The release-blocking case: a false citation of Scripture.
    expect(html).not.toContain(DEFAULT_REFERENCE);
    // And no empty attribution furniture is left behind.
    expect(html).not.toContain("— —");
    expect(html).not.toContain("<cite");
  });

  it("keeps the default verse with a configured reference (the pair stays consistent)", async () => {
    const { viewModel, selection } = await ha2Fixture({ scriptureReference: CUSTOM_REFERENCE });
    const html = render(viewModel, selection.effectiveSections);
    expect(occurrences(html, DEFAULT_VERSE)).toBe(VERSE_PLACES);
    expect(occurrences(html, CUSTOM_REFERENCE)).toBe(VERSE_PLACES);
    expect(html).not.toContain(DEFAULT_REFERENCE);
  });

  it("clearing the override restores the default (an absent key, exactly as the editor saves it)", async () => {
    const custom = await ha2Fixture({ scriptureVerse: CUSTOM_VERSE, scriptureReference: CUSTOM_REFERENCE });
    expect(render(custom.viewModel, custom.selection.effectiveSections)).toContain(CUSTOM_VERSE);
    const cleared = await ha2Fixture({});
    const html = render(cleared.viewModel, cleared.selection.effectiveSections);
    expect(occurrences(html, DEFAULT_VERSE)).toBe(VERSE_PLACES);
    expect(occurrences(html, DEFAULT_REFERENCE)).toBe(VERSE_PLACES);
  });

  it("the two displayed locations always agree, for every configuration", async () => {
    const cases: Record<string, SnapshotDesignSettingValue>[] = [
      {},
      { scriptureVerse: CUSTOM_VERSE },
      { scriptureReference: CUSTOM_REFERENCE },
      { scriptureVerse: CUSTOM_VERSE, scriptureReference: CUSTOM_REFERENCE },
    ];
    for (const settings of cases) {
      const { viewModel, selection } = await ha2Fixture(settings);
      const html = render(viewModel, selection.effectiveSections);
      const quote = resolveScriptureQuote(viewModel.design);
      // One resolved value, shown the same number of times in each place.
      expect(occurrences(html, quote.verse), JSON.stringify(settings)).toBe(VERSE_PLACES);
      expect(occurrences(html, quote.reference ?? "\u0000"), JSON.stringify(settings)).toBe(
        quote.reference === undefined ? 0 : VERSE_PLACES,
      );
    }
  });

  it("renders configured text as text, never as markup", async () => {
    // The editor rejects angle brackets, but the renderer must be safe on its
    // own: React escapes text nodes, so a hand-edited payload cannot inject.
    const { viewModel, selection } = await ha2Fixture({ scriptureVerse: '<img src=x onerror="alert(1)">' });
    const html = render(viewModel, selection.effectiveSections);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});

describe("the quote freezes into each snapshot (CLAUDE.md §8)", () => {
  it("the Snapshot carries the configured quote, so a Review renders what was approved", async () => {
    const { snapshot } = await ha2Fixture({ scriptureVerse: CUSTOM_VERSE, scriptureReference: CUSTOM_REFERENCE });
    expect(snapshot.design.designSettings).toStrictEqual({
      scriptureVerse: CUSTOM_VERSE,
      scriptureReference: CUSTOM_REFERENCE,
    });
    expect(snapshot.template.rendererKey).toBe("wedding.hong-an.v2");
  });

  it("a later draft edit cannot reach an already-built snapshot", async () => {
    // The builder copies the settings rather than referencing the design row,
    // so the payload a Review persisted keeps its own words. This is the
    // release-blocking case "published invitation changing when mutable draft
    // changes" (CLAUDE.md §30).
    const draftSettings: Record<string, SnapshotDesignSettingValue> = {
      scriptureVerse: CUSTOM_VERSE,
      scriptureReference: CUSTOM_REFERENCE,
    };
    const input = ha2Source({ variant: "COMMON" }, draftSettings);
    const review = await runRendererFixturePipeline(input, {
      resolver: createFixtureMediaResolver({}),
      registry: HA2_REGISTRY,
    });
    // Staff now edit the draft — the very object the snapshot was built from.
    draftSettings.scriptureVerse = "Câu hoàn toàn khác.";
    delete draftSettings.scriptureReference;

    expect(review.snapshot.design.designSettings).toStrictEqual({
      scriptureVerse: CUSTOM_VERSE,
      scriptureReference: CUSTOM_REFERENCE,
    });
    const html = render(review.viewModel, review.selection.effectiveSections);
    expect(occurrences(html, CUSTOM_VERSE)).toBe(VERSE_PLACES);
    expect(html).not.toContain("Câu hoàn toàn khác.");
  });

  it("a snapshot built before any override still renders the default, unchanged", async () => {
    // Exactly the shape of an existing Review #1: no scripture keys at all.
    const { snapshot, viewModel, selection } = await ha2Fixture({});
    expect(snapshot.design.designSettings).toStrictEqual({});
    const html = render(viewModel, selection.effectiveSections);
    expect(occurrences(html, DEFAULT_VERSE)).toBe(VERSE_PLACES);
    expect(occurrences(html, DEFAULT_REFERENCE)).toBe(VERSE_PLACES);
  });
});

describe("resolveScriptureQuote (pure)", () => {
  const design = (designSettings: Record<string, SnapshotDesignSettingValue>) => ({
    paletteKey: "hong-an-ivory",
    fontPresetKey: "hong-an-cathedral",
    effectPresetKey: "STANDARD",
    sectionSettings: {},
    designSettings,
  });

  it("defaults both parts when neither is configured", () => {
    expect(resolveScriptureQuote(design({}))).toStrictEqual({ verse: DEFAULT_VERSE, reference: DEFAULT_REFERENCE });
  });

  it("drops the reference for a configured verse that has none", () => {
    expect(resolveScriptureQuote(design({ scriptureVerse: CUSTOM_VERSE }))).toStrictEqual({
      verse: CUSTOM_VERSE,
      reference: undefined,
    });
  });

  it("treats a wrong-typed or whitespace-only value as absent instead of rendering it", () => {
    // Neither can be stored through the design API; this is belt-and-braces
    // so a hand-edited or legacy payload degrades to the default.
    expect(resolveScriptureQuote(design({ scriptureVerse: 42 }))).toStrictEqual({
      verse: DEFAULT_VERSE,
      reference: DEFAULT_REFERENCE,
    });
    expect(resolveScriptureQuote(design({ scriptureVerse: "   ", scriptureReference: "\t" }))).toStrictEqual({
      verse: DEFAULT_VERSE,
      reference: DEFAULT_REFERENCE,
    });
  });

  it("trims outer whitespace but keeps the words exactly", () => {
    expect(resolveScriptureQuote(design({ scriptureVerse: `  ${CUSTOM_VERSE}  ` })).verse).toBe(CUSTOM_VERSE);
  });
});

describe("Hồng Ân v2 is v1 plus the quote, and nothing else", () => {
  const V1 = join(__dirname, "..", "..", "v1");
  const V2 = join(__dirname, "..");
  const read = (root: string, relative: string) => readFileSync(join(root, relative), "utf8");

  /** v1's text with its own identifiers rewritten to v2's, for a like-for-like diff. */
  const asV2 = (text: string) =>
    text
      .replace(/HONG_AN_V1_/g, "HONG_AN_V2_")
      .replace(/HongAnV1/g, "HongAnV2")
      .replace(/hong-an-v1/g, "hong-an-v2")
      // The doc-comment version label, and the asset paths that stay v1's.
      .replace(/Hồng Ân v1/g, "Hồng Ân v2")
      .replace(/wedding\/hong-an\/v2\//g, "wedding/hong-an/v1/");

  it("the stylesheet is v1's, unchanged apart from its own name and task tag", () => {
    const v1 = asV2(read(V1, "hong-an-v1.module.css"));
    const v2 = read(V2, "hong-an-v2.module.css");
    // Only the header comment's version and task tag differ: not one rule,
    // token, keyframe or media query changes (approved Gothic styling,
    // typography, animations, layout and spacing all preserved).
    expect(v2.replace(/^\/\*[\s\S]*?\*\//, "")).toBe(v1.replace(/^\/\*[\s\S]*?\*\//, ""));
  });

  it("every section and island is v1's code, apart from the quote's own two files", () => {
    const unchanged = [
      "sections/arch.tsx",
      "sections/ceremony.tsx",
      "sections/closing.tsx",
      "sections/event-selection.ts",
      "sections/families.tsx",
      "sections/gift-panels.ts",
      "sections/invitation.tsx",
      "sections/love-story.tsx",
      "sections/photo-frame.ts",
      "sections/reception.tsx",
      "sections/timeline.tsx",
      "interactive/countdown.tsx",
      "interactive/gallery.tsx",
      "interactive/gift.tsx",
      "interactive/music-control.tsx",
      "interactive/opening-geometry.ts",
      "interactive/rsvp.tsx",
      "interactive/section-reveal.tsx",
    ];
    for (const file of unchanged) {
      expect(read(V2, file), file).toBe(asV2(read(V1, file)));
    }
  });

  it("the opening artwork and interior ornaments are v1's immutable paths — no v2 asset directory", () => {
    const geometry = read(V2, "interactive/opening-geometry.ts");
    const css = read(V2, "hong-an-v2.module.css");
    for (const text of [geometry, css]) {
      expect(text).toContain("/renderers/wedding/hong-an/v1/");
      expect(text).not.toContain("/renderers/wedding/hong-an/v2/");
    }
  });

  it("v1 keeps its empty design settings schema: it can never acquire this capability", () => {
    expect(HONG_AN_V1_MANIFEST.design.designSettingsSchema).toStrictEqual({});
    expect(HONG_AN_V1_MANIFEST.compatibility.rendererKey).toBe("wedding.hong-an.v1");
    // Only the declared keys the renderer actually reads.
    expect(Object.keys(HONG_AN_V2_MANIFEST.design.designSettingsSchema).sort()).toStrictEqual([
      "scriptureReference",
      "scriptureVerse",
    ]);
  });

  it("all fourteen approved parts still render, with the same section capabilities as v1", async () => {
    expect(HONG_AN_V2_MANIFEST.compatibility.sectionCapabilities).toStrictEqual(
      HONG_AN_V1_MANIFEST.compatibility.sectionCapabilities,
    );
    const { viewModel, selection } = await ha2Fixture();
    const html = render(viewModel, selection.effectiveSections);
    // The countdown is deliberately absent: it exists only while the host
    // supplies `capabilities.clock`, which it does only in the browser, so no
    // current time ever reaches server markup.
    for (const heading of [
      HONG_AN_V2_COPY.invitation.heading,
      HONG_AN_V2_COPY.families.heading,
      HONG_AN_V2_COPY.timeline.heading,
      HONG_AN_V2_COPY.scripture.heading,
    ]) {
      expect(html, heading).toContain(heading);
    }
    expect(html).toContain('data-renderer="hong-an-v2"');
  });
});
