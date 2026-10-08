"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { contentEditorsFor, legacyMediaRolesFor } from "../../../../../../lib/admin/template-editor-presentation";
import type { TemplateEditorManifestV1 } from "../../../../../../templates/core/editor-manifest";
import { DressCodeEditor } from "./dress-code-editor";
import { FamilyEditor } from "./family-editor";
import { GiftContentEditor } from "./gift-content-editor";
import { MediaEditor } from "./media-editor";
import { TemplateMediaSlotEditor } from "./template-media-slot-editor";
import { TimelineEditor } from "./timeline-editor";

/**
 * Optional invitation content for the SELECTED template version (draft only
 * — never publishes). TE-05A: what is shown comes from that version's
 * TemplateEditorManifestV1. LEGACY_ROLES keeps the legacy media-role editor
 * unchanged; TEMPLATE_SLOTS shows the template media slots plus only the
 * semantic media (music when used, social share cover). Each section of the
 * invitation still appears only when the frozen Snapshot builder finds real
 * data for it; there is no manual "show section" switch here.
 */
export function OptionalInvitationContent({
  projectId,
  templateVersionId,
  manifest,
  onSaved: onSavedOuter,
}: {
  projectId: string;
  templateVersionId: string;
  manifest: TemplateEditorManifestV1;
  onSaved?: () => void;
}) {
  const [savedAny, setSavedAny] = useState(false);
  const onSaved = useCallback(() => {
    setSavedAny(true);
    onSavedOuter?.();
  }, [onSavedOuter]);
  const editors = contentEditorsFor(manifest);
  const roles = legacyMediaRolesFor(manifest);
  const usesSlots = manifest.mediaModel === "TEMPLATE_SLOTS";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" data-media-model={manifest.mediaModel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Nội dung & ảnh của mẫu thiệp</h3>
          <p className="mt-1 text-xs text-slate-500">
            Chỉ hiển thị những phần mẫu này sử dụng. Mỗi phần của thiệp chỉ hiện khi có dữ liệu thật. Đây là bản nháp — chưa xuất bản.
          </p>
        </div>
        {savedAny && (
          <Link
            href={`/admin/v2/projects/${encodeURIComponent(projectId)}/preview`}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-emerald-700 sm:w-auto sm:py-2"
          >
            Xem trước thiệp
          </Link>
        )}
      </div>

      {usesSlots && (
        <>
          <h4 className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-400">Ảnh của mẫu thiệp</h4>
          <div className="mt-2">
            <TemplateMediaSlotEditor projectId={projectId} templateVersionId={templateVersionId} manifest={manifest} onSaved={onSaved} />
          </div>
        </>
      )}

      {roles.length > 0 && (
        <>
          <h4 className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-400">{usesSlots ? "Âm thanh & ảnh chia sẻ" : "Ảnh & âm thanh"}</h4>
          <div className="mt-2">
            <MediaEditor projectId={projectId} onSaved={onSaved} roles={roles} />
          </div>
        </>
      )}

      <h4 className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-400">Nội dung</h4>
      <div className="mt-2 space-y-3">
        {editors.families && <FamilyEditor projectId={projectId} onSaved={onSaved} />}
        {editors.timeline && <TimelineEditor projectId={projectId} onSaved={onSaved} />}
        {editors.dressCode && <DressCodeEditor projectId={projectId} onSaved={onSaved} />}
        {(editors.loveStory || editors.gift) && (
          <GiftContentEditor projectId={projectId} onSaved={onSaved} showLoveStory={editors.loveStory} showGift={editors.gift} />
        )}
      </div>
    </section>
  );
}
