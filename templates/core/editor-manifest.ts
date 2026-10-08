import {
  RENDERER_SECTION_KEYS,
  type RendererSectionKey,
} from "../../lib/invitation-rendering/renderer-compatibility-manifest";

/**
 * TE-02 — code-owned Template Editor Manifest V1 (docs/DECISIONS.md "TE-01"
 * T1 and "TE-02").
 *
 * Describes what Staff are asked to configure for one production renderer
 * version: ordered canonical content items and, for `TEMPLATE_SLOTS`
 * renderers, ordered template media slots. It is separate from the frozen
 * RF-04 compatibility manifest, the Task 028 design manifest and the RF-06
 * production manifest, none of which it changes.
 *
 * Pure and server-safe: no React, no client code, no I/O. It is never read
 * by an invitation renderer, never persisted and never holds customer
 * content. Editor manifests live outside the immutable renderer-version
 * directories (`templates/editor/**`), so a released renderer directory is
 * never touched to add or correct editor metadata.
 */

export const TEMPLATE_EDITOR_MEDIA_MODELS = ["LEGACY_ROLES", "TEMPLATE_SLOTS"] as const;
export type TemplateEditorMediaModel = (typeof TEMPLATE_EDITOR_MEDIA_MODELS)[number];

export const TEMPLATE_EDITOR_CONTENT_KEYS = [
  "COUPLE",
  "FAMILIES",
  "EVENTS",
  "INVITATION_MESSAGE",
  "LOVE_STORY",
  "TIMELINE",
  "DRESS_CODE",
  "GIFT",
  "MUSIC",
] as const;
export type TemplateEditorContentKey = (typeof TEMPLATE_EDITOR_CONTENT_KEYS)[number];

/**
 * The one fixed section key per content item. COUPLE, FAMILIES and EVENTS
 * are canonical non-section content (`null`); every other item is the
 * canonical content of exactly one existing renderer section. No new
 * section key is introduced.
 */
export const TEMPLATE_EDITOR_CONTENT_SECTION_KEYS: { readonly [K in TemplateEditorContentKey]: RendererSectionKey | null } =
  Object.freeze({
    COUPLE: null,
    FAMILIES: null,
    EVENTS: null,
    INVITATION_MESSAGE: "invitationMessage",
    LOVE_STORY: "loveStory",
    TIMELINE: "timeline",
    DRESS_CODE: "dressCode",
    GIFT: "gift",
    MUSIC: "music",
  });

/**
 * V1 readiness rule: only content that the existing Snapshot builder /
 * Wedding Domain Resolver already blocks on may be REQUIRED (couple names;
 * the ceremony event). No new review blocker is introduced (TE-01 T10).
 */
export const TEMPLATE_EDITOR_REQUIRABLE_CONTENT_KEYS: readonly TemplateEditorContentKey[] = Object.freeze(["COUPLE", "EVENTS"]);

export const TEMPLATE_EDITOR_CONTENT_REQUIREMENTS = ["REQUIRED", "RECOMMENDED", "OPTIONAL"] as const;
export type TemplateEditorContentRequirement = (typeof TEMPLATE_EDITOR_CONTENT_REQUIREMENTS)[number];

/** No REQUIRED media slot in V1 (TE-01 T10). */
export const TEMPLATE_EDITOR_SLOT_REQUIREMENTS = ["RECOMMENDED", "OPTIONAL"] as const;
export type TemplateEditorSlotRequirement = (typeof TEMPLATE_EDITOR_SLOT_REQUIREMENTS)[number];

export const TEMPLATE_EDITOR_SLOT_CARDINALITIES = ["SINGLE", "ORDERED_MULTI"] as const;
export type TemplateEditorSlotCardinality = (typeof TEMPLATE_EDITOR_SLOT_CARDINALITIES)[number];

export const TEMPLATE_EDITOR_SLOT_ORIENTATIONS = ["ANY", "PORTRAIT", "LANDSCAPE", "SQUARE"] as const;
export type TemplateEditorSlotOrientation = (typeof TEMPLATE_EDITOR_SLOT_ORIENTATIONS)[number];

/** Lower camelCase, 1–48 characters; the same pattern the future slot table CHECK uses. */
export const TEMPLATE_EDITOR_SLOT_KEY_PATTERN = /^[a-z][A-Za-z0-9]{0,47}$/;

/**
 * Slots are visual positions, never people or sides (TE-01 T1, TE-03A):
 * a slot key naming a person/side role is rejected.
 */
export const TEMPLATE_EDITOR_SLOT_KEY_FORBIDDEN_WORDS = /groom|bride|couple/i;

/** Advisory `W:H` hint, positive integers without leading zeros, e.g. "4:5", "3:2". */
export const TEMPLATE_EDITOR_ASPECT_RATIO_HINT_PATTERN = /^[1-9][0-9]{0,2}:[1-9][0-9]{0,2}$/;

export interface TemplateEditorContentItemV1 {
  readonly key: TemplateEditorContentKey;
  readonly label: string;
  readonly hint: string;
  readonly requirement: TemplateEditorContentRequirement;
  readonly sectionKey: RendererSectionKey | null;
}

export interface TemplateEditorMediaSlotV1 {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly cardinality: TemplateEditorSlotCardinality;
  readonly requirement: TemplateEditorSlotRequirement;
  /** Always 0 in V1. */
  readonly minCount: number;
  /** Readiness target; never above `maxCount`. */
  readonly recommendedCount: number;
  /** Positive integer, or `null` for unbounded; SINGLE is exactly 1. */
  readonly maxCount: number | null;
  /** Staff guidance only; never validation, cropping or blocking. */
  readonly orientation: TemplateEditorSlotOrientation;
  /** Staff guidance only, e.g. "4:5"; never used to crop. */
  readonly aspectRatioHint: string | null;
  /** The renderer section this slot belongs to; that section must be capable. */
  readonly sectionKey: RendererSectionKey | null;
}

export interface TemplateEditorManifestV1 {
  readonly schemaVersion: 1;
  readonly rendererKey: string;
  readonly mediaModel: TemplateEditorMediaModel;
  readonly contentItems: readonly TemplateEditorContentItemV1[];
  readonly mediaSlots: readonly TemplateEditorMediaSlotV1[];
}

/**
 * Thrown for every editor-manifest failure. Messages are fixed and never
 * echo manifest content (docs/SECURITY.md), like
 * `RendererProductionManifestInvariantError`.
 */
export class TemplateEditorManifestInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateEditorManifestInvariantError";
  }
}

export const TEMPLATE_EDITOR_MANIFEST_ERROR_MESSAGES = Object.freeze({
  MANIFEST_NOT_PLAIN_OBJECT: "Template editor manifest must be a plain object",
  MANIFEST_KEYS:
    "Template editor manifest must have exactly the keys schemaVersion, rendererKey, mediaModel, contentItems, mediaSlots",
  SCHEMA_VERSION: "Template editor manifest schemaVersion must be exactly 1",
  RENDERER_KEY: "Template editor manifest rendererKey must be a non-empty trimmed string",
  MEDIA_MODEL: "Template editor manifest mediaModel must be LEGACY_ROLES or TEMPLATE_SLOTS",
  CONTENT_ITEMS_NOT_ARRAY: "Template editor manifest contentItems must be an array",
  CONTENT_ITEM_NOT_PLAIN_OBJECT: "Template editor manifest content item must be a plain object",
  CONTENT_ITEM_KEYS: "Template editor manifest content item must have exactly the keys key, label, hint, requirement, sectionKey",
  CONTENT_ITEM_KEY: "Template editor manifest content item key is not a known content key",
  CONTENT_ITEM_DUPLICATE: "Template editor manifest content item keys must be unique",
  CONTENT_ITEM_LABEL: "Template editor manifest content item label must be a non-empty trimmed string",
  CONTENT_ITEM_HINT: "Template editor manifest content item hint must be a non-empty trimmed string",
  CONTENT_ITEM_REQUIREMENT: "Template editor manifest content item requirement must be REQUIRED, RECOMMENDED or OPTIONAL",
  CONTENT_ITEM_REQUIRED_NOT_ALLOWED: "Template editor manifest content item may be REQUIRED only for COUPLE or EVENTS",
  CONTENT_ITEM_SECTION_KEY: "Template editor manifest content item sectionKey does not match its content key",
  MEDIA_SLOTS_NOT_ARRAY: "Template editor manifest mediaSlots must be an array",
  MEDIA_SLOT_NOT_PLAIN_OBJECT: "Template editor manifest media slot must be a plain object",
  MEDIA_SLOT_KEYS:
    "Template editor manifest media slot must have exactly the keys key, label, hint, cardinality, requirement, minCount, recommendedCount, maxCount, orientation, aspectRatioHint, sectionKey",
  MEDIA_SLOT_KEY: "Template editor manifest media slot key must be lower camelCase (1-48 characters)",
  MEDIA_SLOT_KEY_SEMANTIC: "Template editor manifest media slot key must name a position, not a person or side",
  MEDIA_SLOT_DUPLICATE: "Template editor manifest media slot keys must be unique",
  MEDIA_SLOT_LABEL: "Template editor manifest media slot label must be a non-empty trimmed string",
  MEDIA_SLOT_HINT: "Template editor manifest media slot hint must be a non-empty trimmed string",
  MEDIA_SLOT_CARDINALITY: "Template editor manifest media slot cardinality must be SINGLE or ORDERED_MULTI",
  MEDIA_SLOT_REQUIREMENT: "Template editor manifest media slot requirement must be RECOMMENDED or OPTIONAL",
  MEDIA_SLOT_MIN_COUNT: "Template editor manifest media slot minCount must be 0",
  MEDIA_SLOT_RECOMMENDED_COUNT: "Template editor manifest media slot recommendedCount must be a non-negative safe integer",
  MEDIA_SLOT_MAX_COUNT: "Template editor manifest media slot maxCount must be a positive safe integer or null",
  MEDIA_SLOT_RECOMMENDED_ABOVE_MAX: "Template editor manifest media slot recommendedCount must not exceed maxCount",
  MEDIA_SLOT_SINGLE_MAX: "Template editor manifest SINGLE media slot must have maxCount 1",
  MEDIA_SLOT_ORIENTATION: "Template editor manifest media slot orientation must be ANY, PORTRAIT, LANDSCAPE or SQUARE",
  MEDIA_SLOT_ASPECT_RATIO_HINT: 'Template editor manifest media slot aspectRatioHint must be null or a "W:H" ratio',
  MEDIA_SLOT_SECTION_KEY: "Template editor manifest media slot sectionKey must be null or a renderer section key",
  LEGACY_ROLES_WITH_SLOTS: "Template editor manifest with mediaModel LEGACY_ROLES must have no media slots",
  TEMPLATE_SLOTS_WITHOUT_SLOTS: "Template editor manifest with mediaModel TEMPLATE_SLOTS must have at least one media slot",
} as const);

const MESSAGES = TEMPLATE_EDITOR_MANIFEST_ERROR_MESSAGES;

const MANIFEST_KEYS = [
  "schemaVersion",
  "rendererKey",
  "mediaModel",
  "contentItems",
  "mediaSlots",
] as const satisfies readonly (keyof TemplateEditorManifestV1)[];

const CONTENT_ITEM_KEYS = [
  "key",
  "label",
  "hint",
  "requirement",
  "sectionKey",
] as const satisfies readonly (keyof TemplateEditorContentItemV1)[];

const MEDIA_SLOT_KEYS = [
  "key",
  "label",
  "hint",
  "cardinality",
  "requirement",
  "minCount",
  "recommendedCount",
  "maxCount",
  "orientation",
  "aspectRatioHint",
  "sectionKey",
] as const satisfies readonly (keyof TemplateEditorMediaSlotV1)[];

function fail(message: string): never {
  throw new TemplateEditorManifestInvariantError(message);
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

/**
 * A real array whose own keys are exactly its indices plus `length`, every
 * index a data property: no holes, accessors or extra properties.
 */
function isExactDataArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return false;
  }
  const indices = Array.from({ length: value.length }, (_, index) => String(index));
  return hasExactDataKeys(value, [...indices, "length"]);
}

function isTrimmedNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isMember<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validateContentItem(value: unknown): TemplateEditorContentItemV1 {
  if (!isPlainObject(value)) {
    fail(MESSAGES.CONTENT_ITEM_NOT_PLAIN_OBJECT);
  }
  if (!hasExactDataKeys(value, CONTENT_ITEM_KEYS)) {
    fail(MESSAGES.CONTENT_ITEM_KEYS);
  }
  const { key, label, hint, requirement, sectionKey } = value;
  if (!isMember(TEMPLATE_EDITOR_CONTENT_KEYS, key)) {
    fail(MESSAGES.CONTENT_ITEM_KEY);
  }
  if (!isTrimmedNonEmptyString(label)) {
    fail(MESSAGES.CONTENT_ITEM_LABEL);
  }
  if (!isTrimmedNonEmptyString(hint)) {
    fail(MESSAGES.CONTENT_ITEM_HINT);
  }
  if (!isMember(TEMPLATE_EDITOR_CONTENT_REQUIREMENTS, requirement)) {
    fail(MESSAGES.CONTENT_ITEM_REQUIREMENT);
  }
  if (requirement === "REQUIRED" && !TEMPLATE_EDITOR_REQUIRABLE_CONTENT_KEYS.includes(key)) {
    fail(MESSAGES.CONTENT_ITEM_REQUIRED_NOT_ALLOWED);
  }
  if (sectionKey !== TEMPLATE_EDITOR_CONTENT_SECTION_KEYS[key]) {
    fail(MESSAGES.CONTENT_ITEM_SECTION_KEY);
  }
  return { key, label, hint, requirement, sectionKey: TEMPLATE_EDITOR_CONTENT_SECTION_KEYS[key] };
}

function validateMediaSlot(value: unknown): TemplateEditorMediaSlotV1 {
  if (!isPlainObject(value)) {
    fail(MESSAGES.MEDIA_SLOT_NOT_PLAIN_OBJECT);
  }
  if (!hasExactDataKeys(value, MEDIA_SLOT_KEYS)) {
    fail(MESSAGES.MEDIA_SLOT_KEYS);
  }
  const { key, label, hint, cardinality, requirement, minCount, recommendedCount, maxCount, orientation, aspectRatioHint, sectionKey } =
    value;
  if (typeof key !== "string" || !TEMPLATE_EDITOR_SLOT_KEY_PATTERN.test(key)) {
    fail(MESSAGES.MEDIA_SLOT_KEY);
  }
  if (TEMPLATE_EDITOR_SLOT_KEY_FORBIDDEN_WORDS.test(key)) {
    fail(MESSAGES.MEDIA_SLOT_KEY_SEMANTIC);
  }
  if (!isTrimmedNonEmptyString(label)) {
    fail(MESSAGES.MEDIA_SLOT_LABEL);
  }
  if (!isTrimmedNonEmptyString(hint)) {
    fail(MESSAGES.MEDIA_SLOT_HINT);
  }
  if (!isMember(TEMPLATE_EDITOR_SLOT_CARDINALITIES, cardinality)) {
    fail(MESSAGES.MEDIA_SLOT_CARDINALITY);
  }
  if (!isMember(TEMPLATE_EDITOR_SLOT_REQUIREMENTS, requirement)) {
    fail(MESSAGES.MEDIA_SLOT_REQUIREMENT);
  }
  if (minCount !== 0) {
    fail(MESSAGES.MEDIA_SLOT_MIN_COUNT);
  }
  if (!isNonNegativeSafeInteger(recommendedCount)) {
    fail(MESSAGES.MEDIA_SLOT_RECOMMENDED_COUNT);
  }
  if (maxCount !== null && (!isNonNegativeSafeInteger(maxCount) || maxCount === 0)) {
    fail(MESSAGES.MEDIA_SLOT_MAX_COUNT);
  }
  if (maxCount !== null && recommendedCount > maxCount) {
    fail(MESSAGES.MEDIA_SLOT_RECOMMENDED_ABOVE_MAX);
  }
  if (cardinality === "SINGLE" && maxCount !== 1) {
    fail(MESSAGES.MEDIA_SLOT_SINGLE_MAX);
  }
  if (!isMember(TEMPLATE_EDITOR_SLOT_ORIENTATIONS, orientation)) {
    fail(MESSAGES.MEDIA_SLOT_ORIENTATION);
  }
  if (aspectRatioHint !== null && (typeof aspectRatioHint !== "string" || !TEMPLATE_EDITOR_ASPECT_RATIO_HINT_PATTERN.test(aspectRatioHint))) {
    fail(MESSAGES.MEDIA_SLOT_ASPECT_RATIO_HINT);
  }
  if (sectionKey !== null && !isMember(RENDERER_SECTION_KEYS, sectionKey)) {
    fail(MESSAGES.MEDIA_SLOT_SECTION_KEY);
  }
  return {
    key,
    label,
    hint,
    cardinality,
    requirement,
    minCount: 0,
    recommendedCount,
    maxCount,
    orientation,
    aspectRatioHint,
    sectionKey,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Validates one untrusted editor manifest in a fixed fail-fast order and
 * returns a fresh, deeply frozen copy that shares no object with the input.
 * Nothing is coerced, normalized, deduplicated or repaired. Renderer-specific
 * checks (key registration, section capabilities) belong to the production
 * editor registry, which knows the production renderer manifests.
 *
 * 1. exact top-level own data keys;
 * 2. schemaVersion, rendererKey, mediaModel;
 * 3. contentItems: exact data array, each item, unique keys;
 * 4. mediaSlots: exact data array, each slot, unique keys;
 * 5. mediaModel vs slot count.
 */
export function validateTemplateEditorManifest(value: unknown): TemplateEditorManifestV1 {
  if (!isPlainObject(value)) {
    fail(MESSAGES.MANIFEST_NOT_PLAIN_OBJECT);
  }
  if (!hasExactDataKeys(value, MANIFEST_KEYS)) {
    fail(MESSAGES.MANIFEST_KEYS);
  }
  const { schemaVersion, rendererKey, mediaModel, contentItems, mediaSlots } = value;
  if (schemaVersion !== 1) {
    fail(MESSAGES.SCHEMA_VERSION);
  }
  if (!isTrimmedNonEmptyString(rendererKey)) {
    fail(MESSAGES.RENDERER_KEY);
  }
  if (!isMember(TEMPLATE_EDITOR_MEDIA_MODELS, mediaModel)) {
    fail(MESSAGES.MEDIA_MODEL);
  }

  if (!isExactDataArray(contentItems)) {
    fail(MESSAGES.CONTENT_ITEMS_NOT_ARRAY);
  }
  const validatedItems = contentItems.map((item) => validateContentItem(item));
  if (new Set(validatedItems.map((item) => item.key)).size !== validatedItems.length) {
    fail(MESSAGES.CONTENT_ITEM_DUPLICATE);
  }

  if (!isExactDataArray(mediaSlots)) {
    fail(MESSAGES.MEDIA_SLOTS_NOT_ARRAY);
  }
  const validatedSlots = mediaSlots.map((slot) => validateMediaSlot(slot));
  if (new Set(validatedSlots.map((slot) => slot.key)).size !== validatedSlots.length) {
    fail(MESSAGES.MEDIA_SLOT_DUPLICATE);
  }

  if (mediaModel === "LEGACY_ROLES" && validatedSlots.length !== 0) {
    fail(MESSAGES.LEGACY_ROLES_WITH_SLOTS);
  }
  if (mediaModel === "TEMPLATE_SLOTS" && validatedSlots.length === 0) {
    fail(MESSAGES.TEMPLATE_SLOTS_WITHOUT_SLOTS);
  }

  return deepFreeze({
    schemaVersion: 1,
    rendererKey,
    mediaModel,
    contentItems: validatedItems,
    mediaSlots: validatedSlots,
  });
}
