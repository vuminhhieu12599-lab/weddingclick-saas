import { PRODUCTION_RENDERER_MANIFESTS } from "../../templates/core/production-renderer-manifests";
import type { RendererProductionManifestV1 } from "../../templates/core/renderer-manifest";

/**
 * LAUNCH-P0-04 — public showroom template catalog (docs/DECISIONS.md
 * "LAUNCH-P0-04").
 *
 * A public-safe marketing projection keyed by the authoritative technical
 * template code (`templates.code` = renderer manifest `identity.templateCode`).
 * The Staff templates API and its RLS-protected rows are never read: this
 * module holds presentation copy only, and validation proves every PUBLIC
 * entry names a registered production renderer of that exact template.
 * Renderer keys are never hand-typed here: each entry names its template code
 * and implementation version, and the key is resolved from the validated
 * production manifest list (exact match, fail closed).
 *
 * Adding a template to the homepage is ONE new entry in
 * `SHOWROOM_TEMPLATE_ENTRIES` (plus its two screenshots under
 * `public/showroom/templates/`). Cards, routes, demo pages, sitemap of static
 * params and the consultation page all derive from this list; no JSX changes.
 * An entry starts as `HIDDEN` and becomes `PUBLIC` only after its renderer is
 * registered, seeded active in the catalog and its demo is reviewed.
 */

export const SHOWROOM_VISIBILITIES = ["PUBLIC", "HIDDEN"] as const;
export type ShowroomVisibility = (typeof SHOWROOM_VISIBILITIES)[number];

export interface ShowroomImage {
  /** Site-relative path under `/showroom/`. */
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

export interface ShowroomTemplateEntry {
  /** Stable technical template code; also the public URL segment `/mau-thiep/<code>`. */
  readonly templateCode: string;
  /** The exact template implementation version the demo runs (manifest `identity.versionNumber`). */
  readonly versionNumber: number;
  /** Vietnamese marketing name (primary heading). */
  readonly nameVi: string;
  /** English name (secondary metadata); equals the renderer manifest display name. */
  readonly nameEn: string;
  /** One short line for cards. */
  readonly taglineVi: string;
  /** Two short sentences for the detail/consultation surfaces. */
  readonly descriptionVi: string;
  /** Three short mood words, shown as quiet metadata. */
  readonly moodVi: readonly string[];
  /** Card accent colour (hex) giving each design its own personality. */
  readonly accent: string;
  /** Real screenshot of the template's opening screen (demo, 390 px wide, 2×). */
  readonly cover: ShowroomImage;
  /** Real screenshot of an inner section of the same demo. */
  readonly preview: ShowroomImage;
  /** Ascending display order; ties break by `templateCode`. */
  readonly sortOrder: number;
  readonly visibility: ShowroomVisibility;
  /** Future filters (e.g. "truyen-thong", "hien-dai"); never required. */
  readonly categories: readonly string[];
}

/** A validated PUBLIC entry plus the production renderer key resolved for it. */
export interface PublicShowroomTemplate extends ShowroomTemplateEntry {
  readonly rendererKey: string;
}

/** The manifest fields the catalog may read. */
export type ShowroomRendererIdentitySource = Pick<RendererProductionManifestV1, "identity" | "compatibility">;

export class ShowroomCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShowroomCatalogError";
  }
}

const TEMPLATE_CODE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const HEX_COLOUR_PATTERN = /^#[0-9a-f]{6}$/i;

function screenshots(templateCode: string, nameVi: string): Pick<ShowroomTemplateEntry, "cover" | "preview"> {
  return {
    cover: {
      src: `/showroom/templates/${templateCode}-cover.webp`,
      width: 780,
      height: 1688,
      alt: `Màn hình mở đầu của mẫu thiệp ${nameVi}`,
    },
    preview: {
      src: `/showroom/templates/${templateCode}-inside.webp`,
      width: 780,
      height: 1688,
      alt: `Một phần nội dung bên trong mẫu thiệp ${nameVi}`,
    },
  };
}

/**
 * The one place to add, reorder, hide or reword a showroom template.
 * Order of this array is irrelevant; `sortOrder` decides.
 */
export const SHOWROOM_TEMPLATE_ENTRIES: readonly ShowroomTemplateEntry[] = [
  {
    templateCode: "elegant-editorial",
    versionNumber: 1,
    nameVi: "Nét Thanh Lịch",
    nameEn: "Elegant Editorial",
    taglineVi: "Phong thư niêm sáp mở ra tấm thiệp xanh ngà, nhẹ nhàng như trang tạp chí.",
    descriptionVi:
      "Bố cục biên tập tinh tế với chữ ký mềm mại, lịch ngày cưới và album ảnh thoáng đãng. Hợp với những cặp đôi yêu sự thanh lịch, nhẹ nhàng.",
    moodVi: ["Thanh lịch", "Xanh ngà", "Biên tập"],
    accent: "#5f7a5c",
    ...screenshots("elegant-editorial", "Nét Thanh Lịch"),
    sortOrder: 10,
    visibility: "PUBLIC",
    categories: ["hien-dai"],
  },
  {
    templateCode: "vietnamese-heritage",
    // VH-V2-01: the demo shows v2 (approved gift wording, typography, motion).
    // Release gate: v2 needs a catalog row before this showroom ships to Production.
    versionNumber: 2,
    nameVi: "Sắc Son Trăm Năm",
    nameEn: "Vietnamese Heritage",
    taglineVi: "Cánh cửa son đỏ mở ra nghi lễ truyền thống, ấm áp và trang trọng.",
    descriptionVi:
      "Sắc đỏ son, hoạ tiết song hỷ và giấy dó ngà gợi không khí lễ cưới Việt. Trình bày đầy đủ gia đình hai bên, ngày âm lịch và lễ Vu Quy, Thành Hôn.",
    moodVi: ["Truyền thống", "Đỏ son", "Trang trọng"],
    accent: "#8e1f1f",
    ...screenshots("vietnamese-heritage", "Sắc Son Trăm Năm"),
    sortOrder: 20,
    visibility: "PUBLIC",
    categories: ["truyen-thong"],
  },
  {
    templateCode: "romantic-minimal",
    versionNumber: 1,
    nameVi: "Dịu Dàng",
    nameEn: "Romantic Minimal",
    taglineVi: "Phong thư hồng phấn, nét chữ bay bổng và khoảng trắng thật dịu.",
    descriptionVi:
      "Tông hồng phấn tối giản với hoa vẽ tay và phong thư mở bằng một chạm. Dành cho cặp đôi thích sự lãng mạn, nhẹ nhàng mà vẫn chỉn chu.",
    moodVi: ["Lãng mạn", "Hồng phấn", "Tối giản"],
    accent: "#b0707a",
    ...screenshots("romantic-minimal", "Dịu Dàng"),
    sortOrder: 30,
    visibility: "PUBLIC",
    categories: ["hien-dai", "lang-man"],
  },
  {
    templateCode: "our-wedding-story",
    versionNumber: 1,
    nameVi: "Chuyện Chúng Mình",
    nameEn: "Our Wedding Story",
    taglineVi: "Kể chuyện tình yêu như một cuốn sách ảnh màu sâm panh.",
    descriptionVi:
      "Trang bìa phong cách tạp chí, chân dung cô dâu chú rể và album ảnh bố cục sách. Phù hợp với những cặp đôi muốn kể lại hành trình của mình.",
    moodVi: ["Kể chuyện", "Sâm panh", "Tạp chí"],
    accent: "#a07a4c",
    ...screenshots("our-wedding-story", "Chuyện Chúng Mình"),
    sortOrder: 40,
    visibility: "PUBLIC",
    categories: ["hien-dai", "ke-chuyen"],
  },
];

/**
 * Validates a catalog and returns its PUBLIC entries in display order, each
 * with the renderer key resolved from the production manifest list by exact
 * `identity.templateCode` + `identity.versionNumber`. Fails closed (throws)
 * on any malformed entry, duplicate code, or a PUBLIC entry without exactly
 * one registered production renderer of that template, version and English
 * name. HIDDEN entries are validated for shape only and never returned, so
 * an unfinished template cannot leak.
 */
export function selectPublicShowroomTemplates(
  entries: readonly ShowroomTemplateEntry[],
  manifests: readonly ShowroomRendererIdentitySource[] = PRODUCTION_RENDERER_MANIFESTS,
): readonly PublicShowroomTemplate[] {
  const seen = new Set<string>();
  const resolved: PublicShowroomTemplate[] = [];
  for (const entry of entries) {
    if (!TEMPLATE_CODE_PATTERN.test(entry.templateCode)) {
      throw new ShowroomCatalogError("Showroom template code is malformed");
    }
    if (seen.has(entry.templateCode)) {
      throw new ShowroomCatalogError("Showroom template code is duplicated");
    }
    seen.add(entry.templateCode);
    if (!(SHOWROOM_VISIBILITIES as readonly string[]).includes(entry.visibility)) {
      throw new ShowroomCatalogError("Showroom template visibility is unknown");
    }
    if (!Number.isFinite(entry.sortOrder) || !Number.isInteger(entry.versionNumber) || entry.versionNumber < 1) {
      throw new ShowroomCatalogError("Showroom template order or version is not a valid number");
    }
    if (entry.nameVi.trim() === "" || entry.nameEn.trim() === "" || entry.taglineVi.trim() === "") {
      throw new ShowroomCatalogError("Showroom template copy is empty");
    }
    if (!HEX_COLOUR_PATTERN.test(entry.accent)) {
      throw new ShowroomCatalogError("Showroom template accent is not a hex colour");
    }
    if (entry.visibility !== "PUBLIC") continue;
    const matches = manifests.filter(
      (manifest) => manifest.identity.templateCode === entry.templateCode && manifest.identity.versionNumber === entry.versionNumber,
    );
    const manifest = matches[0];
    if (manifest === undefined || matches.length !== 1) {
      throw new ShowroomCatalogError("Public showroom template has no single registered production renderer");
    }
    if (manifest.identity.displayName !== entry.nameEn) {
      throw new ShowroomCatalogError("Public showroom template does not match its renderer identity");
    }
    resolved.push(Object.freeze({ ...entry, rendererKey: manifest.compatibility.rendererKey }));
  }
  return Object.freeze(resolved.sort((a, b) => a.sortOrder - b.sortOrder || a.templateCode.localeCompare(b.templateCode)));
}

/** The production public showroom list, validated at module load (fail closed). */
export const PUBLIC_SHOWROOM_TEMPLATES: readonly PublicShowroomTemplate[] =
  selectPublicShowroomTemplates(SHOWROOM_TEMPLATE_ENTRIES);

/** Exact-code lookup among PUBLIC entries only; never normalizes or falls back. */
export function findPublicShowroomTemplate(
  templateCode: string,
  templates: readonly PublicShowroomTemplate[] = PUBLIC_SHOWROOM_TEMPLATES,
): PublicShowroomTemplate | undefined {
  return templates.find((entry) => entry.templateCode === templateCode);
}
