import { StaffPreviewRenderer } from "../../../admin/preview-frame/staff-preview-renderer";
import { createCustomerReviewPageDependencies } from "../../../../lib/server/customer-review/customer-review-supabase";
import type { CustomerReviewView } from "../../../../lib/server/customer-review/customer-review-types";
import { loadCustomerReview } from "../../../../lib/server/customer-review/load-customer-review";
import { CUSTOMER_REVIEW_METADATA, REVIEW_NOT_READY, ReviewMessage, reviewErrorMessage, selectReviewedVariant } from "../review-shared";

export const metadata = CUSTOMER_REVIEW_METADATA;

/**
 * Isolated invitation viewport for the customer REVIEW page (Task 030B).
 * The shell embeds this same-origin document in an iframe — the Staff
 * Preview isolation pattern — so the template's 100svh, `position: fixed`
 * music control and decor resolve against the frame, never the review
 * chrome. It resolves the same opaque REVIEW token server-side and renders
 * ONLY the persisted, immutable CURRENT REVIEW Snapshot (never the draft).
 *
 * RSVP is visual-only: the reused UNAVAILABLE-only preview wrapper renders
 * the section, every submit resolves UNAVAILABLE, nothing is sent or stored,
 * and there is no guest identity.
 *
 * `?version=` is a consistency check against the version the shell shows
 * (so feedback always targets what is displayed), never authorization.
 */
export default async function CustomerReviewFramePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ v?: string | string[]; version?: string | string[] }>;
}) {
  const { token } = await params;
  const { v, version } = await searchParams;

  let view: CustomerReviewView;
  try {
    view = await loadCustomerReview(token, createCustomerReviewPageDependencies());
  } catch (error) {
    return reviewErrorMessage(error, "[CustomerReviewFramePage] Unexpected error");
  }

  const selected = selectReviewedVariant(view, v);
  if (selected === null) {
    return REVIEW_NOT_READY;
  }
  if (typeof version === "string" && version !== selected.review.id) {
    return <ReviewMessage title="Bản duyệt đã được cập nhật" text="Vui lòng tải lại trang để xem bản duyệt mới nhất." />;
  }
  const { review } = selected;
  return <StaffPreviewRenderer rendererKey={review.rendererKey} viewModel={review.viewModel} sections={review.sections} />;
}
