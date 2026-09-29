import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Renderer Harness (internal)",
  robots: { index: false, follow: false },
};

/**
 * RF-06B internal renderer harness gate (docs/DECISIONS.md "RF-06-0 …"
 * P38–P39). The single harness server gate module: the only harness module
 * that reads `process.env`, and it reads only `NODE_ENV`, solely to return
 * `notFound()` in production. Never staff preview, never a public route.
 */
export default function RendererHarnessLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <>{children}</>;
}
