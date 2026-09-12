"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { getStaffRoleLabel } from "../../../../lib/presentation/staff-role-labels";
import type { StaffMeSuccessBody } from "../../../../lib/server/routes/staff-me";

const NAV_ITEMS = [
  { href: "/admin/v2", label: "Tổng quan", exact: true },
  { href: "/admin/v2/projects", label: "Dự án", exact: false },
] as const;

/** Product areas not yet built in V2 — shown disabled rather than omitted, per this task's shell spec. */
const DISABLED_NAV_ITEMS = ["Khách mời", "Thống kê", "Nhân sự"];

export function Sidebar({ staff }: { staff: StaffMeSuccessBody | null }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center border-b border-slate-100 px-5">
        <span className="text-lg font-semibold tracking-tight text-slate-900">WeddingClick</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}

        {DISABLED_NAV_ITEMS.map((label) => (
          <span
            key={label}
            className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-300"
            title="Chưa triển khai"
          >
            {label}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
              Sắp có
            </span>
          </span>
        ))}
      </nav>

      <div className="border-t border-slate-100 p-4">
        {staff ? (
          <div>
            <p className="truncate text-sm font-medium text-slate-800">{staff.displayName}</p>
            <p className="text-xs text-slate-400">{getStaffRoleLabel(staff.role)}</p>
          </div>
        ) : (
          <div className="h-8 animate-pulse rounded bg-slate-100" />
        )}
      </div>
    </aside>
  );
}
