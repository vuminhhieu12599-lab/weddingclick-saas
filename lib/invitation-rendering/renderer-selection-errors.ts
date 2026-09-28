/**
 * RF-04 normal selection/compatibility failure codes (docs/DECISIONS.md
 * RF-04 clarification R20). Each is a fail-closed outcome with no fallback,
 * coercion or substitution. These are not Review/Publish issue codes (R21).
 */
export type RendererSelectionErrorCode =
  | "RENDERER_KEY_NOT_REGISTERED"
  | "PAYLOAD_SCHEMA_VERSION_UNSUPPORTED"
  | "VARIANT_UNSUPPORTED"
  | "INVALID_SECTION_SETTING_VALUE";

/**
 * Thrown when a well-formed Snapshot/ViewModel cannot be served by the
 * registry: the exact `rendererKey` is not registered, or the selected
 * compatibility manifest does not list the payload schema version or
 * variant, or a reserved `sectionSettings` key holds a non-boolean value.
 * Later Review/Publish orchestration maps these by `code` (R21).
 */
export class RendererSelectionError extends Error {
  readonly code: RendererSelectionErrorCode;

  constructor(code: RendererSelectionErrorCode, message: string) {
    super(message);
    this.name = "RendererSelectionError";
    this.code = code;
  }
}

/**
 * Thrown when RF-04 input breaks a guarantee it does not own: a malformed or
 * duplicate compatibility manifest (R13, R14), an inconsistent registry
 * state, or a Snapshot and ViewModel that disagree (R18). It signals an
 * integration/programming fault, never a normal compatibility outcome.
 * Mirrors `WeddingDomainInvariantError`, `SnapshotPayloadInvariantError` and
 * `InvitationViewModelInvariantError`.
 */
export class RendererSelectionInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RendererSelectionInvariantError";
  }
}
