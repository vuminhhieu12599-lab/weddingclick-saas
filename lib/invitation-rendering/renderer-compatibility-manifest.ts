import { INVITATION_VARIANTS, type InvitationVariant } from "../domain";
import { RendererSelectionInvariantError } from "./renderer-selection-errors";
import { SNAPSHOT_PAYLOAD_SCHEMA_VERSION, type SnapshotSections } from "./snapshot-payload-types";

/**
 * Invitation Rendering Foundation RF-04 — code-owned renderer compatibility
 * manifest (docs/DECISIONS.md "RF-04 Registry / Compatibility / Effective
 * Visibility Contract Clarification" R3–R8, R14).
 *
 * This is not the full production renderer manifest (RF-06) and not the DB
 * catalog manifest design subset frozen by Task 028 (R22). It carries no
 * renderer implementation and needs no database lookup.
 */

/**
 * R8: exactly the Snapshot Sections v1 keys, the only RF-04 visibility keys.
 * `timeline`, `dressCode` and `photoStory` are additive keys
 * (docs/DECISIONS.md RF7 Timeline / Dress Code / Photo Story amendments, 2026-10-01).
 */
export const RENDERER_SECTION_KEYS = [
  "invitationMessage",
  "loveStory",
  "gallery",
  "music",
  "gift",
  "timeline",
  "dressCode",
  "photoStory",
] as const satisfies readonly (keyof SnapshotSections)[];

export type RendererSectionKey = (typeof RENDERER_SECTION_KEYS)[number];

/** R7: exact closed boolean record over the section keys. */
export type RendererSectionCapabilities = { readonly [K in RendererSectionKey]: boolean };

/** R5: the Snapshot payload-schema-version type; today only `1`. */
export type PayloadSchemaVersion = typeof SNAPSHOT_PAYLOAD_SCHEMA_VERSION;

/** R3: exactly these four fields and no others. */
export interface RendererCompatibilityManifestV1 {
  /** R4: non-empty, exact, versioned, code-owned. */
  readonly rendererKey: string;
  /** R5: explicit, non-empty, unique membership list. */
  readonly supportedPayloadSchemaVersions: readonly PayloadSchemaVersion[];
  /** R6: explicit, non-empty, unique canonical variants. */
  readonly supportedVariants: readonly InvitationVariant[];
  readonly sectionCapabilities: RendererSectionCapabilities;
}

const MANIFEST_KEYS = [
  "rendererKey",
  "supportedPayloadSchemaVersions",
  "supportedVariants",
  "sectionCapabilities",
] as const satisfies readonly (keyof RendererCompatibilityManifestV1)[];

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPayloadSchemaVersion(value: unknown): value is PayloadSchemaVersion {
  return value === SNAPSHOT_PAYLOAD_SCHEMA_VERSION;
}

export function isInvitationVariant(value: unknown): value is InvitationVariant {
  return (INVITATION_VARIANTS as readonly unknown[]).includes(value);
}

/** Exactly the known keys as own properties, and nothing else. Never normalized. */
function assertExactKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  for (const key of keys) {
    if (!hasOwn(record, key)) {
      throw new RendererSelectionInvariantError(`${label} is missing required key "${key}"`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) {
      throw new RendererSelectionInvariantError(`${label} has unknown key "${key}"`);
    }
  }
}

/** Non-empty, unique, every entry canonical. Returns a fresh array; never deduplicates. */
function projectMembershipList<T>(
  value: unknown,
  isCanonical: (entry: unknown) => entry is T,
  label: string,
): T[] {
  if (!Array.isArray(value)) {
    throw new RendererSelectionInvariantError(`${label} must be an array`);
  }
  if (value.length === 0) {
    throw new RendererSelectionInvariantError(`${label} must not be empty`);
  }
  const seen = new Set<T>();
  for (const entry of value) {
    if (!isCanonical(entry)) {
      throw new RendererSelectionInvariantError(`${label} has a non-canonical entry`);
    }
    if (seen.has(entry)) {
      throw new RendererSelectionInvariantError(`${label} has a duplicate entry "${String(entry)}"`);
    }
    seen.add(entry);
  }
  return [...seen];
}

function projectSectionCapabilities(value: unknown, rendererKey: string): RendererSectionCapabilities {
  const label = `Manifest ${rendererKey} sectionCapabilities`;
  if (!isPlainRecord(value)) {
    throw new RendererSelectionInvariantError(`${label} must be an object`);
  }
  assertExactKeys(value, RENDERER_SECTION_KEYS, label);
  for (const key of RENDERER_SECTION_KEYS) {
    if (typeof value[key] !== "boolean") {
      throw new RendererSelectionInvariantError(`${label}.${key} must be a boolean`);
    }
  }
  return {
    invitationMessage: value.invitationMessage as boolean,
    loveStory: value.loveStory as boolean,
    gallery: value.gallery as boolean,
    music: value.music as boolean,
    gift: value.gift as boolean,
    timeline: value.timeline as boolean,
    dressCode: value.dressCode as boolean,
    photoStory: value.photoStory as boolean,
  };
}

/**
 * Validates one runtime compatibility manifest against the R3/R14
 * invariants and returns a fresh explicit projection of the four frozen
 * fields. Static types are not trusted: runtime-mutated or cast data that
 * violates the contract fails closed with `RendererSelectionInvariantError`
 * and is never normalized, coerced or deduplicated.
 */
export function projectCompatibilityManifest(value: unknown): RendererCompatibilityManifestV1 {
  if (!isPlainRecord(value)) {
    throw new RendererSelectionInvariantError("Compatibility manifest must be an object");
  }
  const { rendererKey } = value;
  // Same non-empty convention as the RF-02 Snapshot builder: exact, no trimming.
  if (typeof rendererKey !== "string" || rendererKey.length === 0) {
    throw new RendererSelectionInvariantError("Compatibility manifest rendererKey must be a non-empty string");
  }
  assertExactKeys(value, MANIFEST_KEYS, `Manifest ${rendererKey}`);

  return {
    rendererKey,
    supportedPayloadSchemaVersions: projectMembershipList(
      value.supportedPayloadSchemaVersions,
      isPayloadSchemaVersion,
      `Manifest ${rendererKey} supportedPayloadSchemaVersions`,
    ),
    supportedVariants: projectMembershipList(
      value.supportedVariants,
      isInvitationVariant,
      `Manifest ${rendererKey} supportedVariants`,
    ),
    sectionCapabilities: projectSectionCapabilities(value.sectionCapabilities, rendererKey),
  };
}
