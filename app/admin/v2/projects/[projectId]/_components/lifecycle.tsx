import type { ProjectStatus } from "../../../../../../lib/domain";
import {
  getProjectStatusLabel,
  PROJECT_STATUS_SEQUENCE,
} from "../../../../../../lib/presentation/project-status-labels";

/**
 * Compact read-only lifecycle visualization along the frozen ProjectStatus
 * sequence (CLAUDE.md §8/§30). No status mutation control — UI-001 is
 * read-only.
 *
 * Wraps onto multiple rows (rather than scrolling horizontally) so the full
 * 12-status sequence is understandable without a scrollbar at any desktop
 * width — order is still conveyed by left-to-right, top-to-bottom reading
 * order, so the inter-step connector line is dropped rather than made to
 * work across wrapped rows.
 *
 * Below sm, wrapping 12 pills is too dense: the current step is summarized
 * first and the same frozen sequence becomes one horizontally scrollable row.
 */
export function Lifecycle({ status }: { status: ProjectStatus }) {
  const currentIndex = PROJECT_STATUS_SEQUENCE.indexOf(status);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm text-slate-700 sm:hidden" data-lifecycle-summary>
        {currentIndex >= 0 && (
          <span className="text-slate-500">
            Bước {currentIndex + 1}/{PROJECT_STATUS_SEQUENCE.length}:{" "}
          </span>
        )}
        <span className="font-semibold text-slate-900">{getProjectStatusLabel(status)}</span>
      </p>
      <ol className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {PROJECT_STATUS_SEQUENCE.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isPast = index < currentIndex;

          return (
            <li
              key={step}
              aria-current={isCurrent ? "step" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                isCurrent
                  ? "bg-slate-900 text-white"
                  : isPast
                    ? "bg-slate-100 text-slate-500"
                    : "bg-white text-slate-300 ring-1 ring-inset ring-slate-200"
              }`}
            >
              {getProjectStatusLabel(step)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
