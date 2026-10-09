import type { RendererProductionManifestV1 } from "../../../core/renderer-manifest";

/**
 * Romantic Minimal v1 — full production renderer manifest
 * (docs/DECISIONS.md "RM-01 — Romantic Minimal v1 Production Contract";
 * RF-06-0 P14–P20 apply unchanged).
 *
 * Data only: no React, no `"use client"`, no browser globals, no
 * `lib/server/**` import (P17), no fonts, CSS or assets. RM-01 does NOT
 * register it in the production manifest list: the renderer is built in
 * RM-02 and registered only together with its binding. Proposed at RM-01; it
 * freezes at catalog seeding, after which any incompatible change is v2,
 * never an edit here (P22).
 */
export const ROMANTIC_MINIMAL_V1_MANIFEST: RendererProductionManifestV1 = {
  identity: {
    eventType: "WEDDING",
    templateCode: "romantic-minimal",
    versionNumber: 1,
    displayName: "Romantic Minimal",
  },
  compatibility: {
    rendererKey: "wedding.romantic-minimal.v1",
    supportedPayloadSchemaVersions: [1],
    supportedVariants: ["COMMON", "GROOM", "BRIDE"],
    sectionCapabilities: {
      // The approved direction's invitation intro shows only the salutation
      // and guest line, never a free-text invitation message (RM-01 mapping).
      invitationMessage: false,
      loveStory: true,
      gallery: true,
      music: true,
      gift: true,
      timeline: true,
      // The approved direction has no Dress Code and no Photo Story section.
      dressCode: false,
      photoStory: false,
    },
  },
  design: {
    schemaVersion: 1,
    palettes: ["romantic-blush"],
    fontPresets: ["romantic-classic"],
    effectPresets: ["STANDARD"],
    sectionSettingsSchema: {
      loveStory: { type: "boolean" },
      gallery: { type: "boolean" },
      music: { type: "boolean" },
      gift: { type: "boolean" },
      timeline: { type: "boolean" },
    },
    designSettingsSchema: {},
  },
};
