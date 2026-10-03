import { INVITATION_VARIANTS, type InvitationVariant } from "../../domain";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { InvitationPublishGateway } from "./invitation-publish-gateway";
import type { PublishInvitationCommand, PublishedInvitationVersion } from "./invitation-publish-types";

export interface PublishInvitationDependencies<TClient> {
  publications: Pick<InvitationPublishGateway<TClient>, "publishInvitation">;
}

const COMMAND_KEYS: ReadonlySet<string> = new Set(["variant", "expectedCurrentReviewVersionId", "expectedPublishedVersionId"]);

/**
 * Strict allow-list parse: any other key (a Snapshot, renderer key,
 * template version, version number, media list, status target, …) is
 * rejected, so the browser can never supply an authoritative value — not
 * even one the server would ignore.
 */
export function parsePublishInvitationCommand(raw: unknown): PublishInvitationCommand {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }
  for (const key of Object.keys(raw)) {
    if (!COMMAND_KEYS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unexpected field: ${key}`);
    }
  }
  const { variant, expectedCurrentReviewVersionId, expectedPublishedVersionId } = raw as Record<string, unknown>;
  if (typeof variant !== "string" || !(INVITATION_VARIANTS as readonly string[]).includes(variant)) {
    throw new ApiError("BAD_REQUEST", "variant must be COMMON, GROOM or BRIDE");
  }
  if (typeof expectedCurrentReviewVersionId !== "string" || !isValidUuid(expectedCurrentReviewVersionId)) {
    throw new ApiError("BAD_REQUEST", "expectedCurrentReviewVersionId must be a UUID");
  }
  if (
    expectedPublishedVersionId !== null &&
    (typeof expectedPublishedVersionId !== "string" || !isValidUuid(expectedPublishedVersionId))
  ) {
    throw new ApiError("BAD_REQUEST", "expectedPublishedVersionId must be a UUID or null");
  }
  return { variant: variant as InvitationVariant, expectedCurrentReviewVersionId, expectedPublishedVersionId };
}

/**
 * Task 031 — publish one required variant: strict command parse →
 * `publish_invitation` (migration 0038; atomic: lifecycle/payment check,
 * exact approved current REVIEW, compare-and-set on both pointers,
 * copy-on-publish of that REVIEW's payload/binding/media pins, pointer
 * advance, aggregate PUBLISHED status, audit).
 *
 * Nothing is built here: no draft load, no Snapshot, no media extraction.
 * The approved REVIEW row is the only publication source, read inside the
 * database transaction. The result is re-checked against the command.
 */
export async function publishInvitation<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  deps: PublishInvitationDependencies<TClient>,
): Promise<PublishedInvitationVersion> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  const command = parsePublishInvitationCommand(rawBody);

  const published = await deps.publications.publishInvitation(staff.supabase, { projectId: rawProjectId, ...command });

  if (
    published.projectId !== rawProjectId ||
    published.variant !== command.variant ||
    published.sourceReviewVersionId !== command.expectedCurrentReviewVersionId ||
    published.previousPublishedVersionId !== command.expectedPublishedVersionId
  ) {
    throw new Error("Published version does not match the request");
  }
  return published;
}
