import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../errors/api-error";
import { SAVE_WEDDING_DETAILS_RPC_ERROR_CODES } from "../wedding-details/wedding-details-rpc-error-codes";
import type { WeddingDetailsGateway } from "../wedding-details/wedding-details-gateway";
import type {
  SaveWeddingDetailsInput,
  SaveWeddingDetailsResult,
  WeddingDetailsRecord,
} from "../wedding-details/wedding-details-types";

/**
 * Production WeddingDetailsGateway (Task 022): the only place in this
 * feature that issues real @supabase/supabase-js calls. Always invoked with
 * a staff-scoped client (Task 004's createStaffSupabaseClient), so
 * `projects`/`wedding_details` RLS remains the real enforcement for reads —
 * this module never uses the privileged (elevated-access) Supabase
 * credential. The Save path calls the `save_wedding_details` RPC (business
 * action), never a plain `.from("wedding_details").insert/update(...)`.
 */
interface WeddingDetailsRow {
  id: string;
  project_id: string;
  groom_name: string | null;
  bride_name: string | null;
  groom_father: string | null;
  groom_mother: string | null;
  bride_father: string | null;
  bride_mother: string | null;
  groom_family_address: string | null;
  bride_family_address: string | null;
  invitation_message: string | null;
  love_story: string | null;
  lunar_date_display: string | null;
  additional_note: string | null;
  groom_bank_name: string | null;
  groom_bank_account_name: string | null;
  groom_bank_account_number: string | null;
  groom_bank_qr_media_id: string | null;
  bride_bank_name: string | null;
  bride_bank_account_name: string | null;
  bride_bank_account_number: string | null;
  bride_bank_qr_media_id: string | null;
  created_at: string;
  updated_at: string;
}

const WEDDING_DETAILS_COLUMNS =
  "id, project_id, groom_name, bride_name, groom_father, groom_mother, bride_father, " +
  "bride_mother, groom_family_address, bride_family_address, invitation_message, " +
  "love_story, lunar_date_display, additional_note, groom_bank_name, " +
  "groom_bank_account_name, groom_bank_account_number, groom_bank_qr_media_id, " +
  "bride_bank_name, bride_bank_account_name, bride_bank_account_number, " +
  "bride_bank_qr_media_id, created_at, updated_at";

function toWeddingDetailsRecord(row: WeddingDetailsRow): WeddingDetailsRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    groomName: row.groom_name,
    brideName: row.bride_name,
    groomFather: row.groom_father,
    groomMother: row.groom_mother,
    brideFather: row.bride_father,
    brideMother: row.bride_mother,
    groomFamilyAddress: row.groom_family_address,
    brideFamilyAddress: row.bride_family_address,
    invitationMessage: row.invitation_message,
    loveStory: row.love_story,
    lunarDateDisplay: row.lunar_date_display,
    additionalNote: row.additional_note,
    groomBankName: row.groom_bank_name,
    groomBankAccountName: row.groom_bank_account_name,
    groomBankAccountNumber: row.groom_bank_account_number,
    groomBankQrMediaId: row.groom_bank_qr_media_id,
    brideBankName: row.bride_bank_name,
    brideBankAccountName: row.bride_bank_account_name,
    brideBankAccountNumber: row.bride_bank_account_number,
    brideBankQrMediaId: row.bride_bank_qr_media_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * `save_wedding_details` RPC row shape — the wedding_details columns above
 * plus `changed`/`operation` (supabase/migrations/
 * 20260911041141_0021_save_wedding_details.sql). PostgREST returns a
 * `RETURNS TABLE` function's result as an array of rows even for a
 * single-row result.
 */
interface SaveWeddingDetailsRpcRow extends WeddingDetailsRow {
  changed: boolean;
  operation: "CREATED" | "UPDATED" | null;
}

export const supabaseWeddingDetailsGateway: WeddingDetailsGateway<SupabaseClient> = {
  async projectExists(client, projectId: string): Promise<boolean> {
    const { data, error } = await client
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query project");
    }

    return data !== null;
  },

  async getWeddingDetailsByProjectId(
    client,
    projectId: string,
  ): Promise<WeddingDetailsRecord | null> {
    const { data, error } = await client
      .from("wedding_details")
      .select(WEDDING_DETAILS_COLUMNS)
      .eq("project_id", projectId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query wedding details");
    }

    if (!data) {
      return null;
    }

    return toWeddingDetailsRecord(data as unknown as WeddingDetailsRow);
  },

  async saveWeddingDetails(
    client,
    projectId: string,
    input: SaveWeddingDetailsInput,
  ): Promise<SaveWeddingDetailsResult> {
    const { data, error } = await client.rpc("save_wedding_details", {
      p_project_id: projectId,
      p_groom_name: input.groomName,
      p_bride_name: input.brideName,
      p_groom_father: input.groomFather,
      p_groom_mother: input.groomMother,
      p_bride_father: input.brideFather,
      p_bride_mother: input.brideMother,
      p_groom_family_address: input.groomFamilyAddress,
      p_bride_family_address: input.brideFamilyAddress,
      p_invitation_message: input.invitationMessage,
      p_love_story: input.loveStory,
      p_lunar_date_display: input.lunarDateDisplay,
      p_additional_note: input.additionalNote,
      p_groom_bank_name: input.groomBankName,
      p_groom_bank_account_name: input.groomBankAccountName,
      p_groom_bank_account_number: input.groomBankAccountNumber,
      p_groom_bank_qr_media_id: input.groomBankQrMediaId,
      p_bride_bank_name: input.brideBankName,
      p_bride_bank_account_name: input.brideBankAccountName,
      p_bride_bank_account_number: input.brideBankAccountNumber,
      p_bride_bank_qr_media_id: input.brideBankQrMediaId,
    });

    if (error) {
      const known = SAVE_WEDDING_DETAILS_RPC_ERROR_CODES[error.code];
      if (known) {
        throw new ApiError(known.kind, known.message);
      }
      throw new Error("Failed to save wedding details");
    }

    const rows = data as unknown as SaveWeddingDetailsRpcRow[] | null;
    const row = rows?.[0];

    if (!row) {
      throw new Error("Failed to save wedding details");
    }

    return {
      weddingDetails: toWeddingDetailsRecord(row),
      changed: row.changed,
      operation: row.operation,
    };
  },
};
