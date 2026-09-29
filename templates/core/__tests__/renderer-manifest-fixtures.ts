import { ELEGANT_EDITORIAL_V1_MANIFEST } from "../../wedding/elegant-editorial/v1/manifest";

/**
 * RF-06A test helpers. Every call returns a fresh, fully mutable plain deep
 * copy of the frozen Elegant Editorial v1 manifest so negative tests can
 * corrupt it without touching the production constant.
 */

export type MutableManifest = {
  identity: Record<string, unknown>;
  compatibility: Record<string, unknown> & { sectionCapabilities: Record<string, unknown> };
  design: Record<string, unknown> & {
    sectionSettingsSchema: Record<string, unknown>;
    designSettingsSchema: Record<string, unknown>;
  };
} & Record<string, unknown>;

export function manifestCopy(): MutableManifest {
  return structuredClone(ELEGANT_EDITORIAL_V1_MANIFEST) as unknown as MutableManifest;
}

/** A second valid production-shaped manifest with its own identity-derived key. */
export function manifestWithIdentity(templateCode: string, versionNumber: number): MutableManifest {
  const manifest = manifestCopy();
  manifest.identity.templateCode = templateCode;
  manifest.identity.versionNumber = versionNumber;
  manifest.compatibility.rendererKey = `wedding.${templateCode}.v${String(versionNumber)}`;
  return manifest;
}

/** A value planted in corrupted input to prove it is never echoed by an error message. */
export const ECHO_SENTINEL = "ECHO_SENTINEL_MUST_NOT_APPEAR_IN_ERRORS";
