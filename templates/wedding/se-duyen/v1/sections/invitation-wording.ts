/**
 * Se Duyên v1 — the customer's invitation sentence on the ivory plate
 * (SD-V1-01). Pure string work: no React, no data access, no business rule.
 *
 * APPROVED BEHAVIOUR, carried over from the pilot v03 freeze. The plate
 * shows the salutation, then the guest on its own line, then the customer's
 * own sentence — without saying anything twice:
 *
 * - the sentence is split at its `{guest}` token and BOTH halves are kept:
 *   what comes before the guest is printed above the guest line, what comes
 *   after below it, so no customer wording is ever dropped;
 * - the one thing skipped is a lead that merely repeats the salutation
 *   already set on its own line above ("Trân trọng kính mời"), which is how
 *   the default wording reads;
 * - a sentence with no `{guest}` token has nothing to duplicate and is
 *   printed whole, below the guest line.
 *
 * WHAT THIS MODULE IS NOT. It decides nothing about the wedding. The
 * ceremony title it substitutes is `viewModel.ceremony.title` — already
 * resolved by the one central variant resolver ("Lễ Thành Hôn" for
 * COMMON/GROOM, "Lễ Vu Quy" for BRIDE) — and the guest text is the
 * already-authorized overlay display name or the fixed default line. This
 * module only places values it is handed into the customer's own sentence,
 * which is presentation (CLAUDE.md §6).
 *
 * THE TWO SUPPORTED TOKENS (SD-V1-RELEASE-01). `{guest}` and
 * `{ceremonyTitle}`, case-sensitively, are the whole approved vocabulary;
 * they are the prototype's tokens, now contracted. This module stays the
 * only place that resolves them — Se Duyên is the only renderer that prints
 * a customer sentence at all, since the six others declare
 * `invitationMessage: false`.
 *
 * ANY OTHER `{...}` IS REJECTED BEFORE PUBLICATION, not rendered. The
 * vocabulary is mirrored server-side in
 * `lib/server/invitation-review/publication-readiness.ts`, which blocks
 * REVIEW creation on an unsupported or malformed placeholder, so one can no
 * longer reach a guest verbatim. A focused test pins the two patterns below
 * to that server list, so they cannot drift apart. Nothing here rewrites the
 * customer's wording: a sentence that passes is printed exactly as saved.
 */

const GUEST_TOKEN = "{guest}";
const GUEST_TOKEN_PATTERN = /\{guest\}/g;
const CEREMONY_TITLE_TOKEN_PATTERN = /\{ceremonyTitle\}/g;

export interface InvitationWording {
  /** Printed above the guest line; empty when there is none to print. */
  readonly lead: string;
  /** Printed below the guest line; empty when there is none to print. */
  readonly body: string;
}

/**
 * Loose comparison — case, collapsed whitespace and trailing punctuation
 * aside — used only to notice that the sentence's lead is the salutation
 * already printed above it. Nothing is dropped on a near-match of real
 * wording: both sides must normalize to exactly the same string.
 */
function sameWording(a: string, b: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:…!?]+$/u, "").trim();
  const normalized = normalize(a);
  return normalized !== "" && normalized === normalize(b);
}

function substitute(part: string, guestText: string, ceremonyTitle: string): string {
  return part.replace(GUEST_TOKEN_PATTERN, guestText).replace(CEREMONY_TITLE_TOKEN_PATTERN, ceremonyTitle).trim();
}

export interface InvitationWordingInput {
  /** `viewModel.content.invitationMessage`, exactly as the customer saved it. */
  readonly message: string | null;
  /** The text already printed on the guest line, for the tokens inside the halves. */
  readonly guestText: string;
  /** The salutation printed on its own line above, for the repeat check. */
  readonly salutation: string;
  /** `viewModel.ceremony.title` — the variant resolver's own value. */
  readonly ceremonyTitle: string;
}

export function buildInvitationWording({
  message,
  guestText,
  salutation,
  ceremonyTitle,
}: InvitationWordingInput): InvitationWording {
  const template = message ?? "";
  if (template.trim() === "") return { lead: "", body: "" };

  const guestTokenAt = template.indexOf(GUEST_TOKEN);
  if (guestTokenAt < 0) {
    return { lead: "", body: substitute(template, guestText, ceremonyTitle) };
  }

  const lead = substitute(template.slice(0, guestTokenAt), guestText, ceremonyTitle);
  return {
    lead: sameWording(lead, salutation) ? "" : lead,
    body: substitute(template.slice(guestTokenAt + GUEST_TOKEN.length), guestText, ceremonyTitle),
  };
}
