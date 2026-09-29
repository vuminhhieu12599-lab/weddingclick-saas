import { EVENT_TYPES, type EventType, type ManifestSettingSpec, type TemplateDesignManifestV1 } from "../../lib/domain";
import {
  RENDERER_SECTION_KEYS,
  projectCompatibilityManifest,
  type RendererCompatibilityManifestV1,
  type RendererSectionKey,
} from "../../lib/invitation-rendering/renderer-compatibility-manifest";
import { validateTemplateDesignManifest } from "../../lib/server/project-design/validate-template-design-manifest";

/**
 * Invitation Rendering Foundation RF-06A — full production renderer manifest
 * (docs/DECISIONS.md "RF-06-0 First Production Renderer Contract
 * Clarification" P15, P17–P20).
 *
 * Pure and server-safe: no React, no client code, no discovery (filesystem,
 * modules, database, environment). The RF-04 compatibility manifest and the
 * Task 028 design manifest are reused unchanged; this module only composes
 * them under the stricter RF-06 full-manifest invariants.
 *
 * `validateTemplateDesignManifest` lives under `lib/server/` but its import
 * graph is pure (a type-only `lib/domain` import); reusing it here is the
 * recorded P45 debt, not a server dependency.
 */

/** P15: exactly four identity members. `rendererKey` is deliberately absent (P18 derives it). */
export interface RendererProductionManifestIdentityV1 {
  readonly eventType: EventType;
  readonly templateCode: string;
  readonly versionNumber: number;
  readonly displayName: string;
}

/** P15: exactly three top-level members; the type name carries the version. */
export interface RendererProductionManifestV1 {
  readonly identity: RendererProductionManifestIdentityV1;
  readonly compatibility: RendererCompatibilityManifestV1;
  readonly design: TemplateDesignManifestV1;
}

/**
 * Thrown for every RF-06-only full-manifest failure (P20): P19 steps 1, 2,
 * 4, 5 and 6, a duplicate production `rendererKey`, and runtime-corrupted
 * production registry state. Messages are fixed and never echo manifest
 * content. RF-04 and RF-05 errors are never wrapped into it. Mirrors
 * `RendererSelectionInvariantError` and `RendererBindingInvariantError`.
 */
export class RendererProductionManifestInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RendererProductionManifestInvariantError";
  }
}

/**
 * P18: exhaustive closed map over `EventType`. Adding an event type is a
 * compile error here, forcing an explicit segment decision; there is no
 * generic lower-casing.
 */
export const RENDERER_KEY_EVENT_SEGMENT: { readonly [K in EventType]: string } = Object.freeze({
  WEDDING: "wedding",
});

/** P18: lower-case kebab, no dots, so key composition is injective. */
export const PRODUCTION_TEMPLATE_CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const MANIFEST_KEYS = ["identity", "compatibility", "design"] as const satisfies readonly (keyof RendererProductionManifestV1)[];

const IDENTITY_KEYS = [
  "eventType",
  "templateCode",
  "versionNumber",
  "displayName",
] as const satisfies readonly (keyof RendererProductionManifestIdentityV1)[];

const DESIGN_KEYS = [
  "schemaVersion",
  "palettes",
  "fontPresets",
  "effectPresets",
  "sectionSettingsSchema",
  "designSettingsSchema",
] as const satisfies readonly (keyof TemplateDesignManifestV1)[];

/** Fixed messages (docs/SECURITY.md): never a key name, value or other manifest content. */
export const RENDERER_PRODUCTION_MANIFEST_ERROR_MESSAGES = Object.freeze({
  MANIFEST_NOT_PLAIN_OBJECT: "Production renderer manifest must be a plain object",
  MANIFEST_KEYS: "Production renderer manifest must have exactly the keys identity, compatibility, design",
  IDENTITY_NOT_PLAIN_OBJECT: "Production renderer manifest identity must be a plain object",
  IDENTITY_KEYS:
    "Production renderer manifest identity must have exactly the keys eventType, templateCode, versionNumber, displayName",
  EVENT_TYPE: "Production renderer manifest identity.eventType must be a canonical EventType",
  TEMPLATE_CODE: "Production renderer manifest identity.templateCode must be lower-case kebab-case",
  VERSION_NUMBER: "Production renderer manifest identity.versionNumber must be a positive safe integer",
  DISPLAY_NAME: "Production renderer manifest identity.displayName must be a non-empty trimmed string",
  RENDERER_KEY_MISMATCH: "Production renderer manifest compatibility.rendererKey does not equal the key composed from identity",
  DESIGN_NOT_PLAIN_OBJECT: "Production renderer manifest design must be a plain object",
  DESIGN_KEYS: "Production renderer manifest design must have exactly the Task 028 design-manifest keys",
  DESIGN_TASK028_INVALID: "Production renderer manifest design is not a valid Task 028 design manifest",
  DESIGN_NORMALIZED: "Production renderer manifest design must not rely on Task 028 trim normalization",
  DESIGN_EMPTY_KEY_SET: "Production renderer manifest design palettes, fontPresets and effectPresets must be non-empty",
  SECTION_SETTING_KEY: "Production renderer manifest design.sectionSettingsSchema has a key that is not a renderer section key",
  SECTION_SETTING_SPEC: 'Production renderer manifest design.sectionSettingsSchema specs must be exactly { type: "boolean" }',
  SECTION_SETTING_CAPABILITY_MISMATCH:
    "Production renderer manifest design.sectionSettingsSchema keys must equal the capable renderer sections",
  MANIFEST_LIST: "Production renderer manifests must be an array",
  DUPLICATE_RENDERER_KEY: "Production renderer manifests contain a duplicate rendererKey",
} as const);

const MESSAGES = RENDERER_PRODUCTION_MANIFEST_ERROR_MESSAGES;

function fail(message: string): never {
  throw new RendererProductionManifestInvariantError(message);
}

function hasOwn(record: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** A non-array object whose prototype is `Object.prototype` or `null`: no class instances. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Exactly `keys` as own data properties and nothing else: no extra string,
 * symbol or non-enumerable own key, no accessor. Never normalized.
 */
function hasExactDataKeys(record: object, keys: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.length !== keys.length) {
    return false;
  }
  for (const key of ownKeys) {
    if (typeof key !== "string" || !keys.includes(key)) {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return false;
    }
  }
  return true;
}

function isEventType(value: unknown): value is EventType {
  return (EVENT_TYPES as readonly unknown[]).includes(value);
}

/**
 * P18: `segment + "." + templateCode + ".v" + versionNumber`. Pure string
 * composition over already-validated identity: no normalization, alias,
 * display-name influence or lookup of any kind.
 */
export function composeProductionRendererKey(
  identity: Pick<RendererProductionManifestIdentityV1, "eventType" | "templateCode" | "versionNumber">,
): string {
  if (!hasOwn(RENDERER_KEY_EVENT_SEGMENT, identity.eventType)) {
    fail(MESSAGES.EVENT_TYPE);
  }
  return `${RENDERER_KEY_EVENT_SEGMENT[identity.eventType]}.${identity.templateCode}.v${String(identity.versionNumber)}`;
}

/** P19 step 2. */
function validateIdentity(value: unknown): RendererProductionManifestIdentityV1 {
  if (!isPlainObject(value)) {
    fail(MESSAGES.IDENTITY_NOT_PLAIN_OBJECT);
  }
  if (!hasExactDataKeys(value, IDENTITY_KEYS)) {
    fail(MESSAGES.IDENTITY_KEYS);
  }
  const { eventType, templateCode, versionNumber, displayName } = value;
  if (!isEventType(eventType)) {
    fail(MESSAGES.EVENT_TYPE);
  }
  if (typeof templateCode !== "string" || !PRODUCTION_TEMPLATE_CODE_PATTERN.test(templateCode)) {
    fail(MESSAGES.TEMPLATE_CODE);
  }
  // Safe integer implies number, finite and integral. No INT4 bound here (catalog-seed debt).
  if (typeof versionNumber !== "number" || !Number.isSafeInteger(versionNumber) || versionNumber <= 0) {
    fail(MESSAGES.VERSION_NUMBER);
  }
  if (typeof displayName !== "string" || displayName.length === 0 || displayName !== displayName.trim()) {
    fail(MESSAGES.DISPLAY_NAME);
  }
  return { eventType, templateCode, versionNumber, displayName };
}

function sameStrings(raw: unknown, validated: readonly string[]): boolean {
  return (
    Array.isArray(raw) &&
    raw.length === validated.length &&
    raw.every((entry, index) => entry === validated[index])
  );
}

/** The validator's `enumValues` for a raw spec, compared only where trim could have changed it. */
function sameSpec(rawSpec: unknown, validated: ManifestSettingSpec): boolean {
  if (!isPlainObject(rawSpec) || rawSpec.type !== validated.type) {
    return false;
  }
  const rawEnumValues = hasOwn(rawSpec, "enumValues") ? rawSpec.enumValues : undefined;
  if (rawEnumValues === undefined || validated.enumValues === undefined) {
    // An absent optional enumValues is not a difference (P19 step 5).
    return rawEnumValues === undefined && validated.enumValues === undefined;
  }
  return (
    Array.isArray(rawEnumValues) &&
    rawEnumValues.length === validated.enumValues.length &&
    rawEnumValues.every((entry, index) => entry === validated.enumValues?.[index])
  );
}

function sameSettingsSchema(raw: unknown, validated: Record<string, ManifestSettingSpec>): boolean {
  if (!isPlainObject(raw)) {
    return false;
  }
  const rawKeys = Object.keys(raw);
  const validatedKeys = Object.keys(validated);
  if (rawKeys.length !== validatedKeys.length) {
    return false;
  }
  return rawKeys.every((key, index) => {
    const spec = validated[key];
    return key === validatedKeys[index] && spec !== undefined && sameSpec(raw[key], spec);
  });
}

function copySpec(spec: ManifestSettingSpec): ManifestSettingSpec {
  switch (spec.type) {
    case "string":
      return spec.enumValues === undefined ? { type: "string" } : { type: "string", enumValues: [...spec.enumValues] };
    case "number":
      return spec.enumValues === undefined ? { type: "number" } : { type: "number", enumValues: [...spec.enumValues] };
    case "boolean":
      return spec.enumValues === undefined ? { type: "boolean" } : { type: "boolean", enumValues: [...spec.enumValues] };
  }
}

/** `Object.fromEntries` defines own data properties, so a `__proto__` key stays data. */
function copySettingsSchema(schema: Record<string, ManifestSettingSpec>): Record<string, ManifestSettingSpec> {
  return Object.fromEntries(Object.keys(schema).map((key) => [key, copySpec(schema[key] as ManifestSettingSpec)]));
}

/**
 * P19 step 5. RF-06 closedness first (the Task 028 validator deliberately
 * ignores unknown top-level keys; a code-owned full manifest does not),
 * then the frozen Task 028 validator, then no reliance on its trim
 * normalization, then non-empty key sets.
 */
function validateDesign(value: unknown): TemplateDesignManifestV1 {
  if (!isPlainObject(value)) {
    fail(MESSAGES.DESIGN_NOT_PLAIN_OBJECT);
  }
  if (!hasExactDataKeys(value, DESIGN_KEYS)) {
    fail(MESSAGES.DESIGN_KEYS);
  }

  let validated: TemplateDesignManifestV1;
  try {
    validated = validateTemplateDesignManifest(value);
  } catch {
    // P20: fixed static message; the original error is not attached or echoed.
    fail(MESSAGES.DESIGN_TASK028_INVALID);
  }

  if (
    !sameStrings(value.palettes, validated.palettes) ||
    !sameStrings(value.fontPresets, validated.fontPresets) ||
    !sameStrings(value.effectPresets, validated.effectPresets) ||
    !sameSettingsSchema(value.sectionSettingsSchema, validated.sectionSettingsSchema) ||
    !sameSettingsSchema(value.designSettingsSchema, validated.designSettingsSchema)
  ) {
    fail(MESSAGES.DESIGN_NORMALIZED);
  }

  if (validated.palettes.length === 0 || validated.fontPresets.length === 0 || validated.effectPresets.length === 0) {
    fail(MESSAGES.DESIGN_EMPTY_KEY_SET);
  }

  return {
    schemaVersion: validated.schemaVersion,
    palettes: [...validated.palettes],
    fontPresets: [...validated.fontPresets],
    effectPresets: [...validated.effectPresets],
    sectionSettingsSchema: copySettingsSchema(validated.sectionSettingsSchema),
    designSettingsSchema: copySettingsSchema(validated.designSettingsSchema),
  };
}

function isRendererSectionKey(key: string): key is RendererSectionKey {
  return (RENDERER_SECTION_KEYS as readonly string[]).includes(key);
}

/**
 * P19 step 6, over the raw section settings schema (already proven equal to
 * the Task 028 result): section keys only, each spec exactly
 * `{ type: "boolean" }`, and key set === the capable sections.
 */
function validateSectionSettingsAgainstCapabilities(
  rawSectionSettingsSchema: Record<string, unknown>,
  compatibility: RendererCompatibilityManifestV1,
): void {
  const keys = Object.keys(rawSectionSettingsSchema);
  for (const key of keys) {
    if (!isRendererSectionKey(key)) {
      fail(MESSAGES.SECTION_SETTING_KEY);
    }
  }
  for (const key of keys) {
    const spec = rawSectionSettingsSchema[key];
    if (!isPlainObject(spec) || !hasExactDataKeys(spec, ["type"]) || spec.type !== "boolean") {
      fail(MESSAGES.SECTION_SETTING_SPEC);
    }
  }
  for (const key of RENDERER_SECTION_KEYS) {
    if (compatibility.sectionCapabilities[key] !== keys.includes(key)) {
      fail(MESSAGES.SECTION_SETTING_CAPABILITY_MISMATCH);
    }
  }
}

/**
 * P19: validates one untrusted full production manifest in the frozen
 * fail-fast order and returns a fresh validated projection that shares no
 * object with the input. Nothing is coerced, normalized, deduplicated or
 * repaired.
 *
 * 1. exact top-level own keys;
 * 2. identity: exact own keys, then eventType, templateCode, versionNumber, displayName;
 * 3. compatibility through the frozen RF-04 `projectCompatibilityManifest`
 *    (its `RendererSelectionInvariantError` propagates unchanged);
 * 4. projected rendererKey === the P18 composition;
 * 5. design: exact Task 028 keys, the frozen Task 028 validator, no trim
 *    normalization, non-empty key sets;
 * 6. section settings schema vs `RENDERER_SECTION_KEYS` and capabilities.
 */
export function validateRendererProductionManifest(value: unknown): RendererProductionManifestV1 {
  if (!isPlainObject(value)) {
    fail(MESSAGES.MANIFEST_NOT_PLAIN_OBJECT);
  }
  if (!hasExactDataKeys(value, MANIFEST_KEYS)) {
    fail(MESSAGES.MANIFEST_KEYS);
  }

  const identity = validateIdentity(value.identity);

  const compatibility = projectCompatibilityManifest(value.compatibility);

  if (compatibility.rendererKey !== composeProductionRendererKey(identity)) {
    fail(MESSAGES.RENDERER_KEY_MISMATCH);
  }

  const design = validateDesign(value.design);

  // validateDesign proved the raw schema is a plain object equal to the validated one.
  validateSectionSettingsAgainstCapabilities(
    (value.design as Record<string, unknown>).sectionSettingsSchema as Record<string, unknown>,
    compatibility,
  );

  return { identity, compatibility, design };
}
