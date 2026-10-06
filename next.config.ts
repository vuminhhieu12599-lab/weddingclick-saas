import type { NextConfig } from "next";

/**
 * Task 035B — Legacy V1 staff routes are retired (docs/SECURITY.md §11.2).
 * Exact literal sources only (no `:path*`), so `/admin/v2` and every other
 * V2 route never match. `/admin` is contained here rather than in its page
 * file. Temporary (307), so the paths can be reused later without cached
 * permanent redirects.
 */
export const LEGACY_V1_STAFF_REDIRECTS = [
  { source: "/admin", destination: "/admin/v2", permanent: false },
  { source: "/dashboard", destination: "/admin/v2", permanent: false },
  { source: "/thong-ke", destination: "/admin/v2", permanent: false },
] as const;

const nextConfig: NextConfig = {
  async redirects() {
    return LEGACY_V1_STAFF_REDIRECTS.map((rule) => ({ ...rule }));
  },
};

export default nextConfig;
