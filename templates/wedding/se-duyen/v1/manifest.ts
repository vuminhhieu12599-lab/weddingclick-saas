import type { RendererProductionManifestV1 } from "../../../core/renderer-manifest";

/**
 * Se Duyên v1 — full production renderer manifest (SD-V1-01; RF-06-0
 * P14–P20 apply unchanged).
 *
 * Data only: no React, no `"use client"`, no browser globals, no
 * `lib/server/**` import (P17), no fonts, CSS or assets.
 *
 * SECTION CAPABILITIES DECLARE ONLY WHAT THE RENDERER ACTUALLY RENDERS.
 * Declaring a section the renderer cannot draw would let the Template Editor
 * offer a customer settings that change nothing, and would let `sections.*`
 * promise a renderer section that does not exist (CLAUDE.md §22 — never
 * report a capability the system does not have). `dressCode` and
 * `photoStory` are false by art direction: the approved composition has
 * neither. Every other section is now connected.
 *
 * Widening it was legitimate while nothing was seeded on it: P22 /
 * CLAUDE.md §9 freeze a manifest once a catalog TemplateVersion row has been
 * seeded on it. SD-V1-CATALOG-01 has now authored that row — migration 0052
 * registers `wedding.se-duyen.v1` with exactly the `.design` subset below
 * (`lib/server/templates/__tests__/se-duyen-catalog-seed.test.ts` keeps the
 * two equal). The migration is authored only and not yet applied, and the
 * template is seeded `is_active = false`, so there is still no published
 * invitation; from the moment it is applied, any incompatible change here
 * becomes a v2 and never an edit.
 *
 * `dressCode` and `photoStory` are `false` by art direction, not by
 * sequencing: the approved composition has neither.
 */
export const SE_DUYEN_V1_MANIFEST: RendererProductionManifestV1 = {
  identity: {
    eventType: "WEDDING",
    templateCode: "se-duyen",
    versionNumber: 1,
    displayName: "Se Duyên",
  },
  compatibility: {
    rendererKey: "wedding.se-duyen.v1",
    supportedPayloadSchemaVersions: [1],
    // The one centralized variant resolver feeds all three (CLAUDE.md §5).
    supportedVariants: ["COMMON", "GROOM", "BRIDE"],
    sectionCapabilities: {
      // The ivory plate carries the customer's own editable invitation
      // wording; it is the point of the section, not an extra.
      invitationMessage: true,
      loveStory: true,
      // SD-V1-02B2: the approved album, on the unbounded `gallery` slot.
      gallery: true,
      // SD-V1-02C1: the approved gilt disc, on the shared RF-06C capability.
      music: true,
      // SD-V1-02C2: the approved envelope, on the canonical per-side gift
      // fields and each side's own semantic QR.
      gift: true,
      // SD-V1-02B3A: the approved run-of-show, on the RF7 Timeline contract.
      timeline: true,
      // Not in the approved direction.
      dressCode: false,
      photoStory: false,
    },
  },
  design: {
    schemaVersion: 1,
    palettes: ["son-mai-lacquer"],
    fontPresets: ["lacquer-garamond"],
    effectPresets: ["STANDARD"],
    // P19 step 6: exactly the capable sections, each `{ type: "boolean" }`.
    sectionSettingsSchema: {
      invitationMessage: { type: "boolean" },
      loveStory: { type: "boolean" },
      gallery: { type: "boolean" },
      timeline: { type: "boolean" },
      music: { type: "boolean" },
      gift: { type: "boolean" },
    },
    designSettingsSchema: {},
  },
};
