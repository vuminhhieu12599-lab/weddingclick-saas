import type { ReactNode } from "react";

/**
 * WC-SHOWROOM-NAV-01 — a link into a homepage section.
 *
 * Deliberately a native `<a>` rather than `next/link`. On the homepage these
 * hrefs are same-document fragments, and the router treats a navigation to the
 * URL the page is already on as a no-op: the first click scrolled and set the
 * hash, and every click after that did nothing at all. The browser's own
 * fragment navigation always re-runs "scroll to the fragment", so a repeat
 * click still scrolls; it honours the sections' `scroll-margin-top`, so the
 * sticky header never hides a heading; and from another page it simply loads
 * the homepage already at that section.
 *
 * Links that can never be same-page — a demo page or the consultation page
 * pointing back at the homepage — keep `next/link`, which works there.
 */
export function SectionLink({
  href,
  className,
  children,
}: {
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
