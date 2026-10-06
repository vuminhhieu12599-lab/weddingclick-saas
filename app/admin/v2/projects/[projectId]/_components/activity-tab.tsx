"use client";

import { useRef, useState } from "react";

import { fetchProjectActivity } from "../../../../../../lib/admin/admin-api-client";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import { formatDateTimeVi } from "../../../../../../lib/presentation/format-date";
import type {
  ProjectActivityPage,
  ProjectActivityRecord,
} from "../../../../../../lib/server/project-activity/project-activity-types";
import type { ProjectSummary } from "../../../../../../lib/server/projects/project-types";
import { EmptyState, ErrorState, LoadingState } from "../../../_components/page-states";
import { actionError } from "./optional-content-shared";

/**
 * Lịch sử (Task 034B): read-only, newest-first audit history of this
 * Project, exactly as the trusted business actions recorded it. Shows the
 * stored summary, the actor and the time — never metadata or identifiers.
 * No realtime: a manual reload shows newer rows.
 */

const BUTTON_CLASS =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";

export function ActivityTabView({
  items,
  nextCursor,
  loadingMore,
  loadMoreError,
  refreshing,
  onLoadMore,
  onReload,
}: {
  items: readonly ProjectActivityRecord[];
  nextCursor: string | null;
  loadingMore: boolean;
  loadMoreError: string | null;
  refreshing: boolean;
  onLoadMore: () => void;
  onReload: () => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">Lịch sử</h3>
          <p className="text-xs text-slate-500">Các thao tác quan trọng trên dự án, mới nhất trước. Chỉ nhân sự nhìn thấy.</p>
        </div>
        <button type="button" className={BUTTON_CLASS} disabled={refreshing || loadingMore} onClick={onReload}>
          Tải lại
        </button>
      </div>

      <div className="mt-4">
        {items.length === 0 ? (
          <EmptyState title="Chưa có lịch sử hoạt động." />
        ) : (
          <ol className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm break-words text-slate-900">{item.summary}</p>
                <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500">
                  <span className="break-words">{item.actorDisplayName}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={item.createdAt}>{formatDateTimeVi(item.createdAt)}</time>
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {nextCursor !== null && (
        <div className="mt-3">
          <button type="button" className={`${BUTTON_CLASS} w-full`} disabled={loadingMore || refreshing} onClick={onLoadMore}>
            {loadingMore ? "Đang tải..." : "Xem thêm"}
          </button>
        </div>
      )}
      {refreshing && <p className="mt-2 text-xs text-slate-500">Đang tải lại...</p>}
      {loadMoreError && <p className="mt-2 text-xs text-red-600">{loadMoreError}</p>}
    </section>
  );
}

/** Older pages appended after `base` (the first page they continue from). */
interface OlderPages {
  base: ProjectActivityPage;
  items: ProjectActivityRecord[];
  nextCursor: string | null;
}

export function ActivityTab({ project }: { project: ProjectSummary }) {
  const { data, loading, error, reload } = useAdminQuery(() => fetchProjectActivity(project.id), [project.id]);
  const [older, setOlder] = useState<OlderPages | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const pending = useRef(false);

  if (!data && loading) return <LoadingState label="Đang tải lịch sử..." />;
  if (!data) return <ErrorState message={error ?? "Không thể tải lịch sử"} onRetry={reload} />;

  // A reload yields a new first page; older pages from before it are dropped.
  const appended = older !== null && older.base === data ? older : null;
  const items = appended ? [...data.items, ...appended.items] : data.items;
  const nextCursor = appended ? appended.nextCursor : data.nextCursor;

  async function loadMore(base: ProjectActivityPage, cursor: string) {
    if (pending.current) return;
    pending.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await fetchProjectActivity(project.id, cursor);
      setOlder({ base, items: [...(appended?.items ?? []), ...page.items], nextCursor: page.nextCursor });
    } catch (err) {
      setLoadMoreError(actionError(err));
    } finally {
      pending.current = false;
      setLoadingMore(false);
    }
  }

  return (
    <>
      {error && <ErrorState message={error} onRetry={reload} />}
      <ActivityTabView
        items={items}
        nextCursor={nextCursor}
        loadingMore={loadingMore}
        loadMoreError={loadMoreError}
        refreshing={loading}
        onLoadMore={() => {
          if (nextCursor !== null) void loadMore(data, nextCursor);
        }}
        onReload={() => {
          setLoadMoreError(null);
          reload();
        }}
      />
    </>
  );
}
