/**
 * Wedding Details domain shapes (Task 022).
 *
 * Mirrors migration 0008_wedding_details.sql / docs/PHYSICAL_DATABASE_PLAN.md
 * §2.7 exactly — no invented fields. `id`, `projectId`, `createdAt`,
 * `updatedAt` are server-owned and never accepted as Save input.
 */
export interface WeddingDetailsRecord {
  id: string;
  projectId: string;
  groomName: string | null;
  brideName: string | null;
  groomFather: string | null;
  groomMother: string | null;
  brideFather: string | null;
  brideMother: string | null;
  groomFamilyAddress: string | null;
  brideFamilyAddress: string | null;
  invitationMessage: string | null;
  loveStory: string | null;
  lunarDateDisplay: string | null;
  additionalNote: string | null;
  groomBankName: string | null;
  groomBankAccountName: string | null;
  groomBankAccountNumber: string | null;
  groomBankQrMediaId: string | null;
  brideBankName: string | null;
  brideBankAccountName: string | null;
  brideBankAccountNumber: string | null;
  brideBankQrMediaId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The full set of editable canonical columns — exactly the fields the Save
 * business action (`save_wedding_details` RPC) accepts. Same field set as
 * `WeddingDetailsRecord` minus the server-owned `id`/`projectId`/timestamps.
 */
export interface SaveWeddingDetailsInput {
  groomName: string | null;
  brideName: string | null;
  groomFather: string | null;
  groomMother: string | null;
  brideFather: string | null;
  brideMother: string | null;
  groomFamilyAddress: string | null;
  brideFamilyAddress: string | null;
  invitationMessage: string | null;
  loveStory: string | null;
  lunarDateDisplay: string | null;
  additionalNote: string | null;
  groomBankName: string | null;
  groomBankAccountName: string | null;
  groomBankAccountNumber: string | null;
  groomBankQrMediaId: string | null;
  brideBankName: string | null;
  brideBankAccountName: string | null;
  brideBankAccountNumber: string | null;
  brideBankQrMediaId: string | null;
}

/** Stable operation label returned by the Save business action (CLAUDE.md §34 / API_CONTRACT.md §7). */
export type WeddingDetailsSaveOperation = "CREATED" | "UPDATED";

/**
 * Return contract of the `save_wedding_details` RPC (API_CONTRACT.md §9 —
 * "Before finalizing, report the exact SQL signature"). `operation` is null
 * exactly when `changed` is false (no-op Save — §6 of the task).
 */
export interface SaveWeddingDetailsResult {
  weddingDetails: WeddingDetailsRecord;
  changed: boolean;
  operation: WeddingDetailsSaveOperation | null;
}
