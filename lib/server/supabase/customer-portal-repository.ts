import { INVITATION_VARIANTS, RSVP_ATTENDANCE_STATUSES, SERVICE_ADDON_CODES, type InvitationVariant, type RsvpAttendanceStatus } from "../../domain";
import type {
  CustomerPortalGateway,
  PortalInvitationRecord,
  PortalProjectRecord,
  PortalPublishedVersionRecord,
  PortalRsvpRecord,
} from "../customer-portal/customer-portal-types";
import { isValidUuid } from "../validation/uuid";
import { createServiceRoleSupabaseClient } from "./service-role-client";

/**
 * Production, service_role-backed CustomerPortalGateway (Task 033C).
 * Read-only and Project-scoped: every query filters on the `projectId`
 * produced by PORTAL token resolution (never browser input). Exactly four
 * SELECTs over existing service_role SELECT grants (0005, 0006, 0012,
 * 0013): the Project code, its invitations with a published pointer, exactly
 * those versions, and the PERSONALIZED_GUEST add-on presence.
 *
 * Task 033D adds one read-only RSVP list SELECT over the existing 0018
 * service_role SELECT grant ("PORTAL R aggregate/list", PHYSICAL_DATABASE_PLAN
 * §15) with the canonical Guest relationship embedded through the
 * `rsvps.guest_id` FK — explicit columns only (no token, phone, note or id
 * leaves this module). No guest management, media, Storage, payment or
 * review access; no writes; no `.rpc()`. A fresh client per call. Nothing is
 * logged; errors carry no detail.
 */

const PERSONALIZED_GUEST_ADDON_CODE = SERVICE_ADDON_CODES[0];

function isVariant(value: unknown): value is InvitationVariant {
  return typeof value === "string" && (INVITATION_VARIANTS as readonly string[]).includes(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && isValidUuid(value);
}

function fail(): never {
  throw new Error("Failed to load customer portal");
}

export function toPortalInvitations(rows: unknown): PortalInvitationRecord[] {
  if (!Array.isArray(rows)) fail();
  return rows.map((row: unknown) => {
    if (typeof row !== "object" || row === null) fail();
    const r = row as Record<string, unknown>;
    if (!isUuid(r.id) || !isVariant(r.variant) || typeof r.public_slug !== "string" || r.public_slug.length === 0 || !isUuid(r.published_version_id)) {
      fail();
    }
    return { id: r.id, variant: r.variant, publicSlug: r.public_slug, publishedVersionId: r.published_version_id };
  });
}

export function toPortalVersions(rows: unknown): PortalPublishedVersionRecord[] {
  if (!Array.isArray(rows)) fail();
  return rows.map((row: unknown) => {
    if (typeof row !== "object" || row === null) fail();
    const r = row as Record<string, unknown>;
    if (
      !isUuid(r.id) ||
      !isUuid(r.invitation_id) ||
      !isUuid(r.project_id) ||
      typeof r.version_type !== "string" ||
      !isUuid(r.template_version_id) ||
      typeof r.renderer_key_snapshot !== "string"
    ) {
      fail();
    }
    return {
      id: r.id,
      invitationId: r.invitation_id,
      projectId: r.project_id,
      versionType: r.version_type,
      templateVersionId: r.template_version_id,
      rendererKey: r.renderer_key_snapshot,
      payload: r.payload,
    };
  });
}

function isAttendance(value: unknown): value is RsvpAttendanceStatus {
  return typeof value === "string" && (RSVP_ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/**
 * Guards and reduces RSVP rows read for `projectId`. A row of another
 * Project, or a personalized row whose embedded Guest is missing or belongs
 * to another Project, fails closed. `guest_id` / Guest `project_id` are
 * checked here and never leave this function.
 */
export function toPortalRsvps(rows: unknown, projectId: string): PortalRsvpRecord[] {
  if (!Array.isArray(rows)) fail();
  return rows.map((row: unknown): PortalRsvpRecord => {
    if (typeof row !== "object" || row === null) fail();
    const r = row as Record<string, unknown>;
    if (
      r.project_id !== projectId ||
      !(r.guest_id === null || isUuid(r.guest_id)) ||
      !isNullableText(r.guest_display_name_snapshot) ||
      !isAttendance(r.attendance) ||
      typeof r.party_size !== "number" ||
      !Number.isInteger(r.party_size) ||
      r.party_size < 0 ||
      !isNullableText(r.message) ||
      typeof r.created_at !== "string" ||
      typeof r.updated_at !== "string" ||
      Number.isNaN(Date.parse(r.updated_at))
    ) {
      fail();
    }

    let guest: PortalRsvpRecord["guest"] = null;
    if (r.guest_id !== null) {
      const g = r.guest as Record<string, unknown> | null;
      if (
        typeof g !== "object" ||
        g === null ||
        g.project_id !== projectId ||
        typeof g.display_name !== "string" ||
        !(g.invitation_variant === null || isVariant(g.invitation_variant))
      ) {
        fail();
      }
      guest = { displayName: g.display_name, invitationVariant: g.invitation_variant };
    } else if (r.guest_display_name_snapshot === null) {
      fail();
    }

    return {
      typedName: r.guest_display_name_snapshot,
      attendance: r.attendance,
      partySize: r.party_size,
      message: r.message,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      guest,
    };
  });
}

export function getServiceRoleCustomerPortalGateway(): CustomerPortalGateway {
  return {
    async getPortalProject(projectId): Promise<PortalProjectRecord> {
      if (!isValidUuid(projectId)) fail();
      const client = createServiceRoleSupabaseClient();

      const project = await client.from("projects").select("project_code").eq("id", projectId).maybeSingle();
      if (project.error) fail();
      const projectCode = project.data === null ? null : project.data.project_code;
      if (projectCode !== null && typeof projectCode !== "string") fail();

      const invitationRows = await client
        .from("project_invitations")
        .select("id, variant, public_slug, published_version_id")
        .eq("project_id", projectId)
        .not("published_version_id", "is", null);
      if (invitationRows.error) fail();
      const invitations = toPortalInvitations(invitationRows.data);

      let versions: PortalPublishedVersionRecord[] = [];
      if (invitations.length > 0) {
        const versionRows = await client
          .from("invitation_versions")
          .select("id, invitation_id, project_id, version_type, template_version_id, renderer_key_snapshot, payload")
          .eq("project_id", projectId)
          .in(
            "id",
            invitations.map((row) => row.publishedVersionId),
          );
        if (versionRows.error) fail();
        versions = toPortalVersions(versionRows.data);
      }

      const addons = await client
        .from("project_addons")
        .select("id")
        .eq("project_id", projectId)
        .eq("addon_code_snapshot", PERSONALIZED_GUEST_ADDON_CODE)
        .is("revoked_at", null)
        .limit(1);
      if (addons.error || !Array.isArray(addons.data)) fail();

      return { projectCode, invitations, versions, personalizedGuestEntitled: addons.data.length === 1 };
    },

    async listPortalRsvps(projectId): Promise<PortalRsvpRecord[]> {
      if (!isValidUuid(projectId)) fail();
      const client = createServiceRoleSupabaseClient();

      const rsvps = await client
        .from("rsvps")
        .select(
          "project_id, guest_id, guest_display_name_snapshot, attendance, party_size, message, created_at, updated_at, guest:guests(project_id, display_name, invitation_variant)",
          { count: "exact" },
        )
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false });
      if (rsvps.error || !Array.isArray(rsvps.data)) fail();
      // A server row cap must never silently truncate the couple's list.
      if (rsvps.count !== rsvps.data.length) fail();
      return toPortalRsvps(rsvps.data, projectId);
    },
  };
}
