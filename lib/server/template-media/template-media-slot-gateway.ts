import type { ReplaceTemplateMediaSlotCommand, TemplateMediaSlotItem } from "./template-media-slot-types";

/**
 * Narrow seam (TE-03B) over the one table read and the one trusted RPC of
 * migration 0046. There is deliberately no generic insert/update/delete:
 * the only mutation is `replaceSlot`, which maps onto
 * `set_project_template_media_slot`. Always called with a staff-scoped
 * client; RLS and the RPC's own self-authorization remain the enforcement.
 */
export interface TemplateMediaSlotGateway<TClient> {
  /** Every item of one Project + exact template version, ordered by slotKey then position. */
  listSlotItems(client: TClient, projectId: string, templateVersionId: string): Promise<TemplateMediaSlotItem[]>;
  /** Atomically replaces one slot; returns that slot's resulting items in position order. */
  replaceSlot(client: TClient, command: ReplaceTemplateMediaSlotCommand): Promise<TemplateMediaSlotItem[]>;
}
