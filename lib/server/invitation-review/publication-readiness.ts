import type { SnapshotPayloadV1 } from "../../invitation-rendering/snapshot-payload-types";

/**
 * SD-V1-RELEASE-01 — renderer-scoped publication readiness, checked on the
 * one path into the publication pipeline.
 *
 * WHY HERE. `publish_invitation` (migration 0038) publishes by copying an
 * already approved REVIEW version and inspects no content; a REVIEW can only
 * come from `createReviewVersion`. Gating REVIEW creation therefore gates
 * publication, without touching the shared publish RPC or the frozen RF-02
 * Snapshot builder, and without changing behaviour for any other template:
 * an unlisted renderer key returns no issues at all.
 *
 * WHY NOT IN THE RENDERER OR THE EDITOR MANIFEST. A template is presentation
 * and must not own workflow rules (CLAUDE.md §6), and the V1 editor contract
 * cannot express "at least one photograph somewhere" — every slot `minCount`
 * is 0 and no media slot may be REQUIRED (TE-01 T10). This is a server
 * trust-boundary rule (CLAUDE.md §15), so it lives server-side.
 */

export type PublicationReadinessIssueCode =
  | "SE_DUYEN_CUSTOMER_PHOTO_REQUIRED"
  | "SE_DUYEN_UNSUPPORTED_WORDING_TOKEN";

/** Shaped exactly like a `SnapshotPayloadIssue` so Staff sees one issue list. */
export interface PublicationReadinessIssue {
  code: PublicationReadinessIssueCode;
  severity: "BLOCKING";
  message: string;
}

const SE_DUYEN_RENDERER_KEY = "wedding.se-duyen.v1";

/**
 * The only placeholders the Se Duyên renderer resolves — it substitutes
 * exactly these two, case-sensitively (`templates/wedding/se-duyen/v1/
 * sections/invitation-wording.ts`). A focused test pins that module's own
 * patterns to this list, so the two can never drift apart.
 */
export const SE_DUYEN_SUPPORTED_WORDING_TOKENS = ["{guest}", "{ceremonyTitle}"] as const;

/**
 * Every brace-delimited run, plus any brace left unpaired. A lone `{` or `}`
 * is matched on its own so `"{guest"` is reported rather than passed over as
 * ordinary text, which is what "never silently publish an unresolved
 * placeholder" requires.
 */
const PLACEHOLDER_PATTERN = /\{[^{}]*\}|[{}]/g;

/** At most this many offending placeholders are quoted back to Staff. */
const MAX_REPORTED_TOKENS = 3;

function slotPhotoCount(snapshot: SnapshotPayloadV1): number {
  const slots = snapshot.media.templateSlots;
  if (slots === undefined) return 0;
  return Object.values(slots).reduce((total, ids) => total + ids.length, 0);
}

function unsupportedPlaceholders(message: string | null): string[] {
  if (message === null) return [];
  const supported = new Set<string>(SE_DUYEN_SUPPORTED_WORDING_TOKENS);
  const offending: string[] = [];
  for (const match of message.matchAll(PLACEHOLDER_PATTERN)) {
    const found = match[0];
    if (!supported.has(found) && !offending.includes(found)) {
      offending.push(found);
    }
  }
  return offending;
}

/**
 * The Product Owner rules that must hold before a Se Duyên invitation may
 * enter review, and therefore before it can ever be published. Pure: reads
 * the built Snapshot only, in a fixed issue order, and returns `[]` for
 * every other renderer.
 *
 * 1. AT LEAST ONE GENUINE CUSTOMER PHOTOGRAPH (Product Owner, 2026-10-21),
 *    in ANY supported Se Duyên media slot — `openingPhoto`, `portraitLead`,
 *    `portraitAside`, the ordered `gallery`, or `closingPhoto`. No slot is
 *    privileged. Only real `project_media` photographs can appear here: the
 *    builder has already proved every id is a currently slot-assignable
 *    photo of this Project (`assertTemplateMediaSource`), and the renderer's
 *    own decorative artwork is CSS under the immutable version path, never
 *    Project media, so neither it nor any demo image can satisfy the rule.
 * 2. NO UNRESOLVED PLACEHOLDER in the customer's invitation sentence. The
 *    customer's wording is never rewritten — an unsupported or malformed
 *    placeholder blocks review instead, so it can never reach a guest
 *    verbatim.
 */
export function checkPublicationReadiness(snapshot: SnapshotPayloadV1): PublicationReadinessIssue[] {
  if (snapshot.template.rendererKey !== SE_DUYEN_RENDERER_KEY) return [];

  const issues: PublicationReadinessIssue[] = [];

  if (slotPhotoCount(snapshot) === 0) {
    issues.push({
      code: "SE_DUYEN_CUSTOMER_PHOTO_REQUIRED",
      severity: "BLOCKING",
      message:
        "Se Duyên requires at least one real customer photograph in any photo slot (opening, couple frames, album or closing) before review",
    });
  }

  const offending = unsupportedPlaceholders(snapshot.content.invitationMessage);
  if (offending.length > 0) {
    const quoted = offending.slice(0, MAX_REPORTED_TOKENS).join(", ");
    const more = offending.length > MAX_REPORTED_TOKENS ? `, and ${offending.length - MAX_REPORTED_TOKENS} more` : "";
    issues.push({
      code: "SE_DUYEN_UNSUPPORTED_WORDING_TOKEN",
      severity: "BLOCKING",
      message: `The invitation message contains a placeholder Se Duyên cannot resolve: ${quoted}${more}. Only ${SE_DUYEN_SUPPORTED_WORDING_TOKENS.join(" and ")} are supported`,
    });
  }

  return issues;
}
