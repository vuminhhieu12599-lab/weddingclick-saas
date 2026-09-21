import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { SaveProjectDesignInput } from "./project-design-types";

/**
 * Defensive app-layer cap on string fields — mirrors
 * lib/server/wedding-details/validate-save-wedding-details-input.ts's
 * MAX_FIELD_LENGTH exactly (established repo convention, reused verbatim
 * rather than inventing a new limit — Task 028 closure §12/§Finding C).
 */
const MAX_FIELD_LENGTH = 20000;

const ACCEPTED_TOP_LEVEL_FIELDS = new Set<string>([
  "templateVersionId",
  "paletteKey",
  "fontPresetKey",
  "effectPresetKey",
  "sectionSettings",
  "designSettings",
]);

/**
 * Fields the client must never be able to set on a project_design PUT —
 * server-owned or catalog-only (Task 028 closure §12 "PUT design contract").
 * Present at all (even with a server-matching value) -> reject.
 */
const FORBIDDEN_TOP_LEVEL_FIELDS = [
  "id",
  "projectId",
  "project_id",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "templateId",
  "template_id",
  "templateCode",
  "template_code",
  "rendererKey",
  "renderer_key",
  "manifest",
  "designManifest",
  "isActive",
  "is_active",
  "retiredAt",
  "retired_at",
  "selectable",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Own-property check — `key in record` would traverse the prototype chain,
 * so a required field satisfied only via an inherited property (never
 * actual caller-supplied JSON input) would incorrectly be treated as
 * present. This feature's "own properties only" security contract applies
 * to both required-field presence and forbidden-field detection (Task 028
 * independent review patch 1, Finding C) — Object.keys-based unknown-field
 * enumeration below was already own-only and is unchanged.
 */
function hasOwn(record: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function parseRequiredKey(
  record: Record<string, unknown>,
  fieldName: keyof SaveProjectDesignInput,
): unknown {
  if (!hasOwn(record, fieldName)) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" is required`);
  }
  return record[fieldName];
}

function parseTemplateVersionId(record: Record<string, unknown>): string {
  const value = parseRequiredKey(record, "templateVersionId");

  if (typeof value !== "string" || !isValidUuid(value)) {
    throw new ApiError("BAD_REQUEST", '"templateVersionId" must be a valid UUID');
  }

  return value;
}

/**
 * paletteKey/fontPresetKey/effectPresetKey: string, trimmed, empty-after-
 * trim rejected, MAX_FIELD_LENGTH applies to the raw (pre-trim) value —
 * mirrors parseRequiredOptionalString's length-before-trim ordering. The
 * normalized (trimmed) value is both what is compared against the selected
 * manifest and what is persisted (Task 028 closure §7).
 */
function parsePresetKey(
  record: Record<string, unknown>,
  fieldName: keyof SaveProjectDesignInput,
): string {
  const value = parseRequiredKey(record, fieldName);

  if (typeof value !== "string") {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must be a string`);
  }

  if (value.length > MAX_FIELD_LENGTH) {
    throw new ApiError(
      "BAD_REQUEST",
      `"${fieldName}" exceeds the maximum length of ${MAX_FIELD_LENGTH} characters`,
    );
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must not be empty`);
  }

  return trimmed;
}

/**
 * sectionSettings/designSettings: plain object, own keys only (`Object.keys`
 * — no prototype/inherited traversal), values restricted to
 * string | finite number | boolean (no nested object/array — Task 028
 * closure §6/Finding C). String values: MAX_FIELD_LENGTH on the raw
 * (pre-trim) value, trimmed leading/trailing, internal whitespace/newlines
 * preserved exactly, empty-after-trim rejected. The result object is built
 * via `Object.create(null)` so a key literally named `__proto__`/
 * `constructor`/`prototype` can never mutate the object's prototype during
 * assignment.
 */
function parseSettingsRecord(
  record: Record<string, unknown>,
  fieldName: keyof SaveProjectDesignInput,
): Record<string, string | number | boolean> {
  const value = parseRequiredKey(record, fieldName);

  if (!isPlainObject(value)) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must be a JSON object`);
  }

  const result: Record<string, string | number | boolean> = Object.create(null) as Record<
    string,
    string | number | boolean
  >;

  for (const key of Object.keys(value)) {
    const entryValue = value[key];

    if (typeof entryValue === "string") {
      if (entryValue.length > MAX_FIELD_LENGTH) {
        throw new ApiError(
          "BAD_REQUEST",
          `"${fieldName}.${key}" exceeds the maximum length of ${MAX_FIELD_LENGTH} characters`,
        );
      }
      const trimmed = entryValue.trim();
      if (trimmed.length === 0) {
        throw new ApiError("BAD_REQUEST", `"${fieldName}.${key}" must not be empty`);
      }
      result[key] = trimmed;
      continue;
    }

    if (typeof entryValue === "number") {
      if (!Number.isFinite(entryValue)) {
        throw new ApiError("BAD_REQUEST", `"${fieldName}.${key}" must be a finite number`);
      }
      result[key] = entryValue;
      continue;
    }

    if (typeof entryValue === "boolean") {
      result[key] = entryValue;
      continue;
    }

    throw new ApiError(
      "BAD_REQUEST",
      `"${fieldName}.${key}" must be a string, finite number, or boolean`,
    );
  }

  return result;
}

/**
 * Parses/validates a raw PUT /api/v2/internal/projects/[id]/design body into
 * a structurally-safe SaveProjectDesignInput (Task 028 closure §6/§11).
 *
 * This is a full replace of the six editable fields — no partial/autosave
 * semantics. Purely structural: it does NOT check `templateVersionId`
 * existence or validate config against any manifest — that happens later in
 * the save use case once the selected template version's manifest has been
 * loaded (validate-design-config-against-manifest.ts).
 */
export function validateSaveProjectDesignInput(body: unknown): SaveProjectDesignInput {
  if (!isPlainObject(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }

  for (const forbiddenField of FORBIDDEN_TOP_LEVEL_FIELDS) {
    if (hasOwn(body, forbiddenField)) {
      throw new ApiError(
        "BAD_REQUEST",
        `"${forbiddenField}" is not an accepted field — it is always server-derived`,
      );
    }
  }

  for (const key of Object.keys(body)) {
    if (!ACCEPTED_TOP_LEVEL_FIELDS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unknown field "${key}" is not accepted`);
    }
  }

  return {
    templateVersionId: parseTemplateVersionId(body),
    paletteKey: parsePresetKey(body, "paletteKey"),
    fontPresetKey: parsePresetKey(body, "fontPresetKey"),
    effectPresetKey: parsePresetKey(body, "effectPresetKey"),
    sectionSettings: parseSettingsRecord(body, "sectionSettings"),
    designSettings: parseSettingsRecord(body, "designSettings"),
  };
}
