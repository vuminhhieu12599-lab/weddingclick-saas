import type { Metadata } from "next";

/**
 * Task 035B — Legacy V1 is retired (docs/SECURITY.md §11.2). Public V1
 * invitation surfaces render this fixed state instead of reading the V1
 * tables, which migration 0043 closes to anon/authenticated. It shows no
 * id, data, database detail or security rationale. V2 (`/i/[slug]`) is the
 * canonical public invitation.
 */
export const LEGACY_V1_UNAVAILABLE_MESSAGE = "Phiên bản thiệp này không còn được hỗ trợ.";

export const LEGACY_V1_METADATA: Metadata = {
  title: "WeddingClick",
  robots: { index: false, follow: false },
};

export function LegacyV1Unavailable() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-base font-semibold text-stone-900">{LEGACY_V1_UNAVAILABLE_MESSAGE}</h1>
        <p className="mt-2 text-sm text-stone-600">Vui lòng liên hệ WeddingClick để được hỗ trợ.</p>
      </div>
    </main>
  );
}
