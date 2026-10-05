import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { loadPublicInvitation } from "../../../lib/server/public-invitation/load-public-invitation";
import { buildPublicInvitationMetadata } from "../../../lib/server/public-invitation/public-invitation-metadata";
import { createPublicInvitationPageDependencies } from "../../../lib/server/public-invitation/public-invitation-supabase";
import { createPublicSocialShareCoverGateway } from "../../../lib/server/public-invitation/public-social-share-supabase";
import type { SignedSocialShareCover } from "../../../lib/server/public-invitation/public-social-share-types";
import type { PublicInvitationView } from "../../../lib/server/public-invitation/public-invitation-types";
import { PublicInvitationRenderer } from "./public-invitation-renderer";

/**
 * Every request re-resolves the slug's CURRENT `published_version_id` (so a
 * later republish moves the slug) and signs fresh runtime media URLs. No
 * full-route or data cache holds an obsolete publication pointer.
 */
export const dynamic = "force-dynamic";

/**
 * One PUBLISHED read per request, shared by `generateMetadata` and the page
 * (React request memoization); the Task 032A use case itself is unchanged.
 */
const loadPublishedInvitation = cache((slug: string) => loadPublicInvitation(slug, createPublicInvitationPageDependencies()));

/**
 * Task 032B social metadata, resolved per request (force-dynamic). Couple
 * names come from the PUBLISHED Snapshot's ViewModel; `og:image` is the
 * Project's CURRENT effective SOCIAL_SHARE_COVER, signed at request time,
 * and is omitted when none is chosen (never a COVER fallback). Unknown,
 * unpublished or failing invitations expose only the generic title. Always
 * `noindex`.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  let view: PublicInvitationView | null;
  try {
    view = await loadPublishedInvitation(slug);
  } catch {
    view = null;
  }
  if (view === null) {
    return buildPublicInvitationMetadata(null, null);
  }

  let cover: SignedSocialShareCover | null = null;
  try {
    cover = await createPublicSocialShareCoverGateway().getSignedSocialShareCover(slug);
  } catch {
    console.error("[PublicInvitationPage] Failed to resolve social share cover");
  }
  return buildPublicInvitationMetadata(view.viewModel, cover);
}

function PublicInvitationUnavailable() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-base font-semibold text-stone-900">Chưa thể hiển thị thiệp</h1>
        <p className="mt-2 text-sm text-stone-600">Vui lòng thử lại sau ít phút.</p>
      </div>
    </main>
  );
}

/**
 * Public published invitation (Task 032A). The slug is the only locator:
 * it is resolved server-side to the invitation's exact current PUBLISHED
 * version (never REVIEW, never the mutable draft), whose persisted Snapshot
 * renders through its pinned renderer key in the production host core. The
 * client wrapper supplies the real public RSVP capability (Task 033A), bound
 * only to this slug; the server re-derives the PUBLISHED binding on every
 * submission. No query parameter selects a
 * variant, version or renderer. Unknown or unpublished slug → not-found;
 * any integrity, renderer or media-signing fault → a fixed safe message
 * (no slug, id or database detail is echoed or logged).
 */
export default async function PublicInvitationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let view: PublicInvitationView | null;
  try {
    view = await loadPublishedInvitation(slug);
  } catch {
    console.error("[PublicInvitationPage] Failed to render published invitation");
    return <PublicInvitationUnavailable />;
  }
  if (view === null) {
    notFound();
  }

  return (
    <PublicInvitationRenderer
      publicSlug={slug}
      rendererKey={view.rendererKey}
      viewModel={view.viewModel}
      sections={view.sections}
    />
  );
}
