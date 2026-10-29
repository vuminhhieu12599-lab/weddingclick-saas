import type { RendererProductionManifestV1 } from "../../../core/renderer-manifest";

/**
 * Se Duyên v2 — full production renderer manifest (SD-V2-01; RF-06-0
 * P14–P20 apply unchanged).
 *
 * WHY A VERSION AND NOT AN EDIT. Se Duyên v1 is applied, active and carries
 * a published Production invitation, so P22 / CLAUDE.md §9 freeze it: the
 * two Product-Owner-rejected compositions — the music control that never
 * started with the invitation, and the four-frame asymmetric album — are
 * corrected here, as version 2, and v1 keeps every byte and every published
 * invitation it has.
 *
 * Data only: no React, no `"use client"`, no browser globals, no
 * `lib/server/**` import (P17), no fonts, CSS or assets.
 *
 * The identity below is version 2 of the SAME `se-duyen` catalog template,
 * so it joins v1 under that family rather than starting a new one. Its
 * `.design` subset is deliberately IDENTICAL to v1's: v2 changes
 * presentation only — no palette, font preset, effect preset or section
 * setting is added, removed or renamed — so a Project moved from v1 to v2
 * keeps its design assignment and its media exactly (CLAUDE.md §17).
 * Migration 0054 registers `wedding.se-duyen.v2` with exactly that subset
 * (`lib/server/templates/__tests__/se-duyen-v2-catalog-seed.test.ts` keeps
 * the two equal); from the moment it is applied this manifest is frozen in
 * turn, and any incompatible change becomes a v3.
 *
 * SECTION CAPABILITIES DECLARE ONLY WHAT THE RENDERER ACTUALLY RENDERS, and
 * v2 renders exactly the sections v1 did. `dressCode` and `photoStory` stay
 * `false` by art direction: the approved composition has neither.
 */
export const SE_DUYEN_V2_MANIFEST: RendererProductionManifestV1 = {
  identity: {
    eventType: "WEDDING",
    templateCode: "se-duyen",
    versionNumber: 2,
    displayName: "Se Duyên",
  },
  compatibility: {
    rendererKey: "wedding.se-duyen.v2",
    supportedPayloadSchemaVersions: [1],
    // The one centralized variant resolver feeds all three (CLAUDE.md §5).
    supportedVariants: ["COMMON", "GROOM", "BRIDE"],
    sectionCapabilities: {
      // The ivory plate carries the customer's own editable invitation
      // wording; it is the point of the section, not an extra.
      invitationMessage: true,
      loveStory: true,
      // SD-V2-02: the responsive album grid, on the unbounded `gallery` slot.
      gallery: true,
      // SD-V2-01: the approved gilt disc, now floating and started by the
      // opening gesture, on the shared RF-06C capability.
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
