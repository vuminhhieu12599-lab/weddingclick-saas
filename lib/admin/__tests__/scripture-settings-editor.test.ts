import { describe, expect, it } from "vitest";

import { HONG_AN_V1_MANIFEST } from "../../../templates/wedding/hong-an/v1/manifest";
import { HONG_AN_V2_COPY } from "../../../templates/wedding/hong-an/v2/copy";
import { HONG_AN_V2_MANIFEST } from "../../../templates/wedding/hong-an/v2/manifest";
import type { ProjectDesignRecord } from "../../server/project-design/project-design-types";
import {
  buildScriptureDesignBody,
  declaresScriptureSettings,
  hasScriptureOverride,
  SCRIPTURE_DEFAULT_REFERENCE,
  SCRIPTURE_DEFAULT_VERSE,
  SCRIPTURE_REFERENCE_MAX_LENGTH,
  SCRIPTURE_VERSE_MAX_LENGTH,
  scriptureDefaultForm,
  scriptureFormFrom,
} from "../scripture-settings-editor";

/**
 * HA-CONTENT-01 — the Staff editor's pure logic: what the card is offered
 * for, what it prefills, and exactly what body it sends.
 */

const VERSION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_VERSION_ID = "22222222-2222-4222-8222-222222222222";

function design(overrides: Partial<ProjectDesignRecord> = {}): ProjectDesignRecord {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    projectId: "44444444-4444-4444-8444-444444444444",
    templateVersionId: VERSION_ID,
    paletteKey: "hong-an-ivory",
    fontPresetKey: "hong-an-cathedral",
    effectPresetKey: "STANDARD",
    sectionSettings: {},
    designSettings: {},
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

describe("the default copy is the renderer's own", () => {
  it("matches templates/wedding/hong-an/v2/copy.ts exactly (never drifts)", () => {
    // Deliberately duplicated rather than imported by the editor, so the
    // Staff UI does not reach into an immutable renderer-version directory.
    // This test is what keeps the two equal.
    expect(SCRIPTURE_DEFAULT_VERSE).toBe(HONG_AN_V2_COPY.scripture.verse);
    expect(SCRIPTURE_DEFAULT_REFERENCE).toBe(HONG_AN_V2_COPY.scripture.reference);
  });
});

describe("declaresScriptureSettings", () => {
  it("offers the card for a manifest declaring both settings as strings", () => {
    expect(declaresScriptureSettings(HONG_AN_V2_MANIFEST.design)).toBe(true);
  });

  it("offers it for no other template — v1 included", () => {
    expect(declaresScriptureSettings(HONG_AN_V1_MANIFEST.design)).toBe(false);
    expect(declaresScriptureSettings({ ...HONG_AN_V2_MANIFEST.design, designSettingsSchema: {} })).toBe(false);
  });

  it("needs BOTH keys, and both of type string", () => {
    expect(
      declaresScriptureSettings({
        ...HONG_AN_V2_MANIFEST.design,
        designSettingsSchema: { scriptureVerse: { type: "string" } },
      }),
    ).toBe(false);
    expect(
      declaresScriptureSettings({
        ...HONG_AN_V2_MANIFEST.design,
        designSettingsSchema: { scriptureVerse: { type: "string" }, scriptureReference: { type: "boolean" } },
      }),
    ).toBe(false);
  });

  it("never reads an inherited property as a declared setting", () => {
    const polluted = Object.create({ scriptureVerse: { type: "string" }, scriptureReference: { type: "string" } }) as Record<
      string,
      never
    >;
    expect(declaresScriptureSettings({ ...HONG_AN_V2_MANIFEST.design, designSettingsSchema: polluted })).toBe(false);
  });
});

describe("scriptureFormFrom", () => {
  it("starts empty with no override — the default is never prefilled", () => {
    // Prefilling would quietly turn the template default into a stored
    // override on the next save.
    expect(scriptureFormFrom(design())).toStrictEqual({ verse: "", reference: "" });
    expect(scriptureFormFrom(null)).toStrictEqual({ verse: "", reference: "" });
    expect(hasScriptureOverride(design())).toBe(false);
  });

  it("shows the Project's stored override", () => {
    const current = design({ designSettings: { scriptureVerse: "Câu riêng.", scriptureReference: "Ga 2,1" } });
    expect(scriptureFormFrom(current)).toStrictEqual({ verse: "Câu riêng.", reference: "Ga 2,1" });
    expect(hasScriptureOverride(current)).toBe(true);
  });

  it("ignores a non-string stored value instead of showing it", () => {
    expect(scriptureFormFrom(design({ designSettings: { scriptureVerse: 7 } })).verse).toBe("");
  });
});

describe("buildScriptureDesignBody — full replace", () => {
  it("preserves every unrelated design field and setting", () => {
    const current = design({
      sectionSettings: { gallery: false, music: true },
      designSettings: { someOtherSetting: "keep me", scriptureVerse: "old" },
    });
    const built = buildScriptureDesignBody(current, { verse: "Câu mới.", reference: "Mt 1,1" }, VERSION_ID);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value).toStrictEqual({
      templateVersionId: VERSION_ID,
      paletteKey: "hong-an-ivory",
      fontPresetKey: "hong-an-cathedral",
      effectPresetKey: "STANDARD",
      sectionSettings: { gallery: false, music: true },
      designSettings: { someOtherSetting: "keep me", scriptureVerse: "Câu mới.", scriptureReference: "Mt 1,1" },
    });
  });

  it("omits a blank field entirely, so the template default comes back", () => {
    const current = design({ designSettings: { scriptureVerse: "old", scriptureReference: "old ref" } });
    const built = buildScriptureDesignBody(current, scriptureDefaultForm(), VERSION_ID);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Not `""`: the design API rejects a blank setting value outright, and an
    // empty string would be a stale override rather than no override.
    expect(built.value.designSettings).toStrictEqual({});
    expect("scriptureVerse" in built.value.designSettings).toBe(false);
  });

  it("clears only one side when only one is blank", () => {
    const current = design({ designSettings: { scriptureVerse: "old", scriptureReference: "old ref" } });
    const built = buildScriptureDesignBody(current, { verse: "Câu mới.", reference: "  " }, VERSION_ID);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.designSettings).toStrictEqual({ scriptureVerse: "Câu mới." });
  });

  it("trims outer whitespace and keeps inner line breaks", () => {
    const built = buildScriptureDesignBody(design(), { verse: "  dòng một\ndòng hai  ", reference: " Mt 1,1 " }, VERSION_ID);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.designSettings).toStrictEqual({ scriptureVerse: "dòng một\ndòng hai", scriptureReference: "Mt 1,1" });
  });

  it("refuses a verse over 500 or a reference over 80 characters", () => {
    const longVerse = buildScriptureDesignBody(design(), { verse: "x".repeat(SCRIPTURE_VERSE_MAX_LENGTH + 1), reference: "" }, VERSION_ID);
    expect(longVerse).toStrictEqual({ ok: false, error: "Nội dung câu Lời Chúa tối đa 500 ký tự." });
    const longRef = buildScriptureDesignBody(
      design(),
      { verse: "", reference: "x".repeat(SCRIPTURE_REFERENCE_MAX_LENGTH + 1) },
      VERSION_ID,
    );
    expect(longRef).toStrictEqual({ ok: false, error: "Nguồn trích dẫn tối đa 80 ký tự." });
    // Exactly at the limit is accepted (the limit counts the trimmed value).
    const atLimit = buildScriptureDesignBody(design(), { verse: "x".repeat(SCRIPTURE_VERSE_MAX_LENGTH), reference: "" }, VERSION_ID);
    expect(atLimit.ok).toBe(true);
  });

  it("refuses markup: the quote is plain text", () => {
    const built = buildScriptureDesignBody(design(), { verse: "<b>Câu</b>", reference: "" }, VERSION_ID);
    expect(built).toStrictEqual({
      ok: false,
      error: "Nội dung câu Lời Chúa chỉ nhận văn bản thuần, không dùng dấu < hoặc >.",
    });
  });

  it("refuses to save when the template assignment changed meanwhile", () => {
    // The concurrency guard: saving would write this template's settings onto
    // another template's design.
    const built = buildScriptureDesignBody(design({ templateVersionId: OTHER_VERSION_ID }), { verse: "Câu.", reference: "" }, VERSION_ID);
    expect(built).toStrictEqual({
      ok: false,
      error: "Mẫu thiệp của dự án vừa được thay đổi. Hãy tải lại trang trước khi lưu.",
    });
  });

  it("refuses to save when the Project has no design row at all", () => {
    expect(buildScriptureDesignBody(null, { verse: "Câu.", reference: "" }, VERSION_ID)).toStrictEqual({
      ok: false,
      error: "Dự án chưa chọn mẫu thiệp.",
    });
  });

  it("sends a body the design API accepts: exactly the six editable fields", () => {
    const built = buildScriptureDesignBody(design(), { verse: "Câu.", reference: "Mt 1,1" }, VERSION_ID);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(Object.keys(built.value).sort()).toStrictEqual([
      "designSettings",
      "effectPresetKey",
      "fontPresetKey",
      "paletteKey",
      "sectionSettings",
      "templateVersionId",
    ]);
  });

  it("never carries a server-owned field the API would reject", () => {
    const built = buildScriptureDesignBody(design(), { verse: "Câu.", reference: "" }, VERSION_ID);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    for (const forbidden of ["id", "projectId", "createdAt", "updatedAt", "rendererKey"]) {
      expect(forbidden in built.value, forbidden).toBe(false);
    }
  });
});
