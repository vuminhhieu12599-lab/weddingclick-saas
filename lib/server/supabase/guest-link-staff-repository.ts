import type { SupabaseClient } from "@supabase/supabase-js";

import { INVITATION_VARIANTS, SERVICE_ADDON_CODES, type InvitationVariant, type ServiceAddonCode } from "../../domain";
import type { GuestLinkGateway } from "../guest-links/guest-link-types";
import { toPostgresByteaHexLiteral } from "./postgres-bytea";

/**
 * Production staff SUPPORT GuestLinkGateway (Task 033B1). Always a staff-scoped client
 * (caller JWT, RLS `guests_*_staff` / `is_staff()`), never `service_role`.
 * Direct RLS per docs/API_CONTRACT.md §7.5. Issuance state is
 * `token_issued_at` (0042), never `token_hint`. Never selects `token_hash` and
 * never logs; database errors become generic failures with no detail.
 */

const PERSONALIZED_GUEST_ADDON_CODE: ServiceAddonCode = SERVICE_ADDON_CODES[0];

function isInvitationVariant(value: unknown): value is InvitationVariant {
  return typeof value === "string" && (INVITATION_VARIANTS as readonly string[]).includes(value);
}

export const supabaseGuestLinkStaffGateway: GuestLinkGateway<SupabaseClient> = {
  /** Non-revoked `project_addons` row with the immutable `addon_code_snapshot` PERSONALIZED_GUEST. */
  async hasPersonalizedGuestEntitlement(client, projectId) {
    const { data, error } = await client
      .from("project_addons")
      .select("id")
      .eq("project_id", projectId)
      .eq("addon_code_snapshot", PERSONALIZED_GUEST_ADDON_CODE)
      .is("revoked_at", null)
      .limit(1);
    if (error || !Array.isArray(data)) {
      throw new Error("Failed to load project add-ons");
    }
    return data.length === 1;
  },

  async getGuestLinkTarget(client, projectId, guestId) {
    const { data: guest, error } = await client
      .from("guests")
      .select("invitation_variant, token_issued_at, revoked_at")
      .eq("id", guestId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) {
      throw new Error("Failed to load guest");
    }
    if (guest === null) {
      return null;
    }
    const variant: unknown = guest.invitation_variant;
    if (variant !== null && !isInvitationVariant(variant)) {
      throw new Error("Failed to load guest");
    }

    const { data: project, error: projectError } = await client
      .from("projects")
      .select("package_code_snapshot")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError || project === null || typeof project.package_code_snapshot !== "string") {
      throw new Error("Failed to load project");
    }

    return {
      invitationVariant: variant,
      hasIssuedLink: guest.token_issued_at !== null,
      revoked: guest.revoked_at !== null,
      packageCode: project.package_code_snapshot,
    };
  },

  async getInvitationSlug(client, projectId, variant) {
    const { data, error } = await client
      .from("project_invitations")
      .select("public_slug")
      .eq("project_id", projectId)
      .eq("variant", variant)
      .maybeSingle();
    if (error) {
      throw new Error("Failed to load invitation");
    }
    if (data === null) {
      return null;
    }
    if (typeof data.public_slug !== "string" || data.public_slug.length === 0) {
      throw new Error("Failed to load invitation");
    }
    return data.public_slug;
  },

  async replaceGuestToken(client, params) {
    const base = client
      .from("guests")
      .update({
        token_hash: toPostgresByteaHexLiteral(params.tokenHash),
        token_hint: params.tokenHint,
        token_issued_at: new Date().toISOString(),
      })
      .eq("id", params.guestId)
      .eq("project_id", params.projectId)
      .is("revoked_at", null);
    const issuance = params.expectIssued ? base.not("token_issued_at", "is", null) : base.is("token_issued_at", null);
    // Task 033E-B: the side the slug was resolved from must still be stored.
    const variant = params.expectedInvitationVariant;
    const guarded = variant === null ? issuance.is("invitation_variant", null) : issuance.eq("invitation_variant", variant);
    const { data, error } = await guarded.select("id");
    if (error) {
      throw new Error("Failed to update guest link");
    }
    if (!Array.isArray(data) || data.length > 1) {
      throw new Error("Failed to update guest link");
    }
    return data.length === 1;
  },
};
