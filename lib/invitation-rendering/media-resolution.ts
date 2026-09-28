import type { MediaResolution } from "./invitation-view-model-types";

/**
 * Thrown when an RF-03 input breaks a guarantee owned by the Snapshot
 * builder, Layer A or the injected resolver: a malformed or mismatched
 * resolver result, an incomplete or over-complete resolution set, or a
 * Snapshot whose gift/QR references disagree. It signals an
 * integration/programming fault — never expected media unavailability,
 * which is the normal `UNAVAILABLE` state (M3–M5, M12). Mirrors RF-01's
 * `WeddingDomainInvariantError` and RF-02's `SnapshotPayloadInvariantError`.
 */
export class InvitationViewModelInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvitationViewModelInvariantError";
  }
}

function isDimension(value: unknown): value is number | null {
  // Mirrors the canonical project_media CHECK (width/height IS NULL OR > 0, INTEGER).
  return value === null || (typeof value === "number" && Number.isInteger(value) && value > 0);
}

/**
 * Validates one runtime resolution value and returns a fresh explicit
 * projection of only the frozen M2 fields, so unknown adapter keys
 * (storage path, bucket, signing/expiry metadata, provider errors) can
 * never leak. Malformed values are never coerced.
 */
export function projectMediaResolution(value: unknown): MediaResolution {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvitationViewModelInvariantError("Media resolution must be an object");
  }
  const record = value as Record<string, unknown>;
  const { status, mediaId } = record;

  if (typeof mediaId !== "string" || mediaId.length === 0) {
    throw new InvitationViewModelInvariantError("Media resolution mediaId must be a non-empty string");
  }

  if (status === "UNAVAILABLE") {
    return { status: "UNAVAILABLE", mediaId };
  }

  if (status === "RESOLVED") {
    const { url, width, height } = record;
    if (typeof url !== "string" || url.trim() === "") {
      throw new InvitationViewModelInvariantError(`Resolved media ${mediaId} has an empty url`);
    }
    if (!isDimension(width) || !isDimension(height)) {
      throw new InvitationViewModelInvariantError(
        `Resolved media ${mediaId} dimensions must be null or positive integers`,
      );
    }
    return { status: "RESOLVED", mediaId, url, width, height };
  }

  throw new InvitationViewModelInvariantError(`Media resolution for ${mediaId} has an unknown status`);
}
