import type { RendererProductionManifestV1 } from "../../../core/renderer-manifest";

/**
 * Se Duyên v1 — full production renderer manifest (SD-V1-01; RF-06-0
 * P14–P20 apply unchanged).
 *
 * Data only: no React, no `"use client"`, no browser globals, no
 * `lib/server/**` import (P17), no fonts, CSS or assets.
 *
 * SECTION CAPABILITIES DECLARE ONLY WHAT THE RENDERER ACTUALLY RENDERS. The
 * approved Se Duyên direction also has a gift envelope, which the prototype
 * shows with illustrative QR artwork. It has no production capability
 * connected yet, so
 * declaring them here would let the Template Editor offer a customer
 * settings that change nothing and would let `sections.*` promise a renderer
 * section that does not exist (CLAUDE.md §22 — never report a capability the
 * system does not have). SD-V1-02 connects them and widens this manifest.
 *
 * Widening it then is legitimate: P22 / CLAUDE.md §9 freeze a manifest once
 * a catalog TemplateVersion row has been seeded on it, and Se Duyên has no
 * seeded row and no published invitation. After seeding, any incompatible
 * change becomes a v2 and never an edit here.
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
      // SD-V1-02: gift.
      gift: false,
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
    },
    designSettingsSchema: {},
  },
};
