import type { DemoVariantSegment } from "./demo/build-demo-render-data";

/**
 * LAUNCH-P0-04 — the public showroom URL scheme, in one place.
 *
 * - `/mau-thiep/<templateCode>`            demo, thiệp chung (COMMON)
 * - `/mau-thiep/<templateCode>/nha-trai`   demo, nhà trai (GROOM)
 * - `/mau-thiep/<templateCode>/nha-gai`    demo, nhà gái (BRIDE)
 * - `/tu-van?mau=<templateCode>`           consultation with the chosen template
 *
 * Template codes are the stable technical codes, so these URLs stay valid
 * while a template exists in the catalog.
 */

export const SHOWROOM_SECTION_IDS = Object.freeze({
  templates: "mau-thiep",
  benefits: "loi-ich",
  process: "quy-trinh",
  pricing: "bang-gia",
  contact: "lien-he",
});

export function demoHref(templateCode: string, segment?: DemoVariantSegment): string {
  const base = `/mau-thiep/${encodeURIComponent(templateCode)}`;
  return segment === undefined ? base : `${base}/${segment}`;
}

export function consultationHref(templateCode?: string): string {
  return templateCode === undefined ? "/tu-van" : `/tu-van?mau=${encodeURIComponent(templateCode)}`;
}

export const SHOWROOM_TEMPLATES_HREF = `/#${SHOWROOM_SECTION_IDS.templates}`;
