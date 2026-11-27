import type { RendererProductionManifestV1 } from "../../../core/renderer-manifest";

/**
 * Khăn Voan v1 — production renderer manifest (`wedding.khan-voan.v1`).
 *
 * Data only. The veil-lift opening, ivory satin paper and framed photo
 * chapters approved by the owner on 2026-11-27. Before the first paying
 * customer publishes on it this version may still change in place; after
 * that, visual changes go to v2 (CLAUDE.md hard rule 5).
 */
export const KHAN_VOAN_V1_MANIFEST: RendererProductionManifestV1 = {
  identity: {
    eventType: "WEDDING",
    templateCode: "khan-voan",
    versionNumber: 1,
    displayName: "Khăn Voan",
  },
  compatibility: {
    rendererKey: "wedding.khan-voan.v1",
    supportedPayloadSchemaVersions: [1],
    supportedVariants: ["COMMON", "GROOM", "BRIDE"],
    sectionCapabilities: {
      invitationMessage: true,
      loveStory: true,
      gallery: true,
      music: true,
      gift: true,
      timeline: false,
      dressCode: false,
      photoStory: false,
    },
  },
  design: {
    schemaVersion: 1,
    palettes: ["ivory-satin"],
    fontPresets: ["khan-voan-classic"],
    effectPresets: ["STANDARD"],
    sectionSettingsSchema: {
      invitationMessage: { type: "boolean" },
      loveStory: { type: "boolean" },
      gallery: { type: "boolean" },
      music: { type: "boolean" },
      gift: { type: "boolean" },
    },
    designSettingsSchema: {},
  },
};
