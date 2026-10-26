/**
 * WC-PROD-REVIEW-01 — the one configurable public base URL for the showroom.
 *
 * Social crawlers (Facebook Messenger, Zalo) fetch `og:image` as a plain
 * HTTP GET with no cookies and no session. The URL therefore has to be
 * absolute, HTTPS and reachable by anyone. Next.js builds that absolute URL
 * from `metadataBase`; when a page does not set one it falls back to
 * `VERCEL_PROJECT_PRODUCTION_URL`, i.e. whichever custom domain the Vercel
 * project currently has assigned. That fallback is what broke sharing: the
 * assigned domain is retired and no longer serves, so every relative
 * `og:image` resolved to a dead host.
 *
 * The base is read from `NEXT_PUBLIC_SITE_URL`, set per Vercel environment.
 * It is a public URL, not a secret. When it is unset or unusable the
 * committed default below is used, so a missing variable can never
 * reintroduce a dead or login-protected image URL.
 *
 * Switching to the new custom domain later is one environment variable and a
 * redeploy — no code change.
 */

/** The environment variable that overrides the default base URL. */
export const SHOWROOM_SITE_URL_ENV_VAR = "NEXT_PUBLIC_SITE_URL";

/**
 * The fallback base: the stable, publicly reachable Production Vercel alias.
 *
 * Deliberately NOT a per-deployment URL (`*-<hash>-<scope>.vercel.app`),
 * because those sit behind Vercel SSO on preview and change every deploy,
 * and deliberately NOT a custom domain, because none is purchased yet.
 */
export const DEFAULT_SHOWROOM_SITE_URL = "https://weddingclick.vercel.app";

/**
 * Hosts that must never be used again (Product Owner decision,
 * WC-PROD-REVIEW-01). They still resolve in DNS but no longer serve, so a
 * crawler fetching an image there gets nothing and shows no thumbnail.
 */
export const RETIRED_SHOWROOM_HOSTS: readonly string[] = Object.freeze(["weddingclick.online", "www.weddingclick.online"]);

/**
 * An origin-only HTTPS base URL, or `null` when `raw` cannot be one.
 *
 * Rejects a non-HTTPS scheme (crawlers refuse mixed content), anything that
 * is not a URL at all, and the retired hosts above. Any path, query or
 * fragment is dropped: a base URL is an origin.
 */
function parseSiteUrl(raw: string | undefined): URL | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (RETIRED_SHOWROOM_HOSTS.includes(parsed.hostname.toLowerCase())) return null;
  return new URL(`${parsed.origin}/`);
}

/** Pure resolver: the configured base URL, else the committed default. */
export function resolveShowroomSiteUrl(raw: string | undefined): URL {
  return parseSiteUrl(raw) ?? new URL(DEFAULT_SHOWROOM_SITE_URL);
}

/**
 * The base URL this build publishes. Read once at module load so page
 * metadata stays a build-time constant and the showroom pages remain
 * statically rendered — no request-time metadata work.
 */
export const SHOWROOM_SITE_URL: URL = resolveShowroomSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

/** An absolute HTTPS URL for a site-relative path, e.g. `/showroom/x.jpg`. */
export function showroomAbsoluteUrl(path: string): string {
  return new URL(path, SHOWROOM_SITE_URL).toString();
}
