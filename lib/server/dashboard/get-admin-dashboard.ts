import {
  DASHBOARD_RECENTLY_COMPLETED_DAYS,
  DASHBOARD_UPCOMING_WINDOW_DAYS,
  OUTSTANDING_TASK_STATUSES,
  PROJECT_CLOSED_STATUSES,
  PROJECT_DEADLINE_CLOSED_STATUSES,
  PROJECT_STAFF_ACTION_STATUSES,
  PROJECT_STATUSES,
  PROJECT_WAITING_FOR_CUSTOMER_STATUSES,
  type ProjectStatus,
} from "../../domain";
import type { StaffContext } from "../auth/staff-context";
import type { DashboardGateway } from "./dashboard-gateway";
import type { AdminDashboard } from "./dashboard-types";

/**
 * Staff admin dashboard (Task 034C): a fixed set of read-only aggregate
 * queries over the current canonical tables — never activity_logs, never
 * one query per Project/staff/task. Windows are exact rolling durations
 * from `now`, compared as instants by the database.
 */
export const ATTENTION_LIST_LIMIT = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

function sum(byStatus: Record<ProjectStatus, number>, statuses: readonly ProjectStatus[]): number {
  return statuses.reduce((total, status) => total + byStatus[status], 0);
}

export async function getAdminDashboard<TClient>(
  staff: StaffContext<TClient>,
  gateway: DashboardGateway<TClient>,
  now: Date,
): Promise<AdminDashboard> {
  const client = staff.supabase;
  const nowIso = now.toISOString();
  const upcomingEndIso = new Date(now.getTime() + DASHBOARD_UPCOMING_WINDOW_DAYS * DAY_MS).toISOString();
  const completedStartIso = new Date(now.getTime() - DASHBOARD_RECENTLY_COMPLETED_DAYS * DAY_MS).toISOString();

  const overdueDeadline = { lt: nowIso };
  const approachingDeadline = { gte: nowIso, lte: upcomingEndIso };
  const deadlineScope = { excludeStatuses: PROJECT_DEADLINE_CLOSED_STATUSES };
  const taskScope = { statuses: OUTSTANDING_TASK_STATUSES, excludeProjectStatuses: PROJECT_CLOSED_STATUSES };

  const [statusCounts, overdue, approaching, recentlyCompleted, outstanding, tasksOverdue, tasksUpcoming, overdueList, approachingList] =
    await Promise.all([
      Promise.all(PROJECT_STATUSES.map((status) => gateway.countProjects(client, { status }))),
      gateway.countProjects(client, { ...deadlineScope, deadlineAt: overdueDeadline }),
      gateway.countProjects(client, { ...deadlineScope, deadlineAt: approachingDeadline }),
      gateway.countProjects(client, { status: "COMPLETED", completedAt: { gte: completedStartIso } }),
      gateway.countTasks(client, taskScope),
      gateway.countTasks(client, { ...taskScope, dueAt: { lt: nowIso } }),
      gateway.countTasks(client, { ...taskScope, dueAt: { gte: nowIso, lte: upcomingEndIso } }),
      gateway.listDeadlineProjects(client, { ...deadlineScope, deadlineAt: overdueDeadline }, ATTENTION_LIST_LIMIT),
      gateway.listDeadlineProjects(client, { ...deadlineScope, deadlineAt: approachingDeadline }, ATTENTION_LIST_LIMIT),
    ]);

  const byStatus = Object.fromEntries(PROJECT_STATUSES.map((status, i) => [status, statusCounts[i]])) as Record<ProjectStatus, number>;

  return {
    generatedAt: nowIso,
    projects: {
      active: sum(byStatus, PROJECT_STATUSES.filter((s) => !(PROJECT_CLOSED_STATUSES as readonly ProjectStatus[]).includes(s))),
      staffAction: sum(byStatus, PROJECT_STAFF_ACTION_STATUSES),
      waitingForCustomer: sum(byStatus, PROJECT_WAITING_FOR_CUSTOMER_STATUSES),
      overdue,
      approaching,
      recentlyCompleted,
      byStatus,
    },
    tasks: { outstanding, overdue: tasksOverdue, upcoming: tasksUpcoming },
    attention: [
      ...overdueList.map((project) => ({ ...project, overdue: true })),
      ...approachingList.map((project) => ({ ...project, overdue: false })),
    ].slice(0, ATTENTION_LIST_LIMIT),
  };
}
