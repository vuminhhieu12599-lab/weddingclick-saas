import { redirect } from "next/navigation";

/**
 * Legacy V1 staff route — retired by Task 035B (docs/SECURITY.md §11.2). The
 * exact path is also redirected in next.config.ts; this page-level redirect
 * keeps it contained even if that configuration changes. No V1 table is read
 * or written.
 */
export default function LegacyV1StaffRedirect() {
  redirect("/admin/v2");
}
