import type { Metadata } from "next";

import type { InvitationVariant } from "../../../lib/domain";
import type { CustomerReviewVariantView, CustomerReviewView } from "../../../lib/server/customer-review/customer-review-types";
import { ApiError } from "../../../lib/server/errors/api-error";

/** Shared by the customer REVIEW shell and its isolated invitation frame (Task 030B). */
export const CUSTOMER_REVIEW_METADATA: Metadata = {
  title: "Duyệt thiệp — WeddingClick",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const VARIANT_LABELS: Readonly<Record<InvitationVariant, string>> = {
  COMMON: "Thiệp chung",
  GROOM: "Thiệp nhà trai",
  BRIDE: "Thiệp nhà gái",
};

export function ReviewMessage({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-base font-semibold text-stone-900">{title}</h1>
        <p className="mt-2 text-sm text-stone-600">{text}</p>
      </div>
    </main>
  );
}

/** Fixed, safe Vietnamese states — no token, Project or DB detail is ever echoed. */
export function reviewErrorMessage(error: unknown, logLabel: string) {
  if (error instanceof ApiError && (error.kind === "REVOKED_TOKEN" || error.kind === "EXPIRED_TOKEN")) {
    return <ReviewMessage title="Link duyệt đã hết hiệu lực" text="Vui lòng liên hệ WeddingClick để nhận link duyệt mới." />;
  }
  if (error instanceof ApiError && error.kind === "NOT_FOUND") {
    return <ReviewMessage title="Không tìm thấy bản duyệt" text="Link duyệt không hợp lệ. Vui lòng kiểm tra lại link WeddingClick đã gửi." />;
  }
  console.error(logLabel);
  return <ReviewMessage title="Chưa thể hiển thị bản duyệt" text="Vui lòng thử lại sau ít phút." />;
}

export const REVIEW_NOT_READY = <ReviewMessage title="Bản duyệt chưa sẵn sàng" text="WeddingClick đang chuẩn bị bản duyệt. Vui lòng quay lại sau." />;

/** Display selection only (`?v=`), never authorization: the requested variant if it has a review, else the first reviewed one. */
export function selectReviewedVariant(
  view: CustomerReviewView,
  requested: string | string[] | undefined,
): (CustomerReviewVariantView & { review: NonNullable<CustomerReviewVariantView["review"]> }) | null {
  if (!view.hasVariantPolicy) return null;
  const reviewed = view.variants.filter(
    (row): row is CustomerReviewVariantView & { review: NonNullable<CustomerReviewVariantView["review"]> } => row.review !== null,
  );
  return reviewed.find((row) => row.variant === requested) ?? reviewed[0] ?? null;
}
