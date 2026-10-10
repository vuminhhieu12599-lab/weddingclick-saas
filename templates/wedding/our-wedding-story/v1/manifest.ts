import type { RendererProductionManifestV1 } from "../../../core/renderer-manifest";

/**
 * Our Wedding Story v1 — full production renderer manifest
 * (docs/DECISIONS.md "OWS-01 — Our Wedding Story v1 Production Renderer";
 * RF-06-0 P14–P20 apply unchanged).
 *
 * Data only: no React, no `"use client"`, no browser globals, no
 * `lib/server/**` import (P17), no fonts, CSS or assets. Proposed at OWS-01;
 * it freezes at catalog seeding, after which any incompatible change is v2,
 * never an edit here (P22).
 */
export const OUR_WEDDING_STORY_V1_MANIFEST: RendererProductionManifestV1 = {
  identity: {
    eventType: "WEDDING",
    templateCode: "our-wedding-story",
    versionNumber: 1,
    displayName: "Our Wedding Story",
  },
  compatibility: {
    rendererKey: "wedding.our-wedding-story.v1",
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
