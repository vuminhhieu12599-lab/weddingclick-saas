"use client";

import { useMemo, useState } from "react";

import type { InvitationViewModel } from "../../../lib/invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../../lib/invitation-rendering/renderer-selection";
import {
  isValidRsvpSubmitInputV1,
  type RsvpCapabilityV1,
  type RsvpSubmitInputV1,
  type RsvpSubmitResultV1,
} from "../../../lib/invitation-rendering/rsvp-capability";
import { InvitationRendererHostCore } from "../../../templates/core/client/invitation-renderer-host-core";

/**
 * Public published invitation client wrapper (Task 033A; docs/DECISIONS.md
 * "Task 033A — Public RSVP Foundation", P25/P30, K15–K20). The only caller
 * that supplies a REAL RSVP capability, and only for /i/[slug]. Staff
 * Preview and Customer Review keep their UNAVAILABLE-only wrapper.
 *
 * The page (a Server Component) passes only serializable data plus the
 * public slug; the capability is built here, inside the client graph. It
 * POSTs exactly the four canonical response fields plus the slug to
 * /api/v2/public/rsvp. No token, guest id, Project/invitation/version id or
 * `?guest=` value is ever sent: the server derives the binding from the
 * slug's current PUBLISHED version. `SUCCESS` is resolved only for a 201
 * whose body confirms the row was recorded; anything else is INVALID,
 * UNAVAILABLE or FAILED (K17), never a fake success.
 *
 * Task 033B1: on the personalized route /i/[slug]/g/[token] the wrapper also
 * receives that route's raw guest token and sends it as `guestToken`; the
 * server hashes it and derives the guest identity from it alone. The token
 * is never put in the ViewModel, storage, logs or metadata. 410 (revoked
 * guest link) resolves UNAVAILABLE.
 *
 * RSVP-P0-03: on the GENERIC route this wrapper also mints one opaque
 * response key per mounted page and sends it as `responseKey`, so a guest
 * who presses "Sửa lại hồi âm" and submits again corrects that same stored
 * response instead of creating a duplicate (migration 0056). The key lives
 * only in this component's state — never a cookie, never
 * localStorage/sessionStorage, never a URL, never the ViewModel, never a
 * log — and it is stable for every submit and retry of this page, including
 * after a failed attempt. It is not identity and not authorization: the
 * server still derives Project, invitation and version from the slug's
 * current publication alone. A new visit, tab or device mints a new key and
 * is therefore an independent response, even for an identical typed name.
 * The personalized route never sends one: that flow is deduplicated by
 * guest identity (0018/0042) and must not gain a second, browser-held one.
 */

const PUBLIC_RSVP_ENDPOINT = "/api/v2/public/rsvp";

/** 32 CSPRNG bytes, unpadded base64url — the shape the server re-checks (43 characters). */
const RESPONSE_KEY_BYTE_LENGTH = 32;

/**
 * Mints one response key, or `null` when the Web Crypto CSPRNG is
 * unavailable. A missing key is not a failure: the request is then sent
 * exactly as before RSVP-P0-03 and persists as its own row, which is the old
 * duplicate-on-correction behaviour rather than a broken RSVP form. Nothing
 * weaker (`Math.random`, a timestamp, the typed name) is ever substituted.
 */
export function createGenericRsvpResponseKey(): string | null {
  const webCrypto = globalThis.crypto;
  if (webCrypto === undefined || typeof webCrypto.getRandomValues !== "function") return null;
  const bytes = webCrypto.getRandomValues(new Uint8Array(RESPONSE_KEY_BYTE_LENGTH));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const SUCCESS: RsvpSubmitResultV1 = Object.freeze({ status: "SUCCESS" });
const INVALID: RsvpSubmitResultV1 = Object.freeze({ status: "INVALID" });
const UNAVAILABLE: RsvpSubmitResultV1 = Object.freeze({ status: "UNAVAILABLE" });
const FAILED: RsvpSubmitResultV1 = Object.freeze({ status: "FAILED" });

async function isRecordedBody(response: Response): Promise<boolean> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return false;
    const data = (body as { data?: unknown }).data;
    return typeof data === "object" && data !== null && (data as { recorded?: unknown }).recorded === true;
  } catch {
    return false;
  }
}

export function createPublicRsvpCapability(
  publicSlug: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  guestToken?: string,
  /** RSVP-P0-03, generic route only: the mounted page's correction key. Ignored when a guest token is present. */
  responseKey?: string | null,
): RsvpCapabilityV1 {
  const keyed = guestToken === undefined && typeof responseKey === "string" && responseKey.length > 0;
  const capability: RsvpCapabilityV1 = {
    async submit(input: RsvpSubmitInputV1): Promise<RsvpSubmitResultV1> {
      if (!isValidRsvpSubmitInputV1(input)) return INVALID;
      let response: Response;
      try {
        response = await fetchImpl(PUBLIC_RSVP_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          cache: "no-store",
          body: JSON.stringify({
            publicSlug,
            ...(guestToken === undefined ? {} : { guestToken }),
            ...(keyed ? { responseKey } : {}),
            attendance: input.attendance,
            partySize: input.partySize,
            message: input.message,
            guestName: input.guestName,
          }),
        });
      } catch {
        return FAILED;
      }
      if (response.status === 201) return (await isRecordedBody(response)) ? SUCCESS : FAILED;
      if (response.status === 400) return INVALID;
      if (response.status === 404 || response.status === 410) return UNAVAILABLE;
      return FAILED;
    },
  };
  return Object.freeze(capability);
}

interface PublicInvitationRendererProps {
  readonly publicSlug: string;
  /** Personalized route only (Task 033B1). */
  readonly guestToken?: string;
  readonly rendererKey: string;
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
}

export function PublicInvitationRenderer({ publicSlug, guestToken, rendererKey, viewModel, sections }: PublicInvitationRendererProps) {
  // One key per mounted page, minted lazily and then never regenerated — a
  // re-render, a discarded memo or a second submit must reuse it, otherwise a
  // correction would insert a new row instead of updating its own.
  const [responseKey] = useState<string | null>(() => (guestToken === undefined ? createGenericRsvpResponseKey() : null));
  const rsvp = useMemo(
    () => createPublicRsvpCapability(publicSlug, undefined, guestToken, responseKey),
    [publicSlug, guestToken, responseKey],
  );
  return <InvitationRendererHostCore rendererKey={rendererKey} viewModel={viewModel} sections={sections} rsvp={rsvp} />;
}
