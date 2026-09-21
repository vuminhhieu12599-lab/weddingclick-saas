import type { ManifestSettingSpec, TemplateDesignManifestV1 } from "../../domain";

/**
 * Runtime extractor/validator for the Task-028 design-config subset of
 * `template_versions.manifest` (raw untrusted JSONB — Task 028 closure §5).
 *
 * Reads ONLY the six required top-level keys (`schemaVersion`, `palettes`,
 * `fontPresets`, `effectPresets`, `sectionSettingsSchema`,
 * `designSettingsSchema`), each required as an OWN property — a required
 * field satisfied only via the prototype chain is treated as missing
 * (Task 028 independent review patch 1, Finding B). Any other TOP-LEVEL key
 * the raw manifest may carry (future Task-029 renderer/layout/animation
 * metadata) remains unread, unvalidated, and uninterpreted here — that is
 * still allowed/ignored extension space.
 *
 * `ManifestSettingSpec` itself is a CLOSED Task-028-owned shape: its only
 * valid own keys are exactly `type` (required) and `enumValues` (optional).
 * It is not a Task-029 extension point — any other own key on a setting
 * spec is malformed (Finding B).
 *
 * Throws a plain `Error` with a fixed, static message on any malformed
 * required field — never the raw manifest value, the malformed key, or any
 * other content (docs/SECURITY.md — never leak raw data in an error). The
 * route layer maps this to a generic INTERNAL/500. Never coerces, never
 * evals/executes a value.
 *
 * Mirrors lib/server/supabase/intake-staff-repository.ts's "shape violation
 * is reported as a plain (non-ApiError) failure... never leaked through it"
 * convention.
 */
const MAX_FIELD_LENGTH = 20000;

const MALFORMED_MANIFEST_MESSAGE = "Template version design manifest is malformed";

const REQUIRED_TOP_LEVEL_FIELDS = [
  "schemaVersion",
  "palettes",
  "fontPresets",
  "effectPresets",
  "sectionSettingsSchema",
  "designSettingsSchema",
] as const;

const ALLOWED_SETTING_SPEC_KEYS = new Set<string>(["type", "enumValues"]);

function fail(): never {
  throw new Error(MALFORMED_MANIFEST_MESSAGE);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Own-property check — `key in value` would traverse the prototype chain,
 * which is exactly what this feature's "own properties only" security
 * contract forbids (Task 028 independent review patch 1, Finding B/C).
 */
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Validates `palettes` / `fontPresets` / `effectPresets`: must be an array
 * of strings, each trimmed, each non-empty after trim, each within
 * MAX_FIELD_LENGTH, no duplicates after trim (case-sensitive exact match).
 * Returns the normalized (trimmed) array — this is what later comparisons
 * (validate-design-config-against-manifest.ts) compare client values
 * against.
 */
function validateKeySet(value: unknown): string[] {
  if (!Array.isArray(value)) {
    fail();
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") {
      fail();
    }
    if (entry.length > MAX_FIELD_LENGTH) {
      fail();
    }
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      fail();
    }
    if (seen.has(trimmed)) {
      fail();
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

/**
 * `value` must be a plain object whose own key set is exactly a subset of
 * {`type`, `enumValues`}, with `type` present as an own property (an
 * inherited `type` never satisfies this) and, when present, `enumValues`
 * read only as an own property (an inherited `enumValues` is treated as
 * absent, never consumed).
 */
function validateManifestSettingSpec(value: unknown): ManifestSettingSpec {
  if (!isPlainObject(value)) {
    fail();
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_SETTING_SPEC_KEYS.has(key)) {
      fail();
    }
  }

  if (!hasOwn(value, "type")) {
    fail();
  }

  const type = value.type;
  const enumValuesRaw = hasOwn(value, "enumValues") ? value.enumValues : undefined;

  if (type === "string") {
    return { type: "string", enumValues: validateStringEnumValues(enumValuesRaw) };
  }

  if (type === "number") {
    return { type: "number", enumValues: validateNumberEnumValues(enumValuesRaw) };
  }

  if (type === "boolean") {
    return { type: "boolean", enumValues: validateBooleanEnumValues(enumValuesRaw) };
  }

  return fail();
}

function validateStringEnumValues(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    fail();
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") {
      fail();
    }
    if (entry.length > MAX_FIELD_LENGTH) {
      fail();
    }
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      fail();
    }
    if (seen.has(trimmed)) {
      fail();
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function validateNumberEnumValues(value: unknown): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    fail();
  }

  const normalized: number[] = [];
  const seen = new Set<number>();

  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      fail();
    }
    if (seen.has(entry)) {
      fail();
    }
    seen.add(entry);
    normalized.push(entry);
  }

  return normalized;
}

function validateBooleanEnumValues(value: unknown): boolean[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    fail();
  }

  const normalized: boolean[] = [];
  const seen = new Set<boolean>();

  for (const entry of value) {
    if (typeof entry !== "boolean") {
      fail();
    }
    if (seen.has(entry)) {
      fail();
    }
    seen.add(entry);
    normalized.push(entry);
  }

  return normalized;
}

/**
 * Validates `sectionSettingsSchema` / `designSettingsSchema`: a plain
 * object, own enumerable keys only (`Object.keys` — never `for...in`, no
 * inherited/prototype traversal), each key trimmed and non-empty, no two
 * keys colliding after trim-normalization (Task 028 independent review
 * patch 1, Finding B/3A — a manifest with both `"hero"` and `" hero "` is
 * rejected outright rather than silently collapsing to whichever the
 * property-enumeration order happens to keep), each own value a valid
 * ManifestSettingSpec. The result is built via `Object.create(null)` so a
 * key literally named `__proto__`/`constructor`/`prototype` can never
 * mutate the object's prototype during assignment.
 */
function validateSettingsSchema(value: unknown): Record<string, ManifestSettingSpec> {
  if (!isPlainObject(value)) {
    fail();
  }

  const result: Record<string, ManifestSettingSpec> = Object.create(null) as Record<
    string,
    ManifestSettingSpec
  >;
  const seenKeys = new Set<string>();

  for (const key of Object.keys(value)) {
    const trimmedKey = key.trim();
    if (trimmedKey.length === 0) {
      fail();
    }
    if (seenKeys.has(trimmedKey)) {
      fail();
    }
    seenKeys.add(trimmedKey);

    result[trimmedKey] = validateManifestSettingSpec(value[key]);
  }

  return result;
}

export function validateTemplateDesignManifest(raw: unknown): TemplateDesignManifestV1 {
  if (!isPlainObject(raw)) {
    fail();
  }

  for (const requiredField of REQUIRED_TOP_LEVEL_FIELDS) {
    if (!hasOwn(raw, requiredField)) {
      fail();
    }
  }

  if (raw.schemaVersion !== 1) {
    fail();
  }

  const palettes = validateKeySet(raw.palettes);
  const fontPresets = validateKeySet(raw.fontPresets);
  const effectPresets = validateKeySet(raw.effectPresets);
  const sectionSettingsSchema = validateSettingsSchema(raw.sectionSettingsSchema);
  const designSettingsSchema = validateSettingsSchema(raw.designSettingsSchema);

  return {
    schemaVersion: 1,
    palettes,
    fontPresets,
    effectPresets,
    sectionSettingsSchema,
    designSettingsSchema,
  };
}
