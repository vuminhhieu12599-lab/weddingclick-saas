"use client";

import { useEffect, useRef, useState } from "react";

import type { ProjectSummary } from "../../../../../../lib/server/projects/project-types";
import { ActivityTab } from "./activity-tab";
import { DataTab } from "./data-tab";
import { DesignTab } from "./design-tab";
import { PublishTab } from "./publish-tab";
import { ReviewTab } from "./review-tab";
import { TasksTab } from "./tasks-tab";

const TABS = [
  { key: "DATA", label: "Dữ liệu" },
  { key: "DESIGN", label: "Thiết kế" },
  { key: "REVIEW", label: "Duyệt" },
  { key: "PUBLISH", label: "Xuất bản" },
  { key: "TASKS", label: "Công việc" },
  { key: "ACTIVITY", label: "Lịch sử" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

/** `?tab=` deep link (e.g. from the preview no-design state); anything unknown → DATA. */
export function parseWorkspaceTab(raw: string | null): TabKey {
  return TABS.find((tab) => tab.key === raw)?.key ?? "DATA";
}

export function WorkspaceTabs({
  project,
  initialTab = "DATA",
  onProjectChanged,
}: {
  project: ProjectSummary;
  initialTab?: TabKey;
  /** Re-reads the parent Project summary (header StatusBadge + Lifecycle) after a lifecycle/publish mutation. */
  onProjectChanged: () => void;
}) {
  const [active, setActive] = useState<TabKey>(initialTab);
  const stripRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // The strip scrolls horizontally on phones; keep the active tab (including a
  // `?tab=` deep link) in view by scrolling only the strip, never the page.
  useEffect(() => {
    const strip = stripRef.current;
    const tab = activeTabRef.current;
    if (!strip || !tab) return;
    const tabEnd = tab.offsetLeft + tab.offsetWidth;
    if (tab.offsetLeft < strip.scrollLeft || tabEnd > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
    }
  }, [active]);

  return (
    <div className="mt-6">
      <div
        ref={stripRef}
        className="relative flex gap-1 overflow-x-auto overscroll-x-contain border-b border-slate-200"
        data-workspace-tab-strip
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            ref={active === tab.key ? activeTabRef : undefined}
            type="button"
            onClick={() => setActive(tab.key)}
            aria-current={active === tab.key ? "true" : undefined}
            className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 ${
              active === tab.key
                ? "border-slate-900 bg-slate-100 text-slate-900 sm:bg-transparent"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {active === "DATA" && <DataTab project={project} onNavigate={setActive} />}
        {active === "DESIGN" && <DesignTab project={project} onNavigate={setActive} />}
        {active === "REVIEW" && <ReviewTab project={project} />}
        {active === "PUBLISH" && <PublishTab project={project} onProjectChanged={onProjectChanged} />}
        {active === "TASKS" && <TasksTab project={project} />}
        {active === "ACTIVITY" && <ActivityTab project={project} />}
      </div>
    </div>
  );
}
