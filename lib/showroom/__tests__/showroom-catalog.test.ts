import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PRODUCTION_RENDERER_MANIFESTS } from "../../../templates/core/production-renderer-manifests";
import {
  PUBLIC_SHOWROOM_TEMPLATES,
  SHOWROOM_TEMPLATE_ENTRIES,
  ShowroomCatalogError,
  findPublicShowroomTemplate,
  selectPublicShowroomTemplates,
  type ShowroomTemplateEntry,
} from "../showroom-catalog";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const ALL_MIGRATIONS_SQL = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(`${MIGRATIONS_DIR}${name}`, "utf8"))
  .join("\n");

const BASE = SHOWROOM_TEMPLATE_ENTRIES[0] as ShowroomTemplateEntry;

/** A catalog entry overriding the first real one. */
function entry(overrides: Partial<ShowroomTemplateEntry>): ShowroomTemplateEntry {
  return { ...BASE, ...overrides };
}

/** The production manifests plus one fictional fifth renderer identity. */
const WITH_FIFTH_MANIFEST = [
  ...PRODUCTION_RENDERER_MANIFESTS,
  {
    identity: { eventType: "WEDDING", templateCode: "fixture-five", versionNumber: 1, displayName: "Fixture Template Five" },
    compatibility: { ...(PRODUCTION_RENDERER_MANIFESTS[0] as (typeof PRODUCTION_RENDERER_MANIFESTS)[number]).compatibility, rendererKey: "wedding.fixture-five.v1" },
  },
] as const;

/**
 * Real pixel size of a WebP file, read from its own header (VP8 lossy, VP8L
 * lossless or VP8X extended). No image library: the point is to measure the
 * committed bytes rather than trust the catalog entry that describes them.
 */
function webpSize(bytes: Buffer): { readonly width: number; readonly height: number } {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("not a WebP file");
  }
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    if (bytes.readUInt8(23) !== 0x9d || bytes.readUInt8(24) !== 0x01 || bytes.readUInt8(25) !== 0x2a) {
      throw new Error("VP8 start code missing");
    }
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (bytes.readUInt8(20) !== 0x2f) throw new Error("VP8L signature missing");
    const header = bytes.readUInt32LE(21);
    return { width: (header & 0x3fff) + 1, height: ((header >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  }
  throw new Error(`unsupported WebP chunk ${chunk}`);
}

describe("LAUNCH-P0-04 showroom catalog", () => {
  it("publishes exactly the five released templates, in display order", () => {
    expect(PUBLIC_SHOWROOM_TEMPLATES.map((template) => template.templateCode)).toStrictEqual([
      "elegant-editorial",
      "vietnamese-heritage",
      "romantic-minimal",
      "our-wedding-story",
      // SD-V1-SHOWROOM-01: Se Duyên is the fifth card, sortOrder 50.
      "se-duyen",
    ]);
    expect(PUBLIC_SHOWROOM_TEMPLATES.map((template) => template.nameVi)).toStrictEqual([
      "Nét Thanh Lịch",
      "Sắc Son Trăm Năm",
      "Dịu Dàng",
      "Chuyện Chúng Mình",
      "Se Duyên",
    ]);
  });

  it("every public entry matches its production renderer identity and English name", () => {
    for (const template of PUBLIC_SHOWROOM_TEMPLATES) {
      const manifest = PRODUCTION_RENDERER_MANIFESTS.find((item) => item.compatibility.rendererKey === template.rendererKey);
      expect(manifest?.identity.templateCode, template.templateCode).toBe(template.templateCode);
      expect(manifest?.identity.displayName).toBe(template.nameEn);
    }
  });

  // OWS-V2-CATALOG-01: Our Wedding Story v2 is seeded by migration 0051, so the last OWS-V2-01 pending-seed
  // exception is gone and no exception list remains — every public entry needs its exact renderer key seeded.
  it("every public entry is seeded in the reproducible catalog migrations (templates.code + name)", () => {
    for (const template of PUBLIC_SHOWROOM_TEMPLATES) {
      expect(ALL_MIGRATIONS_SQL, template.templateCode).toContain(`('${template.templateCode}', 'WEDDING', '${template.nameEn}'`);
      expect(ALL_MIGRATIONS_SQL, template.rendererKey).toContain(`'${template.rendererKey}'`);
    }
    expect(PUBLIC_SHOWROOM_TEMPLATES.find((template) => template.templateCode === "vietnamese-heritage")?.rendererKey).toBe("wedding.vietnamese-heritage.v2");
    expect(PUBLIC_SHOWROOM_TEMPLATES.find((template) => template.templateCode === "our-wedding-story")?.rendererKey).toBe("wedding.our-wedding-story.v2");
  });

  it("Our Wedding Story is one public card, on v2, under its unchanged code", () => {
    const ows = PUBLIC_SHOWROOM_TEMPLATES.filter((template) => template.templateCode === "our-wedding-story");
    expect(ows.map((template) => [template.versionNumber, template.rendererKey, template.nameVi])).toStrictEqual([[2, "wedding.our-wedding-story.v2", "Chuyện Chúng Mình"]]);
    expect(SHOWROOM_TEMPLATE_ENTRIES.filter((entry) => entry.templateCode === "our-wedding-story")).toHaveLength(1);
  });

  it("screenshots follow the one naming rule and real dimensions", () => {
    const publicDir = fileURLToPath(new URL("../../../public", import.meta.url));
    for (const template of PUBLIC_SHOWROOM_TEMPLATES) {
      expect(template.cover.src).toBe(`/showroom/templates/${template.templateCode}-cover.webp`);
      expect(template.preview.src).toBe(`/showroom/templates/${template.templateCode}-inside.webp`);
      const cover = readFileSync(`${publicDir}${template.cover.src}`);
      const preview = readFileSync(`${publicDir}${template.preview.src}`);
      // SHOWROOM-CARD-HERO-01: the declared size is what the cards and the hero
      // phone mockups reserve space with, so a re-capture at any other size is a
      // layout bug the catalog cannot see. Measure the bytes, not the entry.
      expect(webpSize(cover), template.cover.src).toStrictEqual({ width: template.cover.width, height: template.cover.height });
      expect(webpSize(preview), template.preview.src).toStrictEqual({ width: template.preview.width, height: template.preview.height });
      // The card crossfades cover -> inside on hover; the same frame twice makes
      // that a no-op, which is how a re-captured cover quietly swallows the inner view.
      expect(cover.equals(preview), template.templateCode).toBe(false);
    }
  });

  it("one more entry appears automatically, ordered by sortOrder, without other changes", () => {
    // SD-V1-SHOWROOM-01: the released list is five, so the fixture entry makes six.
    const extra = entry({ templateCode: "fixture-five", nameVi: "Mẫu Thứ Năm", nameEn: "Fixture Template Five", sortOrder: 15 });
    const list = selectPublicShowroomTemplates([...SHOWROOM_TEMPLATE_ENTRIES, extra], WITH_FIFTH_MANIFEST);
    expect(list).toHaveLength(SHOWROOM_TEMPLATE_ENTRIES.length + 1);
    expect(list[1]?.templateCode).toBe("fixture-five");
    expect(list[1]?.rendererKey).toBe("wedding.fixture-five.v1");
  });

  it("HIDDEN entries never appear, even without a registered renderer", () => {
    const unfinished = entry({ templateCode: "unfinished", versionNumber: 3, visibility: "HIDDEN" });
    const list = selectPublicShowroomTemplates([...SHOWROOM_TEMPLATE_ENTRIES, unfinished]);
    expect(list.map((template) => template.templateCode)).not.toContain("unfinished");
    expect(findPublicShowroomTemplate("unfinished", list)).toBeUndefined();
  });

  it("fails closed on an unregistered PUBLIC renderer, an identity mismatch, duplicates and bad codes", () => {
    expect(() => selectPublicShowroomTemplates([entry({ versionNumber: 9 })])).toThrow(ShowroomCatalogError);
    expect(() => selectPublicShowroomTemplates([entry({ templateCode: "not-registered" })])).toThrow(ShowroomCatalogError);
    expect(() => selectPublicShowroomTemplates([entry({ versionNumber: 0 })])).toThrow(ShowroomCatalogError);
    expect(() => selectPublicShowroomTemplates([entry({ nameEn: "Elegant" })])).toThrow(ShowroomCatalogError);
    expect(() => selectPublicShowroomTemplates([BASE, BASE])).toThrow(ShowroomCatalogError);
    expect(() => selectPublicShowroomTemplates([entry({ templateCode: "Elegant Editorial" })])).toThrow(ShowroomCatalogError);
  });

  it("an empty catalog is valid and yields no templates", () => {
    expect(selectPublicShowroomTemplates([])).toStrictEqual([]);
  });

  it("lookup is exact: no normalization, no prototype keys", () => {
    expect(findPublicShowroomTemplate("elegant-editorial")?.nameVi).toBe("Nét Thanh Lịch");
    for (const code of ["Elegant-Editorial", " elegant-editorial", "constructor", "__proto__", ""]) {
      expect(findPublicShowroomTemplate(code), code).toBeUndefined();
    }
  });
});
