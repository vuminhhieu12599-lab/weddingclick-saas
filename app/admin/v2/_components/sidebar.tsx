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
    // Below md the sidebar is a compact top bar (brand + staff, nav as one
    // horizontally scrollable row) so the workspace gets the full phone width;
    // md+ keeps the original 240px column.
    <aside className="flex w-full shrink-0 flex-row flex-wrap items-center border-b border-slate-200 bg-white md:h-full md:w-60 md:flex-col md:flex-nowrap md:items-stretch md:border-b-0 md:border-r">
      <div className="flex h-14 min-w-0 flex-1 items-center px-4 md:h-16 md:flex-none md:border-b md:border-slate-100 md:px-5">
        <span className="text-lg font-semibold tracking-tight text-slate-900">WeddingClick</span>
      </div>

      <nav className="order-last flex w-full gap-1 overflow-x-auto border-t border-slate-100 p-2 md:order-none md:block md:flex-1 md:space-y-1 md:overflow-visible md:border-t-0 md:p-3">
        {NAV_ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
            className="flex shrink-0 cursor-not-allowed items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-300"
            title="Chưa triển khai"
          >
            {label}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
              Sắp có
            </span>
          </span>
        ))}
      </nav>

      <div className="min-w-0 max-w-[50%] px-4 py-2 text-right md:max-w-none md:border-t md:border-slate-100 md:p-4 md:text-left">
        {staff ? (
          <div>
            <p className="truncate text-sm font-medium text-slate-800">{staff.displayName}</p>
            <p className="text-xs text-slate-400">{getStaffRoleLabel(staff.role)}</p>
          </div>
        ) : (
          <div className="h-8 w-24 animate-pulse rounded bg-slate-100 md:w-auto" />
        )}
      </div>
    </aside>
  );
}
