import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Xem trước thiệp (nội bộ)",
  robots: { index: false, follow: false },
};

/**
 * Staff-only isolated preview document, loaded by the Staff Preview page in
 * a same-origin iframe so the invitation owns a real viewport (100svh,
 * position: fixed, scrolling). Deliberately outside `/admin/v2` so no
 * AdminShell wraps the invitation. Not a public route and not `/i/[slug]`.
 */
export default function PreviewFrameLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
