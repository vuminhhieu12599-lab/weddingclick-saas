import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SERVICE_ADDON_CODES, SERVICE_PACKAGE_CODES } from "../../domain";
import {
  buildConsultationMessage,
  hasAnyShowroomContact,
  normalizeVietnameseMobile,
  resolveShowroomContact,
} from "../showroom-contact";
import { SHOWROOM_ADDON_OFFERS, SHOWROOM_PACKAGE_OFFERS } from "../showroom-pricing";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const CATALOG_SQL = readFileSync(
  `${MIGRATIONS_DIR}${readdirSync(MIGRATIONS_DIR).find((name) => name.includes("_0003_catalog_packages_addons")) ?? ""}`,
  "utf8",
);

/** `('CODE', 'name', 'description', 150000, true)` → amount for that code in the 0003 seed. */
function seededPrice(code: string): number {
  const match = new RegExp(`\\('${code}',\\s*'[^']*',\\s*'[^']*',\\s*(\\d+),\\s*true\\)`).exec(CATALOG_SQL);
  if (match === null) throw new Error(`No seeded price for ${code}`);
  return Number(match[1]);
}

describe("LAUNCH-P0-04 public price list matches the authoritative catalog seed", () => {
  it("covers exactly the package and add-on codes", () => {
    expect(SHOWROOM_PACKAGE_OFFERS.map((offer) => offer.code)).toStrictEqual([...SERVICE_PACKAGE_CODES]);
    expect(SHOWROOM_ADDON_OFFERS.map((offer) => offer.code)).toStrictEqual([...SERVICE_ADDON_CODES]);
  });

  it("every amount equals migration 0003 (COMMON 150000, SEPARATE 250000, PERSONALIZED_GUEST 50000)", () => {
    for (const offer of [...SHOWROOM_PACKAGE_OFFERS, ...SHOWROOM_ADDON_OFFERS]) {
      expect(offer.priceVnd, offer.code).toBe(seededPrice(offer.code));
      expect(Number.isInteger(offer.priceVnd)).toBe(true);
    }
    expect(seededPrice("COMMON")).toBe(150000);
    expect(seededPrice("SEPARATE")).toBe(250000);
    expect(seededPrice("PERSONALIZED_GUEST")).toBe(50000);
  });

  it("no retired VIP / 100.000 offer is advertised", () => {
    const text = JSON.stringify([SHOWROOM_PACKAGE_OFFERS, SHOWROOM_ADDON_OFFERS]);
    expect(text).not.toMatch(/VIP/i);
    expect(text).not.toContain("100000");
  });
});

describe("LAUNCH-P0-04 contact configuration fails closed", () => {
  it("unset, empty and placeholder values configure nothing", () => {
    for (const value of [undefined, "", "   ", "sodienthoaicuaban", "zalo.me/sodienthoaicuaban", "12345", "0123456789", "09012345678"]) {
      expect(normalizeVietnameseMobile(value), String(value)).toBeNull();
    }
    const none = resolveShowroomContact({});
    expect(none).toStrictEqual({ zalo: null, hotline: null });
    expect(hasAnyShowroomContact(none)).toBe(false);
  });

  it("valid Vietnamese mobiles normalize from local or +84 forms", () => {
    expect(normalizeVietnameseMobile("0901 234 567")).toBe("0901234567");
    expect(normalizeVietnameseMobile("+84 90-123-4567")).toBe("0901234567");
    expect(normalizeVietnameseMobile("84901234567")).toBe("0901234567");
  });

  it("builds zalo.me and tel: links only from configured numbers", () => {
    const contact = resolveShowroomContact({
      WEDDINGCLICK_CONTACT_ZALO_PHONE: "0901234567",
      WEDDINGCLICK_CONTACT_HOTLINE: "+84 912 345 678",
    });
    expect(contact.zalo).toStrictEqual({ display: "0901 234 567", href: "https://zalo.me/0901234567" });
    expect(contact.hotline).toStrictEqual({ display: "0912 345 678", href: "tel:+84912345678" });
  });

  it("the consultation message names the template by Vietnamese name and stable code", () => {
    const message = buildConsultationMessage({ nameVi: "Sắc Son Trăm Năm", templateCode: "vietnamese-heritage" });
    expect(message).toContain("Sắc Son Trăm Năm");
    expect(message).toContain("vietnamese-heritage");
    expect(buildConsultationMessage(null)).not.toContain("mã mẫu");
  });
});
