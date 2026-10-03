import { reviewVersionStateOf } from "../../domain";
import { buildInvitationViewModel } from "../../invitation-rendering/build-invitation-view-model";
import { extractSnapshotMediaRefs } from "../../invitation-rendering/extract-snapshot-media-refs";
import type { MediaResolution, MediaResolver } from "../../invitation-rendering/invitation-view-model-types";
import type { RendererCompatibilityRegistry } from "../../invitation-rendering/renderer-registry";
import { selectRendererCompatibility } from "../../invitation-rendering/renderer-selection";
import { resolveSnapshotMedia } from "../../invitation-rendering/resolve-snapshot-media";
import { resolveAccessLink } from "../access-links/resolve-access-link";
import { assertStoredReviewSnapshot } from "../invitation-review/assert-stored-review-snapshot";
import { PROJECT_MEDIA_BUCKET } from "../media/media-constants";
import type { AccessLinkResolutionRepository } from "../supabase/access-link-resolution-repository";
import type { CustomerReviewGateway, CustomerReviewMediaSigner } from "./customer-review-gateway";
import type { CustomerReviewVariantView, CustomerReviewVersionRecord, CustomerReviewView } from "./customer-review-types";

export interface LoadCustomerReviewDependencies {
  resolution: AccessLinkResolutionRepository;
  reviews: Pick<CustomerReviewGateway, "getCustomerReview">;
  signMedia: CustomerReviewMediaSigner;
  rendererRegistry: RendererCompatibilityRegistry;
  now?: () => Date;
}

/**
 * Per-version resolver over ONLY that version's pinned media: a Snapshot ref
 * that is not pinned to this exact version, lives outside the approved
 * bucket, or could not be signed is UNAVAILABLE — never looked up elsewhere.
 */
function pinnedMediaResolver(review: CustomerReviewVersionRecord, urls: ReadonlyMap<string, string>, refs: readonly string[]): MediaResolver {
  const pinned = new Map(review.media.map((row) => [row.id, row]));
  const results = new Map<string, MediaResolution>();
  for (const mediaId of refs) {
    const row = pinned.get(mediaId);
    const url = urls.get(mediaId);
    results.set(
      mediaId,
      row !== undefined && row.storageBucket === PROJECT_MEDIA_BUCKET && url !== undefined
        ? { status: "RESOLVED", mediaId, url, width: row.width, height: row.height }
        : { status: "UNAVAILABLE", mediaId },
    );
  }
  return {
    async resolveMedia(mediaId: string): Promise<MediaResolution> {
      const result = results.get(mediaId);
      if (result === undefined) {
        throw new Error("Media resolver was asked for an id outside its preloaded set");
      }
      return result;
    },
  };
}

/**
 * Customer REVIEW page use case (Task 030B, Path B):
 *
 *   raw REVIEW token → Task 026 `resolveAccessLink` (404 / 410, last_used_at)
 *   → `get_customer_review` (service_role RPC; re-validates the link and
 *     returns only the required variants' CURRENT REVIEW versions + the
 *     media pinned to exactly those versions)
 *   → integrity gate on each persisted Snapshot (never the mutable draft)
 *   → CUSTOMER REVIEW MEDIA SIGNING ONLY for those pinned references
 *   → ViewModel + exact pinned renderer (fail closed, no fallback).
 *
 * Nothing is privileged-read before the token validates. Signed URLs exist
 * only in the returned ViewModels and are never persisted.
 */
export async function loadCustomerReview(rawToken: string, deps: LoadCustomerReviewDependencies): Promise<CustomerReviewView> {
  const context = await resolveAccessLink({ rawToken, expectedLinkType: "REVIEW" }, deps.resolution, deps.now);

  const record = await deps.reviews.getCustomerReview({ projectId: context.projectId, accessLinkId: context.accessLinkId });
  if (record.projectId !== context.projectId) {
    throw new Error("Customer review belongs to a different Project");
  }

  const prepared = record.variants.map(({ variant, review }) => {
    if (review === null) {
      return { variant, review, snapshot: null, refs: [] as string[] };
    }
    const snapshot = assertStoredReviewSnapshot({
      variant,
      templateVersionId: review.templateVersionId,
      rendererKey: review.rendererKey,
      payload: review.payload,
    });
    return { variant, review, snapshot, refs: extractSnapshotMediaRefs(snapshot) };
  });

  // Sign only pinned rows that the persisted Snapshot actually references.
  const toSign = new Map<string, string>();
  for (const { review, refs } of prepared) {
    if (review === null) continue;
    const wanted = new Set(refs);
    for (const row of review.media) {
      if (wanted.has(row.id) && row.storageBucket === PROJECT_MEDIA_BUCKET) {
        toSign.set(row.id, row.storagePath);
      }
    }
  }
  const urls =
    toSign.size === 0
      ? new Map<string, string>()
      : await deps.signMedia([...toSign].map(([id, storagePath]) => ({ id, storagePath })));

  const variants: CustomerReviewVariantView[] = [];
  for (const { variant, review, snapshot, refs } of prepared) {
    if (review === null || snapshot === null) {
      variants.push({ variant, review: null });
      continue;
    }
    const mediaResolutions = await resolveSnapshotMedia(snapshot, pinnedMediaResolver(review, urls, refs));
    const viewModel = buildInvitationViewModel({ snapshot, mediaResolutions });
    const selection = selectRendererCompatibility({ snapshot, viewModel, registry: deps.rendererRegistry });
    variants.push({
      variant,
      review: {
        id: review.id,
        versionNumber: review.versionNumber,
        createdAt: review.createdAt,
        state: reviewVersionStateOf(review.feedback.map((item) => item.feedbackType)),
        feedback: review.feedback,
        rendererKey: selection.rendererKey,
        viewModel,
        sections: selection.effectiveSections,
      },
    });
  }

  return {
    projectStatus: record.projectStatus,
    hasVariantPolicy: record.hasVariantPolicy,
    feedbackOpen: record.feedbackOpen,
    variants,
  };
}
