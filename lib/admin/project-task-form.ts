import type { ProjectTaskStatus } from "../domain";
import { resolveCivilDateTime } from "../invitation-rendering/civil-date-time";
import type { ProjectTaskPatch, ProjectTaskRecord } from "../server/project-tasks/project-task-types";
import type { CreateProjectTaskBody } from "./admin-api-client";
import { civilToInstantIso } from "./required-invitation-data";

/**
 * Staff Project Task form ↔ API body mapping (Task 034A). The due date is
 * entered as a wall-clock `datetime-local` value in the same default
 * timezone the admin UI already formats timestamps in (format-date.ts), and
 * converted with the shared civil-time machinery — never by mutating the
 * browser timezone. The server stays authoritative and does the trimming.
 */
export const TASK_DUE_TIMEZONE = "Asia/Ho_Chi_Minh";

export interface TaskForm {
  title: string;
  status: ProjectTaskStatus;
  /** `YYYY-MM-DDTHH:mm` or "" for no deadline. */
  dueLocal: string;
  /** Profile id or "" for unassigned. */
  assignedStaffId: string;
}

export const EMPTY_TASK_FORM: TaskForm = { title: "", status: "TODO", dueLocal: "", assignedStaffId: "" };

type BuildResult<T> = { ok: true; body: T } | { ok: false; error: string };

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

export function dueAtToLocalInput(dueAt: string | null): string {
  if (dueAt === null) return "";
  const epochMs = Date.parse(dueAt);
  if (!Number.isFinite(epochMs)) return "";
  const c = resolveCivilDateTime(epochMs, TASK_DUE_TIMEZONE);
  return `${pad(c.year, 4)}-${pad(c.month)}-${pad(c.day)}T${pad(c.hour)}:${pad(c.minute)}`;
}

function localInputToDueAt(dueLocal: string): BuildResult<string | null> {
  if (dueLocal.trim() === "") return { ok: true, body: null };
  const [date, time] = dueLocal.split("T");
  const instant = civilToInstantIso(date ?? "", (time ?? "").slice(0, 5), TASK_DUE_TIMEZONE);
  return instant === null ? { ok: false, error: "Hạn hoàn thành không hợp lệ." } : { ok: true, body: instant };
}

export function taskFormFrom(task: ProjectTaskRecord): TaskForm {
  return {
    title: task.title,
    status: task.status,
    dueLocal: dueAtToLocalInput(task.dueAt),
    assignedStaffId: task.assignedStaffId ?? "",
  };
}

export function buildCreateTaskBody(form: TaskForm): BuildResult<CreateProjectTaskBody> {
  if (form.title.trim() === "") return { ok: false, error: "Cần nhập tiêu đề." };
  const dueAt = localInputToDueAt(form.dueLocal);
  if (!dueAt.ok) return dueAt;
  return {
    ok: true,
    body: { title: form.title, dueAt: dueAt.body, assignedStaffId: form.assignedStaffId === "" ? null : form.assignedStaffId },
  };
}

/**
 * Only the fields the staff member actually changed, so an untouched value
 * (e.g. an assignee who has since been deactivated) is never rewritten.
 * An empty patch means "nothing to save".
 */
export function buildTaskPatch(task: ProjectTaskRecord, form: TaskForm): BuildResult<ProjectTaskPatch> {
  const original = taskFormFrom(task);
  const patch: ProjectTaskPatch = {};
  if (form.title !== original.title) {
    if (form.title.trim() === "") return { ok: false, error: "Cần nhập tiêu đề." };
    patch.title = form.title;
  }
  if (form.status !== original.status) patch.status = form.status;
  if (form.dueLocal !== original.dueLocal) {
    const dueAt = localInputToDueAt(form.dueLocal);
    if (!dueAt.ok) return dueAt;
    patch.dueAt = dueAt.body;
  }
  if (form.assignedStaffId !== original.assignedStaffId) {
    patch.assignedStaffId = form.assignedStaffId === "" ? null : form.assignedStaffId;
  }
  return { ok: true, body: patch };
}
