"use client";

import { useMemo } from "react";

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
 */

const PUBLIC_RSVP_ENDPOINT = "/api/v2/public/rsvp";

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

export function createPublicRsvpCapability(publicSlug: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): RsvpCapabilityV1 {
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
      if (response.status === 404) return UNAVAILABLE;
      return FAILED;
    },
  };
  return Object.freeze(capability);
}

interface PublicInvitationRendererProps {
  readonly publicSlug: string;
  readonly rendererKey: string;
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
}

export function PublicInvitationRenderer({ publicSlug, rendererKey, viewModel, sections }: PublicInvitationRendererProps) {
  const rsvp = useMemo(() => createPublicRsvpCapability(publicSlug), [publicSlug]);
  return <InvitationRendererHostCore rendererKey={rendererKey} viewModel={viewModel} sections={sections} rsvp={rsvp} />;
}
