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

describe("LAUNCH-P0-04 showroom catalog", () => {
  it("publishes exactly the four released templates, in display order", () => {
    expect(PUBLIC_SHOWROOM_TEMPLATES.map((template) => template.templateCode)).toStrictEqual([
      "elegant-editorial",
      "vietnamese-heritage",
      "romantic-minimal",
      "our-wedding-story",
    ]);
    expect(PUBLIC_SHOWROOM_TEMPLATES.map((template) => template.nameVi)).toStrictEqual([
      "Nét Thanh Lịch",
      "Sắc Son Trăm Năm",
      "Dịu Dàng",
      "Chuyện Chúng Mình",
    ]);
  });

  it("every public entry matches its production renderer identity and English name", () => {
    for (const template of PUBLIC_SHOWROOM_TEMPLATES) {
      const manifest = PRODUCTION_RENDERER_MANIFESTS.find((item) => item.compatibility.rendererKey === template.rendererKey);
      expect(manifest?.identity.templateCode, template.templateCode).toBe(template.templateCode);
      expect(manifest?.identity.displayName).toBe(template.nameEn);
    }
  });

  // VH-V2-RELEASE-READINESS: v2 is seeded by migration 0050, so the VH-V2-01 pending-seed exception is gone;
  // every public entry (the Vietnamese Heritage v2 demo included) needs its exact renderer key seeded.
  it("every public entry is seeded in the reproducible catalog migrations (templates.code + name)", () => {
    for (const template of PUBLIC_SHOWROOM_TEMPLATES) {
      expect(ALL_MIGRATIONS_SQL, template.templateCode).toContain(`('${template.templateCode}', 'WEDDING', '${template.nameEn}'`);
      expect(ALL_MIGRATIONS_SQL).toContain(`'${template.rendererKey}'`);
    }
    expect(PUBLIC_SHOWROOM_TEMPLATES.find((template) => template.templateCode === "vietnamese-heritage")?.rendererKey).toBe("wedding.vietnamese-heritage.v2");
  });

  it("screenshots follow the one naming rule and real dimensions", () => {
    for (const template of PUBLIC_SHOWROOM_TEMPLATES) {
      expect(template.cover.src).toBe(`/showroom/templates/${template.templateCode}-cover.webp`);
      expect(template.preview.src).toBe(`/showroom/templates/${template.templateCode}-inside.webp`);
      const publicDir = fileURLToPath(new URL("../../../public", import.meta.url));
      expect(() => readFileSync(`${publicDir}${template.cover.src}`)).not.toThrow();
      expect(() => readFileSync(`${publicDir}${template.preview.src}`)).not.toThrow();
    }
  });

  it("a fifth entry appears automatically, ordered by sortOrder, without other changes", () => {
    const fifth = entry({ templateCode: "fixture-five", nameVi: "Mẫu Thứ Năm", nameEn: "Fixture Template Five", sortOrder: 15 });
    const list = selectPublicShowroomTemplates([...SHOWROOM_TEMPLATE_ENTRIES, fifth], WITH_FIFTH_MANIFEST);
    expect(list).toHaveLength(5);
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
