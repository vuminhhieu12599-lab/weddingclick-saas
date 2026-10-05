import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadPersonalizedPublicInvitation } from "../../../../../lib/server/public-guest/load-personalized-public-invitation";
import { createPersonalizedPublicInvitationPageDependencies } from "../../../../../lib/server/public-guest/public-guest-supabase";
import {
  PUBLIC_INVITATION_GENERIC_TITLE,
  PUBLIC_INVITATION_ROBOTS,
} from "../../../../../lib/server/public-invitation/public-invitation-metadata";
import type { PublicInvitationView } from "../../../../../lib/server/public-invitation/public-invitation-types";
import { PublicInvitationRenderer } from "../../public-invitation-renderer";

/** Per request: the slug's CURRENT publication and the guest token are re-resolved every time. */
export const dynamic = "force-dynamic";

/**
 * Task 033B1 — personalized URLs carry a credential, so their metadata is
 * fixed and request-independent: the generic title, `noindex`, and
 * `no-referrer` so the token path is never sent to third-party hosts. No
 * Open Graph, no guest name, no token, no `og:url`/canonical. Task 032B's
 * /i/[slug] metadata is unchanged.
 */
export const metadata: Metadata = {
  title: PUBLIC_INVITATION_GENERIC_TITLE,
  robots: { ...PUBLIC_INVITATION_ROBOTS },
  referrer: "no-referrer",
};

function PersonalizedInvitationUnavailable() {
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
 * Personalized published invitation (Task 033B1). The raw token is the
 * credential: hashed server-side and resolved to one active guest of the
 * Project this slug currently publishes (same Project, permitted variant).
 * Any credential failure → not-found; it NEVER falls back to the generic
 * /i/[slug] invitation. The same frozen renderer receives the guest's
 * canonical display name; the RSVP capability carries the token so the
 * server binds the response to that guest. Nothing about the slug, token
 * or guest is logged.
 */
export default async function PersonalizedInvitationPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;

  let view: PublicInvitationView | null;
  try {
    view = await loadPersonalizedPublicInvitation(slug, token, createPersonalizedPublicInvitationPageDependencies());
  } catch {
    console.error("[PersonalizedInvitationPage] Failed to render personalized invitation");
    return <PersonalizedInvitationUnavailable />;
  }
  if (view === null) {
    notFound();
  }

  return (
    <PublicInvitationRenderer
      publicSlug={slug}
      guestToken={token}
      rendererKey={view.rendererKey}
      viewModel={view.viewModel}
      sections={view.sections}
    />
  );
}
