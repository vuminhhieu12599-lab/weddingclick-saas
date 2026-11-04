import type { RendererProductionManifestV1 } from "../../../core/renderer-manifest";

/**
 * Hồng Ân v2 — production renderer manifest (HA-CONTENT-01).
 *
 * Data only: no React, no `"use client"`, no browser global, no
 * `lib/server/**` import, no font, CSS or asset.
 *
 * WHY A v2 AT ALL. v2 is v1's presentation-identical successor whose ONLY
 * difference is that the Scripture quote is a Staff-configurable setting
 * rather than fixed template copy. It exists as a new version, rather than
 * as an amendment to v1, because `template_versions.manifest` is frozen at
 * creation by `guard_template_version_immutability()`
 * (migration 0010, docs/PHYSICAL_DATABASE_PLAN.md §2.11 [F10]: `retired_at`
 * is the only column a normal UPDATE may change) and because CLAUDE.md §9
 * requires a new version rather than an edited one. v1 keeps
 * `designSettingsSchema: {}` and is not touched by HA-CONTENT-01, so every
 * invitation already reviewed or published on v1 is unaffected.
 *
 * SECTION CAPABILITIES DECLARE ONLY WHAT THIS RENDERER ACTUALLY DRAWS.
 * `dressCode` and `photoStory` are `false` by art direction: the approved
 * Gothic-cathedral direction has neither, and declaring a section the
 * renderer does not draw would make the Staff editor offer a setting with
 * no effect. They are unchanged from v1: v2 adds and removes no section.
 */
export const HONG_AN_V2_MANIFEST: RendererProductionManifestV1 = {
  identity: {
    eventType: "WEDDING",
    templateCode: "hong-an",
    versionNumber: 2,
    displayName: "Hồng Ân",
  },
  compatibility: {
    rendererKey: "wedding.hong-an.v2",
    supportedPayloadSchemaVersions: [1],
    // The one centralized variant resolver feeds all three (CLAUDE.md §5).
    supportedVariants: ["COMMON", "GROOM", "BRIDE"],
    sectionCapabilities: {
      // "Hân Hoan Báo Tin" carries the Project's own invitation wording.
      invitationMessage: true,
      // "Hành Trình Yêu Thương", rendered as the Project's own prose.
      loveStory: true,
      // "Khoảnh Khắc" — the arch-framed grid and its lightbox.
      gallery: true,
      // Guest-triggered only; this template never autoplays.
      music: true,
      // "Mừng Cưới" — the canonical per-side bank fields and each side's QR.
      gift: true,
      // "Lịch Trình Hôn Lễ" — the canonical timeline steps, each own time.
      timeline: true,
      // Not in the approved direction.
      dressCode: false,
      photoStory: false,
    },
  },
  design: {
    schemaVersion: 1,
    palettes: ["hong-an-ivory"],
    fontPresets: ["hong-an-cathedral"],
    effectPresets: ["STANDARD"],
    // Exactly the capable sections, each `{ type: "boolean" }`.
    sectionSettingsSchema: {
      invitationMessage: { type: "boolean" },
      loveStory: { type: "boolean" },
      gallery: { type: "boolean" },
      timeline: { type: "boolean" },
      music: { type: "boolean" },
      gift: { type: "boolean" },
    },
    /**
     * HA-CONTENT-01 — the one thing v2 adds over v1.
     *
     * Both are OPTIONAL: `designSettingsSchema` is an allow-list, never an
     * "all keys required" list (docs/TEMPLATE_SYSTEM.md §6), so a Project
     * that configures neither is fully valid and renders the template's own
     * approved default verse. Omitting a key is how a Project goes BACK to
     * the default — there is no "empty string" override, because the design
     * API rejects a blank setting value outright
     * (validate-save-project-design-input.ts).
     *
     * These are template-approved configuration of template-owned copy,
     * declared in the manifest and validated against it server-side — not
     * customer-authored content smuggled into `designSettings`, which RF7
     * forbids (docs/DECISIONS.md "RF7. Content with no canonical home").
     *
     * No `enumValues`: the verse is free text. The 500/80 character limits
     * are Staff-editor guidance (art direction, not a trust boundary);
     * `ManifestSettingSpec` cannot express a maximum length, and the design
     * API's own 20000-character cap still applies to every setting value.
     */
    designSettingsSchema: {
      scriptureVerse: { type: "string" },
      scriptureReference: { type: "string" },
    },
  },
};
