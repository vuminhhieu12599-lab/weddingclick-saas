import type {
  SaveWeddingDetailsInput,
  SaveWeddingDetailsResult,
  WeddingDetailsRecord,
} from "./wedding-details-types";

/**
 * Small seam (Task 022, mirrors Task 005's ProjectGateway/CustomerGateway
 * pattern) that decouples Wedding Details use cases from the real
 * @supabase/supabase-js client shape.
 *
 * `projectExists`/`getWeddingDetailsByProjectId` are plain DIRECT RLS reads
 * (API_CONTRACT.md §3.1) — called with a staff-scoped client so `projects`/
 * `wedding_details` RLS (`is_staff()`) remains the real enforcement.
 *
 * `saveWeddingDetails` calls the `save_wedding_details` TRUSTED BUSINESS
 * ACTION RPC (supabase/migrations/..._0021_save_wedding_details.sql) —
 * never a plain RLS INSERT/UPDATE (API_CONTRACT.md §3.1 table).
 */
export interface WeddingDetailsGateway<TClient> {
  projectExists(client: TClient, projectId: string): Promise<boolean>;
  getWeddingDetailsByProjectId(
    client: TClient,
    projectId: string,
  ): Promise<WeddingDetailsRecord | null>;
  saveWeddingDetails(
    client: TClient,
    projectId: string,
    input: SaveWeddingDetailsInput,
  ): Promise<SaveWeddingDetailsResult>;
}
