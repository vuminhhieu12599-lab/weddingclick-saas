"use client";

import { useState } from "react";

import {
  createProjectTask,
  deleteProjectTask,
  fetchProjectTasks,
  fetchTaskAssignees,
  updateProjectTask,
} from "../../../../../../lib/admin/admin-api-client";
import {
  buildCreateTaskBody,
  buildTaskPatch,
  EMPTY_TASK_FORM,
  type TaskForm,
  taskFormFrom,
} from "../../../../../../lib/admin/project-task-form";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import type { ProjectTaskStatus } from "../../../../../../lib/domain";
import { formatDateTimeVi } from "../../../../../../lib/presentation/format-date";
import {
  getProjectTaskStatusLabel,
  PROJECT_TASK_STATUS_OPTIONS,
} from "../../../../../../lib/presentation/project-task-status-labels";
import type {
  AssignableStaffRecord,
  ProjectTaskRecord,
} from "../../../../../../lib/server/project-tasks/project-task-types";
import type { ProjectSummary } from "../../../../../../lib/server/projects/project-types";
import { EmptyState, ErrorState, LoadingState } from "../../../_components/page-states";
import { actionError, type CardStatus, INPUT_CLASS, StatusLine } from "./optional-content-shared";

/**
 * Công việc (Task 034A): lightweight staff-only operational tasks for this
 * Project. Plain CRUD — no subtasks, comments, priorities, notifications or
 * activity logging. Every successful write re-reads the list from the server.
 */

const BUTTON_CLASS =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const PRIMARY_CLASS =
  "min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40";
const DANGER_CLASS =
  "min-h-11 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40";
const FIELD_CLASS = `${INPUT_CLASS} min-h-11`;

const STATUS_TONE: Record<ProjectTaskStatus, string> = {
  TODO: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  DONE: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-100 text-slate-400 line-through",
};

export type TaskEditorMode = { kind: "NONE" } | { kind: "CREATE" } | { kind: "EDIT"; taskId: string } | { kind: "DELETE"; taskId: string };

function TaskFormFields({
  form,
  onChange,
  assignees,
  current,
  showStatus,
}: {
  form: TaskForm;
  onChange: (patch: Partial<TaskForm>) => void;
  assignees: readonly AssignableStaffRecord[];
  /** The task being edited: keeps a since-deactivated assignee selectable as-is. */
  current: ProjectTaskRecord | null;
  showStatus: boolean;
}) {
  const inactiveAssignee =
    current?.assignedStaffId && !assignees.some((staff) => staff.id === current.assignedStaffId)
      ? { id: current.assignedStaffId, label: `${current.assignedStaffDisplayName ?? "Nhân sự"} (ngừng hoạt động)` }
      : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="text-xs font-medium text-slate-600">Tiêu đề</span>
        <input
          className={`${FIELD_CLASS} mt-1`}
          value={form.title}
          maxLength={200}
          placeholder="Ví dụ: Gửi bản review"
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </label>
      {showStatus && (
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Trạng thái</span>
          <select
            className={`${FIELD_CLASS} mt-1`}
            value={form.status}
            onChange={(e) => onChange({ status: e.target.value as ProjectTaskStatus })}
          >
            {PROJECT_TASK_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Hạn hoàn thành</span>
        <input
          type="datetime-local"
          className={`${FIELD_CLASS} mt-1`}
          value={form.dueLocal}
          onChange={(e) => onChange({ dueLocal: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Người phụ trách</span>
        <select
          className={`${FIELD_CLASS} mt-1`}
          value={form.assignedStaffId}
          onChange={(e) => onChange({ assignedStaffId: e.target.value })}
        >
          <option value="">Không phân công</option>
          {inactiveAssignee && <option value={inactiveAssignee.id}>{inactiveAssignee.label}</option>}
          {assignees.map((staff) => (
            <option key={staff.id} value={staff.id}>
              {staff.displayName}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** In-page delete confirmation (never `window.confirm`). */
export function DeleteTaskConfirm({
  task,
  busy,
  onConfirm,
  onCancel,
}: {
  task: ProjectTaskRecord;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alertdialog" aria-label="Xác nhận xoá công việc" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm text-red-800">
        Xoá công việc <span className="font-medium break-words">“{task.title}”</span>? Thao tác này không thể hoàn tác.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={DANGER_CLASS} disabled={busy} onClick={onConfirm}>
          Xoá công việc
        </button>
        <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </div>
  );
}

export function TasksTabView({
  projectId,
  tasks,
  assignees,
  refreshing,
  onChanged,
  initialMode = { kind: "NONE" },
}: {
  projectId: string;
  tasks: readonly ProjectTaskRecord[];
  assignees: readonly AssignableStaffRecord[];
  refreshing: boolean;
  /** Re-read tasks from the server after a confirmed write. */
  onChanged: () => void;
  initialMode?: TaskEditorMode;
}) {
  const [mode, setMode] = useState<TaskEditorMode>(initialMode);
  const [form, setForm] = useState<TaskForm>(() => {
    if (initialMode.kind === "EDIT") {
      const task = tasks.find((row) => row.id === initialMode.taskId);
      if (task) return taskFormFrom(task);
    }
    return EMPTY_TASK_FORM;
  });
  const [status, setStatus] = useState<CardStatus>({ kind: "IDLE" });
  const busy = status.kind === "SAVING" || refreshing;
  const update = (patch: Partial<TaskForm>) => setForm((current) => ({ ...current, ...patch }));

  async function run(action: () => Promise<void>) {
    setStatus({ kind: "SAVING" });
    try {
      await action();
      setMode({ kind: "NONE" });
      setStatus({ kind: "SAVED" });
      onChanged();
    } catch (error) {
      setStatus({ kind: "ERROR", message: actionError(error) });
    }
  }

  function startCreate() {
    setForm(EMPTY_TASK_FORM);
    setStatus({ kind: "IDLE" });
    setMode({ kind: "CREATE" });
  }

  function startEdit(task: ProjectTaskRecord) {
    setForm(taskFormFrom(task));
    setStatus({ kind: "IDLE" });
    setMode({ kind: "EDIT", taskId: task.id });
  }

  function submitCreate() {
    const built = buildCreateTaskBody(form);
    if (!built.ok) return setStatus({ kind: "ERROR", message: built.error });
    void run(async () => {
      await createProjectTask(projectId, built.body);
    });
  }

  function submitEdit(task: ProjectTaskRecord) {
    const built = buildTaskPatch(task, form);
    if (!built.ok) return setStatus({ kind: "ERROR", message: built.error });
    if (Object.keys(built.body).length === 0) {
      setMode({ kind: "NONE" });
      return;
    }
    void run(async () => {
      await updateProjectTask(projectId, task.id, built.body);
    });
  }

  function confirmDelete(task: ProjectTaskRecord) {
    void run(async () => {
      await deleteProjectTask(projectId, task.id);
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Công việc</h3>
          <p className="text-xs text-slate-500">Việc nội bộ của nhân sự cho dự án này. Khách hàng không nhìn thấy.</p>
        </div>
        {mode.kind !== "CREATE" && (
          <button type="button" className={PRIMARY_CLASS} disabled={busy} onClick={startCreate}>
            Thêm công việc
          </button>
        )}
      </div>

      {mode.kind === "CREATE" && (
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <TaskFormFields form={form} onChange={update} assignees={assignees} current={null} showStatus={false} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={PRIMARY_CLASS} disabled={busy} onClick={submitCreate}>
              Lưu
            </button>
            <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={() => setMode({ kind: "NONE" })}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        {tasks.length === 0 ? (
          <EmptyState title="Chưa có công việc nào." />
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={task.id} data-task-id={task.id} className="rounded-lg border border-slate-200 p-3">
                {mode.kind === "EDIT" && mode.taskId === task.id ? (
                  <>
                    <TaskFormFields form={form} onChange={update} assignees={assignees} current={task} showStatus />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className={PRIMARY_CLASS} disabled={busy} onClick={() => submitEdit(task)}>
                        Lưu
                      </button>
                      <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={() => setMode({ kind: "NONE" })}>
                        Huỷ
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium break-words text-slate-900">{task.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_TONE[task.status]}`}>
                            {getProjectTaskStatusLabel(task.status)}
                          </span>
                          {task.dueAt && <span>Hạn: {formatDateTimeVi(task.dueAt)}</span>}
                          {task.assignedStaffId && (
                            <span className="break-words">Phụ trách: {task.assignedStaffDisplayName ?? "Nhân sự"}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={() => startEdit(task)}>
                          Sửa
                        </button>
                        <button
                          type="button"
                          className={BUTTON_CLASS}
                          disabled={busy}
                          onClick={() => {
                            setStatus({ kind: "IDLE" });
                            setMode({ kind: "DELETE", taskId: task.id });
                          }}
                        >
                          Xoá
                        </button>
                      </div>
                    </div>
                    {mode.kind === "DELETE" && mode.taskId === task.id && (
                      <DeleteTaskConfirm
                        task={task}
                        busy={busy}
                        onConfirm={() => confirmDelete(task)}
                        onCancel={() => setMode({ kind: "NONE" })}
                      />
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {refreshing && <p className="mt-2 text-xs text-slate-500">Đang tải lại...</p>}
      <StatusLine status={status} />
    </section>
  );
}

export function TasksTab({ project }: { project: ProjectSummary }) {
  const { data, loading, error, reload } = useAdminQuery(
    async () => {
      const [tasks, assignees] = await Promise.all([fetchProjectTasks(project.id), fetchTaskAssignees(project.id)]);
      return { tasks, assignees };
    },
    [project.id],
  );
  if (!data && loading) return <LoadingState label="Đang tải công việc..." />;
  if (!data) return <ErrorState message={error ?? "Không thể tải công việc"} onRetry={reload} />;
  return (
    <>
      {error && <ErrorState message={error} onRetry={reload} />}
      <TasksTabView projectId={project.id} tasks={data.tasks} assignees={data.assignees} refreshing={loading} onChanged={reload} />
    </>
  );
}
