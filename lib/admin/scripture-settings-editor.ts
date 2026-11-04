import type { TemplateDesignManifestV1 } from "../domain";
import type { ProjectDesignRecord } from "../server/project-design/project-design-types";
import type { DesignAssignmentBody } from "./design-assignment";
import type { FormResult } from "./optional-content-editor";

/**
 * HA-CONTENT-01 — pure Staff-editor logic for the configurable Scripture
 * quote (`wedding.hong-an.v2`'s two optional design settings).
 *
 * No React, no I/O: the card is a thin shell over these functions, so the
 * merge, the blank-clears-override rule, the limits and the concurrency
 * guard are all unit-testable without a browser.
 *
 * It is NOT template-specific backend behaviour (CLAUDE.md §25): nothing
 * here is on a server path, and the server validates the result against the
 * exact pinned version's own manifest as it does every other design write.
 * The card is offered by what the selected version's design manifest
 * DECLARES, never by a renderer key, so a later version that declares the
 * same settings gets the card with no change here.
 */

export const SCRIPTURE_VERSE_SETTING_KEY = "scriptureVerse";
export const SCRIPTURE_REFERENCE_SETTING_KEY = "scriptureReference";

/**
 * Art-direction limits, enforced here and in the inputs' own `maxLength`.
 * They are deliberately NOT a trust boundary: `ManifestSettingSpec` cannot
 * express a maximum length, and the design API's own 20000-character cap
 * (validate-save-project-design-input.ts) still applies to every setting
 * value server-side. A verse long enough to break the composition is a
 * staff mistake to prevent, not an attack to defend against.
 */
export const SCRIPTURE_VERSE_MAX_LENGTH = 500;
export const SCRIPTURE_REFERENCE_MAX_LENGTH = 80;

/**
 * The template's own approved default copy, shown so Staff can see what an
 * override replaces. Deliberately duplicated from
 * `templates/wedding/hong-an/v2/copy.ts` rather than imported: the Staff
 * editor must not reach into an immutable renderer-version directory, and
 * the default belongs to the renderer version, not to this screen. A
 * focused test pins these two strings to that module's own values, so they
 * can never drift apart.
 */
export const SCRIPTURE_DEFAULT_VERSE = "Điều gì Thiên Chúa đã liên kết thì con người không được phân ly.";
export const SCRIPTURE_DEFAULT_REFERENCE = "Mt 19,6";

export interface ScriptureForm {
  verse: string;
  reference: string;
}

/**
 * True when the selected version's design manifest declares BOTH settings as
 * optional strings. Both, because the card edits both; a version declaring
 * only one would get no card rather than a half-working one.
 */
export function declaresScriptureSettings(manifest: TemplateDesignManifestV1): boolean {
  const schema = manifest.designSettingsSchema;
  for (const key of [SCRIPTURE_VERSE_SETTING_KEY, SCRIPTURE_REFERENCE_SETTING_KEY]) {
    const spec = Object.prototype.hasOwnProperty.call(schema, key) ? schema[key] : undefined;
    if (spec === undefined || spec.type !== "string") {
      return false;
    }
  }
  return true;
}

function storedText(design: ProjectDesignRecord | null, key: string): string {
  if (design === null) {
    return "";
  }
  const settings = design.designSettings;
  const value = Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : undefined;
  return typeof value === "string" ? value : "";
}

/**
 * The form's starting values: the Project's own override, or empty. Empty
 * means "no override" and renders the template default — never the default
 * text prefilled into the field, which would turn the default into a stored
 * override on the next save.
 */
export function scriptureFormFrom(design: ProjectDesignRecord | null): ScriptureForm {
  return {
    verse: storedText(design, SCRIPTURE_VERSE_SETTING_KEY),
    reference: storedText(design, SCRIPTURE_REFERENCE_SETTING_KEY),
  };
}

/** The empty form: saving it clears both overrides and restores the defaults. */
export function scriptureDefaultForm(): ScriptureForm {
  return { verse: "", reference: "" };
}

export function hasScriptureOverride(design: ProjectDesignRecord | null): boolean {
  const form = scriptureFormFrom(design);
  return form.verse.trim() !== "" || form.reference.trim() !== "";
}

/**
 * Plain text only. The renderer prints these as React text nodes, so markup
 * could never execute — it would simply render as visible angle brackets in
 * the middle of a Scripture quote. Rejecting it here keeps the invitation
 * honest and tells Staff why, instead of silently shipping literal tags.
 */
const MARKUP_PATTERN = /[<>]/;

function parseField(raw: string, label: string, maxLength: number): FormResult<string | undefined> {
  // Inner line breaks are kept; only outer whitespace is trimmed, matching
  // the design API's own normalization of a setting value.
  const value = raw.trim();
  if (value === "") {
    // Blank is not an empty override: the key is omitted entirely, because
    // the design API rejects a blank setting value outright.
    return { ok: true, value: undefined };
  }
  if (value.length > maxLength) {
    return { ok: false, error: `${label} tối đa ${String(maxLength)} ký tự.` };
  }
  if (MARKUP_PATTERN.test(value)) {
    return { ok: false, error: `${label} chỉ nhận văn bản thuần, không dùng dấu < hoặc >.` };
  }
  return { ok: true, value };
}

/**
 * Builds the full-replace `PUT .../design` body (docs/API_CONTRACT.md §13.3)
 * for one Scripture edit.
 *
 * FULL REPLACE, NOT A PATCH. The design PUT replaces all six editable
 * fields, so `current` must be the LATEST record, re-read immediately before
 * saving. Every unrelated field — the template version, the palette, the
 * font and effect presets, every section setting and every other design
 * setting — is carried over exactly, so a section toggled elsewhere is never
 * reverted by this card.
 *
 * CONCURRENCY. `expectedTemplateVersionId` is the version the card was shown
 * for. If the latest record pins a different one, someone changed the
 * template assignment meanwhile: saving would write this template's settings
 * onto another template's design (and the server would reject them as
 * undeclared anyway), so the save is refused with an explanation and the
 * staff member can reload.
 */
export function buildScriptureDesignBody(
  current: ProjectDesignRecord | null,
  form: ScriptureForm,
  expectedTemplateVersionId: string,
): FormResult<DesignAssignmentBody> {
  if (current === null) {
    return { ok: false, error: "Dự án chưa chọn mẫu thiệp." };
  }
  if (current.templateVersionId !== expectedTemplateVersionId) {
    return { ok: false, error: "Mẫu thiệp của dự án vừa được thay đổi. Hãy tải lại trang trước khi lưu." };
  }

  const verse = parseField(form.verse, "Nội dung câu Lời Chúa", SCRIPTURE_VERSE_MAX_LENGTH);
  if (!verse.ok) return verse;
  const reference = parseField(form.reference, "Nguồn trích dẫn", SCRIPTURE_REFERENCE_MAX_LENGTH);
  if (!reference.ok) return reference;

  // Every other design setting is preserved; only these two keys are set or
  // removed. `Object.create(null)`-safe: own string keys only, copied as data.
  const designSettings: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(current.designSettings)) {
    if (key !== SCRIPTURE_VERSE_SETTING_KEY && key !== SCRIPTURE_REFERENCE_SETTING_KEY) {
      designSettings[key] = current.designSettings[key];
    }
  }
  if (verse.value !== undefined) designSettings[SCRIPTURE_VERSE_SETTING_KEY] = verse.value;
  if (reference.value !== undefined) designSettings[SCRIPTURE_REFERENCE_SETTING_KEY] = reference.value;

  return {
    ok: true,
    value: {
      templateVersionId: current.templateVersionId,
      paletteKey: current.paletteKey,
      fontPresetKey: current.fontPresetKey,
      effectPresetKey: current.effectPresetKey,
      sectionSettings: { ...current.sectionSettings },
      designSettings,
    },
  };
}
