import {
  fetchAdminDashboard,
  fetchCustomerById,
  fetchEditorReadiness,
  fetchProjectById,
  fetchProjectDesign,
  fetchProjectDressCode,
  fetchProjectEvents,
  fetchProjectMedia,
  fetchProjectTasks,
  fetchProjectTimeline,
  fetchProjects,
  fetchTaskAssignees,
  fetchTemplateCatalog,
  fetchWeddingDetails,
} from "./admin-api-client";

/**
 * LAUNCH-P0-03: the V2 Admin reads that may be reused for a short time
 * (lib/admin/admin-data-cache.ts). Each definition pairs one reuse key with
 * the exact fetcher it names, so two screens that share a key always load
 * the same thing. A key always contains every id its fetcher reads.
 *
 * Deliberately NOT reusable (always loaded fresh on mount, only shared while
 * in flight): Review and Publish state and Activity (they reflect customer
 * approval and audit events that happen outside this browser), access-link
 * inventory, previews and the photo library / template media slots (they
 * carry short-lived signed media URLs), and any read made just before a save.
 */
export interface AdminQueryDefinition<T> {
  key: string;
  fetch: () => Promise<T>;
}

function project(projectId: string, resource: string): string {
  return `project:${projectId}:${resource}`;
}

export const adminQueries = {
  dashboard: () => ({ key: "dashboard", fetch: () => fetchAdminDashboard() }),

  projects: (limit?: number) => ({
    key: `projects:limit=${limit ?? "default"}`,
    fetch: () => fetchProjects(limit === undefined ? {} : { limit }),
  }),

  projectSummary: (projectId: string) => ({
    key: project(projectId, "summary"),
    fetch: () => fetchProjectById(projectId),
  }),

  customer: (customerId: string) => ({
    key: `customer:${customerId}`,
    fetch: () => fetchCustomerById(customerId),
  }),

  /** Template catalog + the Project's current design (DATA and DESIGN tabs). */
  designAndCatalog: (projectId: string) => ({
    key: project(projectId, "design+catalog"),
    fetch: async () => {
      const [catalog, design] = await Promise.all([fetchTemplateCatalog(), fetchProjectDesign(projectId)]);
      return { catalog, design };
    },
  }),

  /** Canonical wedding details + events ("Thông tin bắt buộc cho thiệp"). */
  requiredInvitationData: (projectId: string) => ({
    key: project(projectId, "wedding-details+events"),
    fetch: async () => {
      const [details, events] = await Promise.all([fetchWeddingDetails(projectId), fetchProjectEvents(projectId)]);
      return { details, events };
    },
  }),

  weddingDetails: (projectId: string) => ({
    key: project(projectId, "wedding-details"),
    fetch: () => fetchWeddingDetails(projectId),
  }),

  editorReadiness: (projectId: string) => ({
    key: project(projectId, "editor-readiness"),
    fetch: () => fetchEditorReadiness(projectId),
  }),

  media: (projectId: string) => ({
    key: project(projectId, "media"),
    fetch: () => fetchProjectMedia(projectId),
  }),

  timeline: (projectId: string) => ({
    key: project(projectId, "timeline"),
    fetch: () => fetchProjectTimeline(projectId),
  }),

  dressCode: (projectId: string) => ({
    key: project(projectId, "dress-code"),
    fetch: () => fetchProjectDressCode(projectId),
  }),

  /** Tasks + assignable Staff (TASKS tab). */
  tasks: (projectId: string) => ({
    key: project(projectId, "tasks+assignees"),
    fetch: async () => {
      const [tasks, assignees] = await Promise.all([fetchProjectTasks(projectId), fetchTaskAssignees(projectId)]);
      return { tasks, assignees };
    },
  }),
} satisfies Record<string, (...args: never[]) => AdminQueryDefinition<unknown>>;
