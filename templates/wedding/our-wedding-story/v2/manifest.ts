import type { RendererProductionManifestV1 } from "../../../core/renderer-manifest";

/**
 * Our Wedding Story v2 — full production renderer manifest
 * (docs/DECISIONS.md "OWS-V2-01"; RF-06-0 P14–P20 apply unchanged).
 *
 * Data only: no React, no `"use client"`, no browser globals, no
 * `lib/server/**` import (P17), no fonts, CSS or assets. Identical to the
 * released v1 manifest except `versionNumber: 2` and the renderer key: same
 * payload schema, variants, section capabilities and design set, so v2 is a
 * presentation-only version (no gate, helper texts removed, gift typography,
 * motion). It freezes at catalog seeding; any later incompatible change is a
 * v3, never an edit here (P22).
 */
export const OUR_WEDDING_STORY_V2_MANIFEST: RendererProductionManifestV1 = {
  identity: {
    eventType: "WEDDING",
    templateCode: "our-wedding-story",
    versionNumber: 2,
    displayName: "Our Wedding Story",
  },
  compatibility: {
    rendererKey: "wedding.our-wedding-story.v2",
    supportedPayloadSchemaVersions: [1],
    supportedVariants: ["COMMON", "GROOM", "BRIDE"],
    sectionCapabilities: {
      // The approved Visual Freeze v1 invitation card shows only the
      // salutation and guest line, never a free-text invitation message.
      invitationMessage: false,
      loveStory: true,
      gallery: true,
      music: true,
      gift: true,
      // The approved direction has no Timeline, Dress Code or Photo Story section.
      timeline: false,
      dressCode: false,
      photoStory: false,
    },
  },
  design: {
    schemaVersion: 1,
    palettes: ["warm-champagne"],
    fontPresets: ["champagne-editorial"],
    effectPresets: ["STANDARD"],
    sectionSettingsSchema: {
      loveStory: { type: "boolean" },
      gallery: { type: "boolean" },
      music: { type: "boolean" },
      gift: { type: "boolean" },
    },
    designSettingsSchema: {},
  },
};
