import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invitation Prototype Review (internal)",
  robots: { index: false, follow: false },
};

/**
 * Task 029 checkpoint isolation: this route must never appear in a
 * production deployment or production navigation. Development/preview only.
 */
export default function InvitationPrototypeLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <>{children}</>;
}
