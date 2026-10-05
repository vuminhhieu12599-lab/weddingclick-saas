"use client";

import { useState } from "react";

/**
 * Copies one PUBLIC invitation URL (`/i/<slug>`, never a credential). The
 * absolute URL is built from the current origin in the browser — no
 * SITE_URL configuration exists.
 */
export function PortalLinkCopy({ path }: { path: string }) {
  const [state, setState] = useState<"IDLE" | "COPIED" | "FAILED">("IDLE");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setState("COPIED");
    } catch {
      setState("FAILED");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
      >
        Sao chép link
      </button>
      <span className="text-xs text-stone-500" role="status">
        {state === "COPIED" ? "Đã sao chép" : state === "FAILED" ? "Không sao chép được — hãy mở thiệp và sao chép từ thanh địa chỉ" : ""}
      </span>
    </div>
  );
}
