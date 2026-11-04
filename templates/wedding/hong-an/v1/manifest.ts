import type { RendererProductionManifestV1 } from "../../../core/renderer-manifest";

/**
 * Hồng Ân v1 — production renderer manifest (HA-TEMPLATE-01).
 *
 * Data only: no React, no `"use client"`, no browser global, no
 * `lib/server/**` import, no font, CSS or asset.
 *
 * NOT YET REGISTERED. This manifest is deliberately absent from
 * `templates/core/production-renderer-manifests.ts` and from the binding
 * registry: HA-TEMPLATE-01 builds the renderer and its local preview only,
 * and catalog seeding, binding registration and the showroom are separate
 * release steps after Product Owner visual QA. The local preview composes
 * its own registry from this manifest without touching the production one.
 *
 * SECTION CAPABILITIES DECLARE ONLY WHAT THIS RENDERER ACTUALLY DRAWS.
 * `dressCode` and `photoStory` are `false` by art direction: the approved
 * Gothic-cathedral direction has neither, and declaring a section the
 * renderer does not draw would make the Staff editor offer a setting with
 * no effect.
 */
export const HONG_AN_V1_MANIFEST: RendererProductionManifestV1 = {
  identity: {
    eventType: "WEDDING",
    templateCode: "hong-an",
    versionNumber: 1,
    displayName: "Hồng Ân",
  },
  compatibility: {
    rendererKey: "wedding.hong-an.v1",
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
    designSettingsSchema: {},
  },
};
