import type { ProjectStatus, ProjectTaskStatus } from "../../domain";

/** Inclusive/exclusive bounds on a TIMESTAMPTZ column. Any bound also excludes NULL. */
export interface InstantRange {
  gte?: string;
  lt?: string;
  lte?: string;
}

export interface DashboardProjectFilter {
  status?: ProjectStatus;
  excludeStatuses?: readonly ProjectStatus[];
  deadlineAt?: InstantRange;
  completedAt?: InstantRange;
}

export interface DashboardTaskFilter {
  statuses: readonly ProjectTaskStatus[];
  /** Parent Project statuses whose tasks are not counted. */
  excludeProjectStatuses: readonly ProjectStatus[];
  dueAt?: InstantRange;
}

/** Navigation-only Project row for the deadline attention list. */
export interface DashboardDeadlineProject {
  id: string;
  projectCode: string;
  status: ProjectStatus;
  deadlineAt: string;
}

export interface DashboardAttentionProject extends DashboardDeadlineProject {
  overdue: boolean;
}

/** Task 034C staff dashboard aggregate (docs/API_CONTRACT.md §30). Counts only — no customer data. */
export interface AdminDashboard {
  /** Server instant all windows were computed from. */
  generatedAt: string;
  projects: {
    active: number;
    staffAction: number;
    waitingForCustomer: number;
    overdue: number;
    approaching: number;
    recentlyCompleted: number;
    byStatus: Record<ProjectStatus, number>;
  };
  tasks: {
    outstanding: number;
    overdue: number;
    upcoming: number;
  };
  /** Overdue first, then approaching; earliest deadline first; at most ATTENTION_LIST_LIMIT. */
  attention: DashboardAttentionProject[];
}
