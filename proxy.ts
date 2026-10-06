import { NextResponse, type NextRequest } from "next/server";

import { guardTokenPageRequest } from "./lib/server/rate-limit/rate-limit-guards";
import { createUpstashRateLimitStore } from "./lib/server/rate-limit/upstash-rate-limit-store";

/**
 * Task 035A — TOKEN_PAGE abuse control (docs/SECURITY.md §11.1). Pages
 * cannot return 429 themselves, so this Next 16 Proxy runs the per-IP
 * TOKEN_PAGE guard (120 / 1 minute, sliding window) BEFORE the page's
 * service_role token resolution. The key is the hashed trusted client IP —
 * never the path token — so a 429 reveals nothing about token validity, and
 * the path is never logged. Limiter store unavailable → fail OPEN (the page
 * renders as before).
 *
 * The matcher is deliberately narrow: only the four token-bearing pages. The
 * generic public invitation /i/[slug], every API route (guarded in their own
 * route files) and all staff/admin traffic never enter this proxy.
 */
export async function proxy(request: NextRequest) {
  const limited = await guardTokenPageRequest(request.headers, createUpstashRateLimitStore());
  return limited ?? NextResponse.next();
}

export const config = {
  matcher: ["/i/:slug/g/:token", "/review/:token", "/review/:token/frame", "/portal/:token"],
};
