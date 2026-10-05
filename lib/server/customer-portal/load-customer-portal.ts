import { INVITATION_VARIANTS } from "../../domain";
import { buildInvitationViewModel } from "../../invitation-rendering/build-invitation-view-model";
import { deriveEventDateTimePresentationV1 } from "../../invitation-rendering/event-date-time-presentation";
import type { MediaResolver } from "../../invitation-rendering/invitation-view-model-types";
import { resolveSnapshotMedia } from "../../invitation-rendering/resolve-snapshot-media";
import { resolveAccessLink } from "../access-links/resolve-access-link";
import { assertStoredReviewSnapshot } from "../invitation-review/assert-stored-review-snapshot";
import type { AccessLinkResolutionRepository } from "../supabase/access-link-resolution-repository";
import type { CustomerPortalGateway, CustomerPortalInvitationCard, CustomerPortalView } from "./customer-portal-types";

export interface LoadCustomerPortalDependencies {
  resolution: AccessLinkResolutionRepository;
  portal: CustomerPortalGateway;
  now?: () => Date;
}

/** The portal shows text only: every media reference stays unresolved (nothing is signed). */
const NO_MEDIA_RESOLVER: MediaResolver = {
  async resolveMedia(mediaId: string) {
    return { status: "UNAVAILABLE", mediaId };
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Task 033C — private Customer Portal (docs/DECISIONS.md "Task 033C";
 * docs/API_CONTRACT.md §23). The customer never logs in: possession of the
 * Project's PORTAL access link is the authorization.
 *
 *   raw token → Task 026 `resolveAccessLink` with expectedLinkType PORTAL
 *     (malformed/unknown/REVIEW/INTAKE → NOT_FOUND; revoked/expired → 410;
 *     last_used_at on success) → exactly one projectId
 *   → Project-scoped read of its invitations whose `published_version_id`
 *     is set, and exactly those versions
 *   → integrity gate per pointer (PUBLISHED, same invitation, same Project,
 *     stored Snapshot binding + Project code), fail closed
 *   → read-only summary from the immutable PUBLISHED Snapshot.
 *
 * `NOT_READY` when the Project has no published invitation. Never reads the
 * mutable draft, RSVPs, guests or media; signs nothing; writes nothing
 * except the canonical `last_used_at` of the resolver.
 */
export async function loadCustomerPortal(rawToken: string, deps: LoadCustomerPortalDependencies): Promise<CustomerPortalView> {
  const context = await resolveAccessLink({ rawToken, expectedLinkType: "PORTAL" }, deps.resolution, deps.now);

  const record = await deps.portal.getPortalProject(context.projectId);
  if (record.projectCode === null) {
    throw new Error("Portal Project could not be loaded");
  }

  const versions = new Map(record.versions.map((row) => [row.id, row]));
  const invitations: CustomerPortalInvitationCard[] = [];
  for (const variant of INVITATION_VARIANTS) {
    const invitation = record.invitations.find((row) => row.variant === variant);
    if (invitation === undefined) continue;

    const version = versions.get(invitation.publishedVersionId);
    if (
      version === undefined ||
      version.versionType !== "PUBLISHED" ||
      version.invitationId !== invitation.id ||
      version.projectId !== context.projectId
    ) {
      throw new Error("Published version pointer integrity fault");
    }

    const snapshot = assertStoredReviewSnapshot({
      variant,
      templateVersionId: version.templateVersionId,
      rendererKey: version.rendererKey,
      payload: version.payload,
    });
    const payloadProject: unknown = (version.payload as Record<string, unknown>).project;
    if (!isRecord(payloadProject) || payloadProject.code !== record.projectCode) {
      throw new Error("Stored published Snapshot belongs to a different Project");
    }

    const viewModel = buildInvitationViewModel({ snapshot, mediaResolutions: await resolveSnapshotMedia(snapshot, NO_MEDIA_RESOLVER) });
    invitations.push({
      variant,
      invitationPath: `/i/${invitation.publicSlug}`,
      primaryName: viewModel.people.primary.name,
      secondaryName: viewModel.people.secondary.name,
      ceremonyTitle: viewModel.ceremony.title,
      ceremonyDate: deriveEventDateTimePresentationV1(viewModel.ceremony),
    });
  }

  if (invitations.length === 0) {
    return { status: "NOT_READY" };
  }
  return { status: "READY", invitations, personalizedGuestEntitled: record.personalizedGuestEntitled };
}
