"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { DressCodeEditor } from "./dress-code-editor";
import { FamilyEditor } from "./family-editor";
import { GiftContentEditor } from "./gift-content-editor";
import { MediaEditor } from "./media-editor";
import { TimelineEditor } from "./timeline-editor";

/**
 * Optional invitation content (draft only — never publishes). Each section of
 * the invitation appears only when the frozen Snapshot builder finds real
 * data for it; there is no manual "show section" switch here.
 */
export function OptionalInvitationContent({ projectId }: { projectId: string }) {
  const [savedAny, setSavedAny] = useState(false);
  const onSaved = useCallback(() => setSavedAny(true), []);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Nội dung tuỳ chọn cho thiệp</h3>
          <p className="mt-1 text-xs text-slate-500">
            Mỗi phần của thiệp chỉ hiển thị khi có dữ liệu thật. Đây là bản nháp — chưa xuất bản.
          </p>
        </div>
        {savedAny && (
          <Link
            href={`/admin/v2/projects/${encodeURIComponent(projectId)}/preview`}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Xem trước thiệp
          </Link>
        )}
      </div>

      <h4 className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-400">Ảnh & âm thanh</h4>
      <div className="mt-2">
        <MediaEditor projectId={projectId} onSaved={onSaved} />
      </div>

      <h4 className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-400">Nội dung</h4>
      <div className="mt-2 space-y-3">
        <FamilyEditor projectId={projectId} onSaved={onSaved} />
        <TimelineEditor projectId={projectId} onSaved={onSaved} />
        <DressCodeEditor projectId={projectId} onSaved={onSaved} />
        <GiftContentEditor projectId={projectId} onSaved={onSaved} />
      </div>
    </section>
  );
}
