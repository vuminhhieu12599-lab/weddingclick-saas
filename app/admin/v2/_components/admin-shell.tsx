import type { ReactNode } from "react";

import type { StaffMeSuccessBody } from "../../../../lib/server/routes/staff-me";
import { Sidebar } from "./sidebar";

export function AdminShell({
  staff,
  children,
}: {
  staff: StaffMeSuccessBody | null;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar staff={staff} />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
