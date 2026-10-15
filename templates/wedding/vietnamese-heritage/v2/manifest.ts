import type { RendererProductionManifestV1 } from "../../../core/renderer-manifest";

/**
 * Vietnamese Heritage v2 — full production renderer manifest
 * (docs/DECISIONS.md "VH-V2-01 — Vietnamese Heritage v2"; the VH-01
 * contract and RF-06-0 P14–P20 apply unchanged).
 *
 * v2 exists because v1 is released and immutable (RF7/RF14): the same data
 * contract, sections, slots and design keys as v1, with the Product
 * Owner-approved gift intro, typography and motion. Data only: no React, no
 * `"use client"`, no browser globals, no `lib/server/**` import (P17), no
 * fonts, CSS or assets. Validated by `validateRendererProductionManifest`
 * only through the production manifest list. It freezes at catalog seeding,
 * after which any incompatible change is v3, never an edit here (P22).
 */
export const VIETNAMESE_HERITAGE_V2_MANIFEST: RendererProductionManifestV1 = {
  identity: {
    eventType: "WEDDING",
    templateCode: "vietnamese-heritage",
    versionNumber: 2,
    displayName: "Vietnamese Heritage",
  },
  compatibility: {
    rendererKey: "wedding.vietnamese-heritage.v2",
    supportedPayloadSchemaVersions: [1],
    supportedVariants: ["COMMON", "GROOM", "BRIDE"],
    sectionCapabilities: {
      // The approved direction shows only the salutation + guest line, never a
      // free-text invitation message (VH-01 mapping; same shape as the
      // Elegant Editorial Micro-Checkpoint 10 ruling).
      invitationMessage: false,
      loveStory: true,
      gallery: true,
      music: true,
      gift: true,
      timeline: true,
      dressCode: true,
      // The approved direction has no Photo Story section (VH-01 mapping).
      photoStory: false,
    },
  },
  design: {
    schemaVersion: 1,
    palettes: ["heritage-vermilion"],
    fontPresets: ["heritage-classic"],
    effectPresets: ["STANDARD"],
    sectionSettingsSchema: {
      loveStory: { type: "boolean" },
      gallery: { type: "boolean" },
      music: { type: "boolean" },
      gift: { type: "boolean" },
      timeline: { type: "boolean" },
      dressCode: { type: "boolean" },
    },
    designSettingsSchema: {},
  },
};
