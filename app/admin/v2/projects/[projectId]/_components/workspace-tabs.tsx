"use client";

import { useState } from "react";

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

export function WorkspaceTabs({ project, initialTab = "DATA" }: { project: ProjectSummary; initialTab?: TabKey }) {
  const [active, setActive] = useState<TabKey>(initialTab);

  return (
    <div className="mt-6">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              active === tab.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {active === "DATA" && <DataTab project={project} />}
        {active === "DESIGN" && <DesignTab project={project} />}
        {active === "REVIEW" && <ReviewTab project={project} />}
        {active === "PUBLISH" && <PublishTab project={project} />}
        {active === "TASKS" && <TasksTab project={project} />}
        {active === "ACTIVITY" && <ActivityTab project={project} />}
      </div>
    </div>
  );
}
