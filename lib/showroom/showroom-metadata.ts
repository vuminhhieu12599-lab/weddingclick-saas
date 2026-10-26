/**
 * LAUNCH-P0-04 — the showroom's social share image (Facebook / Zalo).
 * JPEG for crawler compatibility, 1200×630. Applied per page only (homepage,
 * consultation), never in a layout, so published invitations keep their own
 * Open Graph behaviour untouched.
 *
 * WC-PROD-REVIEW-01: `url` is now absolute, built from the configurable
 * public base URL (`showroom-site-url.ts`). Messenger and Zalo fetch this
 * URL directly, with no page context to resolve a relative path against, so
 * it must never depend on Next.js' `metadataBase` fallback.
 */
import { showroomAbsoluteUrl } from "./showroom-site-url";

/** Site-relative path of the committed 1200×630 JPEG under `public/`. */
export const SHOWROOM_SOCIAL_IMAGE_PATH = "/showroom/og-weddingclick.jpg";

export const SHOWROOM_SOCIAL_IMAGE = Object.freeze({
  url: showroomAbsoluteUrl(SHOWROOM_SOCIAL_IMAGE_PATH),
  width: 1200,
  height: 630,
  /** Emitted as `og:image:type`; some crawlers use it to skip a HEAD probe. */
  type: "image/jpeg",
  alt: "WeddingClick — bộ sưu tập thiệp cưới online",
});
