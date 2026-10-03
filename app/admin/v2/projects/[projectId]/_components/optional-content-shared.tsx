"use client";

/** Per-card async status shared by the optional-content editors. */
export type CardStatus =
  | { kind: "IDLE" }
  | { kind: "SAVING"; label?: string }
  | { kind: "SAVED" }
  | { kind: "ERROR"; message: string };

export const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";

export const SMALL_BUTTON_CLASS =
  "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";

export const PRIMARY_BUTTON_CLASS =
  "rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40";

/** The server's own safe message (never raw database detail). */
export function actionError(error: unknown): string {
  return error instanceof Error ? `Không thành công: ${error.message}` : "Không thành công.";
}

/** Success is shown only after the server confirmed the write. */
export function StatusLine({ status }: { status: CardStatus }) {
  if (status.kind === "SAVING") return <p className="mt-2 text-xs text-slate-500">{status.label ?? "Đang lưu..."}</p>;
  if (status.kind === "SAVED") return <p className="mt-2 text-xs text-emerald-700">Đã lưu.</p>;
  if (status.kind === "ERROR") return <p className="mt-2 text-xs text-red-600">{status.message}</p>;
  return null;
}
