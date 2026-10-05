import type { Metadata } from "next";

import type { InvitationViewModel } from "../../invitation-rendering/invitation-view-model-types";
import type { SignedSocialShareCover } from "./public-social-share-types";

/**
 * Task 032B — Open Graph metadata for the public /i/[slug] page (docs/
 * DECISIONS.md "Task 032B — Open Graph + Social Share Cover";
 * docs/API_CONTRACT.md §21). Pure: builds Next.js `Metadata` from
 *
 *   - the PUBLISHED invitation's ViewModel (couple names in the canonical
 *     variant order `people.primary` → `people.secondary`; never the mutable
 *     draft), and
 *   - the current effective SOCIAL_SHARE_COVER, already signed for this
 *     request, or `null`.
 *
 * No cover → no `og:image` (never a COVER fallback). Unknown / unpublished /
 * failed invitation → the generic title only, no project data. Robots stay
 * `noindex, nofollow` in every case. No `og:url`: the repository has no
 * trusted public site-URL configuration, and request headers are not trusted.
 */

export const PUBLIC_INVITATION_ROBOTS = { index: false, follow: false } as const;

/** The pre-032B fixed title, kept for not-found / failure responses. */
export const PUBLIC_INVITATION_GENERIC_TITLE = "Thiệp cưới — WeddingClick";

/** Short stable generic description (no canonical description field exists in the Snapshot). */
export const PUBLIC_INVITATION_DESCRIPTION = "Trân trọng kính mời bạn đến chung vui cùng chúng tôi.";

export function buildPublicInvitationMetadata(
  viewModel: InvitationViewModel | null,
  cover: SignedSocialShareCover | null,
): Metadata {
  if (viewModel === null) {
    return { title: PUBLIC_INVITATION_GENERIC_TITLE, robots: { ...PUBLIC_INVITATION_ROBOTS } };
  }

  const title = `${viewModel.people.primary.name} & ${viewModel.people.secondary.name} — Thiệp cưới`;
  const image =
    cover === null
      ? null
      : {
          url: cover.url,
          ...(cover.width !== null ? { width: cover.width } : {}),
          ...(cover.height !== null ? { height: cover.height } : {}),
          alt: cover.altText ?? title,
        };

  return {
    title,
    description: PUBLIC_INVITATION_DESCRIPTION,
    robots: { ...PUBLIC_INVITATION_ROBOTS },
    openGraph: {
      type: "website",
      locale: "vi_VN",
      title,
      description: PUBLIC_INVITATION_DESCRIPTION,
      ...(image !== null ? { images: [image] } : {}),
    },
  };
}
