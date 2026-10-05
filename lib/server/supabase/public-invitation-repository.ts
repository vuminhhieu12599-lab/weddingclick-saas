import { INVITATION_VARIANTS, type InvitationVariant } from "../../domain";
import type {
  PinnedPublishedMedia,
  PublicInvitationGateway,
  PublicInvitationRecord,
  PublishedInvitationVersionRecord,
} from "../public-invitation/public-invitation-types";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";
import { createServiceRoleSupabaseClient } from "./service-role-client";

/**
 * Production, service_role-backed PublicInvitationGateway (Task 032A).
 * Exposes exactly one capability — the read-only `get_public_invitation`
 * RPC of migration 0039, which resolves a public slug to the exact current
 * PUBLISHED version and its pinned media only. No table access (`.from`),
 * no Storage access, no generic `.rpc()` passthrough. Deliberately isolated
 * from every other service_role module (including the media signer). A
 * fresh client per call; nothing cached at module scope. Any RPC error
 * (including the PI001 integrity fault) is a generic failure: no database
 * detail is surfaced.
 */

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && isValidUuid(value);
}

function isDimension(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value > 0);
}

function isVariant(value: unknown): value is InvitationVariant {
  return typeof value === "string" && (INVITATION_VARIANTS as readonly string[]).includes(value);
}

function toMedia(value: unknown): PinnedPublishedMedia {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    typeof value.storageBucket !== "string" ||
    typeof value.storagePath !== "string" ||
    value.storagePath.length === 0 ||
    !isDimension(value.width) ||
    !isDimension(value.height)
  ) {
    fail();
  }
  return { id: value.id, storageBucket: value.storageBucket, storagePath: value.storagePath, width: value.width, height: value.height };
}

function toPublishedVersion(value: unknown): PublishedInvitationVersionRecord {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    typeof value.versionNumber !== "number" ||
    !Number.isInteger(value.versionNumber) ||
    value.versionNumber < 1 ||
    !isUuid(value.templateVersionId) ||
    typeof value.rendererKey !== "string" ||
    value.rendererKey.length === 0 ||
    typeof value.publishedAt !== "string" ||
    !isValidTimestamptz(value.publishedAt) ||
    !Array.isArray(value.media)
  ) {
    fail();
  }
  return {
    id: value.id,
    versionNumber: value.versionNumber,
    templateVersionId: value.templateVersionId,
    rendererKey: value.rendererKey,
    publishedAt: value.publishedAt,
    payload: value.payload,
    media: value.media.map(toMedia),
  };
}

export function toPublicInvitationRecord(data: unknown): PublicInvitationRecord | null {
  if (data === null) {
    return null;
  }
  if (
    !isRecord(data) ||
    !isVariant(data.variant) ||
    typeof data.projectCode !== "string" ||
    data.projectCode.length === 0
  ) {
    fail();
  }
  return { variant: data.variant, projectCode: data.projectCode, publishedVersion: toPublishedVersion(data.publishedVersion) };
}

export function getServiceRolePublicInvitationGateway(): PublicInvitationGateway {
  return {
    async getPublicInvitation(publicSlug) {
      const client = createServiceRoleSupabaseClient();
      const { data, error } = await client.rpc("get_public_invitation", { p_public_slug: publicSlug });
      if (error) {
        throw new Error("Failed to load public invitation");
      }
      return toPublicInvitationRecord(data);
    },
  };
}
