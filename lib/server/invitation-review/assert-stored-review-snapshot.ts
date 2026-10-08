import type { InvitationVariant } from "../../domain";
import { RendererSelectionError } from "../../invitation-rendering/renderer-selection-errors";
import { SNAPSHOT_PAYLOAD_SCHEMA_VERSION, type SnapshotPayloadV1 } from "../../invitation-rendering/snapshot-payload-types";
import { lookupTemplateEditorManifest } from "../../../templates/core/production-editor-manifests";
import { assertStoredTemplateSlots } from "./assert-stored-template-slots";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Integrity gate for rendering a persisted, immutable REVIEW Snapshot (staff
 * preview and customer review alike): the stored payload must agree with
 * its version row — schema version, variant, pinned template version and
 * renderer key — before it is rendered. Any disagreement is an integrity
 * fault (thrown, 500), never a degraded render and never a draft fallback.
 * Shape beyond these binding fields is the frozen builder's output,
 * re-checked by the ViewModel builder's invariants.
 *
 * TE-04: after the binding check, the pinned renderer's editor manifest
 * (exact key, no default/latest) must exist, and the stored media model is
 * validated against it (`assertStoredTemplateSlots`). Every persisted read
 * path (staff REVIEW preview, customer REVIEW, public and personalized
 * published invitation, Portal) goes through this one gate.
 */
export function assertStoredReviewSnapshot(stored: {
  variant: InvitationVariant;
  templateVersionId: string;
  rendererKey: string;
  payload: unknown;
}): SnapshotPayloadV1 {
  const payload = stored.payload;
  if (
    !isRecord(payload) ||
    payload.payloadSchemaVersion !== SNAPSHOT_PAYLOAD_SCHEMA_VERSION ||
    payload.variant !== stored.variant ||
    !isRecord(payload.template) ||
    payload.template.templateVersionId !== stored.templateVersionId ||
    payload.template.rendererKey !== stored.rendererKey
  ) {
    throw new Error("Stored review Snapshot is inconsistent with its version row");
  }
  const manifest = lookupTemplateEditorManifest(stored.rendererKey);
  if (manifest === undefined) {
    // Editor key set === production renderer key set (TE-02): this is an
    // unregistered renderer, reported with the same fail-closed RF-04 error.
    throw new RendererSelectionError("RENDERER_KEY_NOT_REGISTERED", "Renderer key is not registered");
  }
  assertStoredTemplateSlots(payload, manifest);
  return payload as unknown as SnapshotPayloadV1;
}
