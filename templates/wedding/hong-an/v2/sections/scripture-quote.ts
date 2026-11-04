import type { ViewModelDesign } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { HONG_AN_V2_COPY } from "../copy";

/**
 * Hồng Ân v2 — the configured Scripture quote (HA-CONTENT-01). Pure.
 *
 * THE ONE PLACE THE RULE LIVES. The quote is shown twice — small under the
 * opening hero, and given room in the "Lời Chúa" section — and both read
 * this one resolved value, so the two can never disagree. No component
 * reads `design.designSettings` itself.
 *
 * Reads the two optional settings `wedding.hong-an.v2`'s manifest declares
 * (`scriptureVerse`, `scriptureReference`). The renderer stays a renderer:
 * it does not know how they are stored, validates nothing against the
 * manifest (the server already did, against the exact pinned version) and
 * never writes.
 *
 * NEVER FALSELY ATTRIBUTES. A verse and its reference travel together but
 * are configured separately, so a Project may set one and not the other:
 *
 * - neither set        -> the template's own approved default verse AND its
 *                         default reference ("Mt 19,6");
 * - both set           -> both as authored;
 * - verse only         -> that verse with NO reference. The default
 *                         "Mt 19,6" is deliberately not reused, because
 *                         attributing someone else's chosen verse to Mt 19,6
 *                         would be a false citation of Scripture;
 * - reference only     -> the default verse with that reference. The pair is
 *                         still internally consistent: the configured
 *                         reference is a deliberate Staff value (for example
 *                         a different translation's citation of the same
 *                         verse), and the default verse really is Mt 19,6's
 *                         text, so no claim is invented.
 *
 * Values arrive already trimmed and non-empty (the design API rejects a
 * blank setting value), and a setting whose type is wrong cannot be stored
 * at all; the `typeof` guards here are a renderer-side belt-and-braces so a
 * hand-edited or legacy payload degrades to the default instead of
 * rendering `[object Object]`. Whitespace-only is treated as absent for the
 * same reason.
 */
export interface ScriptureQuote {
  readonly verse: string;
  /** Absent when a custom verse carries no reference of its own. */
  readonly reference: string | undefined;
}

/** `wedding.hong-an.v2`'s two optional design-setting keys. */
export const SCRIPTURE_VERSE_SETTING_KEY = "scriptureVerse";
export const SCRIPTURE_REFERENCE_SETTING_KEY = "scriptureReference";

function configuredText(settings: ViewModelDesign["designSettings"], key: string): string | undefined {
  const value = settings[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function resolveScriptureQuote(design: ViewModelDesign): ScriptureQuote {
  const verse = configuredText(design.designSettings, SCRIPTURE_VERSE_SETTING_KEY);
  const reference = configuredText(design.designSettings, SCRIPTURE_REFERENCE_SETTING_KEY);

  if (verse === undefined) {
    // No configured verse: the approved default copy, reference and all.
    return { verse: HONG_AN_V2_COPY.scripture.verse, reference: reference ?? HONG_AN_V2_COPY.scripture.reference };
  }

  // A configured verse is never attributed to the default reference.
  return { verse, reference };
}
