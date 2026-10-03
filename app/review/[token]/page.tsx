import { createCustomerReviewPageDependencies } from "../../../lib/server/customer-review/customer-review-supabase";
import type { CustomerReviewView } from "../../../lib/server/customer-review/customer-review-types";
import { loadCustomerReview } from "../../../lib/server/customer-review/load-customer-review";
import { CustomerReviewFeedback } from "./customer-review-feedback";
import { CUSTOMER_REVIEW_METADATA, REVIEW_NOT_READY, VARIANT_LABELS, reviewErrorMessage, selectReviewedVariant } from "./review-shared";

export const metadata = CUSTOMER_REVIEW_METADATA;

/** Review chrome height; the invitation frame takes the rest of the viewport. */
const REVIEW_HEADER_HEIGHT = "3rem";

/**
 * Customer REVIEW shell (Task 030B). NOT the public invitation route: the
 * opaque REVIEW token in the path is resolved server-side (Task 026) and
 * only the persisted, immutable CURRENT REVIEW Snapshot of each required
 * variant is used — never the mutable draft. The invitation itself renders
 * in an isolated same-origin iframe (`./frame`), so the review chrome and
 * the template's fixed/100svh elements never share a viewport. RSVP is
 * visual-only there (UNAVAILABLE). No guest personalization, no sharing
 * metadata, noindex.
 */
export default async function CustomerReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ v?: string | string[] }>;
}) {
  const { token } = await params;
  const { v } = await searchParams;

  let view: CustomerReviewView;
  try {
    view = await loadCustomerReview(token, createCustomerReviewPageDependencies());
  } catch (error) {
    return reviewErrorMessage(error, "[CustomerReviewPage] Unexpected error");
  }

  const selected = selectReviewedVariant(view, v);
  if (selected === null) {
    return REVIEW_NOT_READY;
  }
  const { review } = selected;
  const encodedToken = encodeURIComponent(token);
  const frameSrc = `/review/${encodedToken}/frame?v=${selected.variant}&version=${encodeURIComponent(review.id)}`;

  return (
    <main className="min-h-svh bg-stone-50">
      <header
        className="flex items-center border-b border-stone-200 bg-white px-4"
        style={{ height: REVIEW_HEADER_HEIGHT }}
        data-review-chrome
      >
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-2">
          <p className="truncate text-xs text-stone-600">
            Bản duyệt #{review.versionNumber} · {VARIANT_LABELS[selected.variant]}
          </p>
          <nav className="flex shrink-0 gap-1" aria-label="Chọn thiệp">
            {view.variants.length > 1 &&
              view.variants.map((row) =>
                row.review === null ? (
                  <span key={row.variant} className="rounded-full px-3 py-1 text-xs text-stone-400">
                    {VARIANT_LABELS[row.variant]} (chưa có)
                  </span>
                ) : (
                  <a
                    key={row.variant}
                    href={`/review/${encodedToken}?v=${row.variant}`}
                    aria-current={row.variant === selected.variant ? "page" : undefined}
                    className={`rounded-full px-3 py-1 text-xs ${row.variant === selected.variant ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700"}`}
                  >
                    {VARIANT_LABELS[row.variant]}
                  </a>
                ),
              )}
            <a href="#review-feedback" className="rounded-full bg-emerald-700 px-3 py-1 text-xs text-white">
              Phản hồi
            </a>
          </nav>
        </div>
      </header>

      {/* Isolated invitation viewport: template fixed/100svh elements resolve inside the frame only. */}
      <iframe
        key={review.id}
        src={frameSrc}
        title={`Bản duyệt #${review.versionNumber} — ${VARIANT_LABELS[selected.variant]}`}
        data-review-frame
        className="block w-full border-0 bg-white"
        style={{ height: `calc(100svh - ${REVIEW_HEADER_HEIGHT})` }}
      />

      <CustomerReviewFeedback
        key={selected.variant}
        token={token}
        versionId={review.id}
        versionNumber={review.versionNumber}
        state={review.state}
        feedbackOpen={view.feedbackOpen}
        feedback={review.feedback}
      />
    </main>
  );
}
