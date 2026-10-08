/**
 * TE-03B — draft template media slot assignment (docs/DECISIONS.md
 * "TE-03B"). One item is one occupied 0-based position of one slot, for one
 * Project and one exact template version. Shared by COMMON/GROOM/BRIDE:
 * there is no variant. No URL or Storage path is ever part of it.
 */
export interface TemplateMediaSlotItem {
  readonly slotKey: string;
  readonly position: number;
  readonly projectMediaId: string;
}

/** The full, already-validated replacement of one slot passed to the trusted RPC. */
export interface ReplaceTemplateMediaSlotCommand {
  readonly projectId: string;
  readonly templateVersionId: string;
  readonly slotKey: string;
  /** Caller order is authoritative: index i becomes position i. `[]` clears the slot. */
  readonly projectMediaIds: readonly string[];
}

/** Structural slot key pattern, identical to TE-02 and the migration 0046 CHECK. */
export const TEMPLATE_MEDIA_SLOT_KEY_PATTERN = /^[a-z][A-Za-z0-9]{0,47}$/;

/** Structural per-slot item cap, identical to migration 0046 (TM005). */
export const TEMPLATE_MEDIA_SLOT_MAX_ITEMS = 500;
