"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AdminShell } from "./_components/admin-shell";
import { useStaffSession } from "./_hooks/use-staff-session";

/**
 * V2 Admin shell/auth-guard layout (UI-001). Applies to every route under
 * `/admin/v2` without touching the unrelated V1 `/admin` route.
 */
export default function AdminV2Layout({ children }: { children: React.ReactNode }) {
  const session = useStaffSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace("/login");
    }
  }, [session.status, router]);

  if (session.status === "loading" || session.status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Đang xác thực nhân sự...
      </div>
    );
  }

  if (session.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">Không thể mở khu vực quản trị V2</p>
          <p className="mt-2 text-sm text-red-600">{session.message}</p>
        </div>
      </div>
    );
  }

  return <AdminShell staff={session.staff}>{children}</AdminShell>;
}
