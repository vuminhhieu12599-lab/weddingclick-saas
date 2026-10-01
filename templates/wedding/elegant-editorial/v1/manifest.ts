import type { RendererProductionManifestV1 } from "../../../core/renderer-manifest";

/**
 * Elegant Editorial v1 — full production renderer manifest (docs/DECISIONS.md
 * "RF-06-0 First Production Renderer Contract Clarification" P14–P17).
 *
 * The exact frozen P16 values. Data only: no React, no `"use client"`, no
 * browser globals, no `lib/server/**` import (P17), no fonts, CSS or assets.
 * Validated by `validateRendererProductionManifest` only through the
 * production manifest list. Any incompatible change is v2, never an edit
 * here after the RF-06F freeze (P22).
 */
export const ELEGANT_EDITORIAL_V1_MANIFEST: RendererProductionManifestV1 = {
  identity: {
    eventType: "WEDDING",
    templateCode: "elegant-editorial",
    versionNumber: 1,
    displayName: "Elegant Editorial",
  },
  compatibility: {
    rendererKey: "wedding.elegant-editorial.v1",
    supportedPayloadSchemaVersions: [1],
    supportedVariants: ["COMMON", "GROOM", "BRIDE"],
    sectionCapabilities: {
      // Micro-Checkpoint 10 Product Owner ruling: v1 renders only the two-line
      // invitation block, never the canonical invitation message.
      invitationMessage: false,
      loveStory: true,
      gallery: true,
      music: true,
      gift: true,
      timeline: true,
      dressCode: true,
      photoStory: true,
    },
  },
  design: {
    schemaVersion: 1,
    palettes: ["green-ivory"],
    fontPresets: ["editorial-classic"],
    effectPresets: ["STANDARD"],
    sectionSettingsSchema: {
      loveStory: { type: "boolean" },
      gallery: { type: "boolean" },
      music: { type: "boolean" },
      gift: { type: "boolean" },
      timeline: { type: "boolean" },
      dressCode: { type: "boolean" },
      photoStory: { type: "boolean" },
    },
    designSettingsSchema: {},
  },
};
