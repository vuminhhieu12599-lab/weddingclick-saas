import { MEDIA_TYPES } from "../domain";
import type { ProjectEventRecord } from "../server/project-events/project-events-types";
import { resolveWeddingDomain } from "./resolve-wedding-domain";
import {
  SNAPSHOT_PAYLOAD_SCHEMA_VERSION,
  type BuildSnapshotPayloadInput,
  type BuildSnapshotPayloadResult,
  type SnapshotBuilderIssue,
  type SnapshotDesign,
  type SnapshotDesignSettingValue,
  type SnapshotEvent,
  type SnapshotGift,
  type SnapshotGiftSide,
  type SnapshotMedia,
  type SnapshotMediaSource,
  type SnapshotPayloadIssue,
  type SnapshotPayloadV1,
  type SnapshotQrMedia,
  type SnapshotSections,
  type SnapshotWeddingDetailsSource,
} from "./snapshot-payload-types";
import type { CoupleSide, ResolvedWeddingDomain } from "./wedding-domain-types";

/**
 * Thrown only when the input breaks a guarantee the canonical data layer or
 * the caller's loading step already owns (same Project for every source,
 * the design's exact pinned template version, PK-unique media ids,
 * CHECK-constrained media type, flat Task 028 settings JSON). It signals a
 * programming/data-integrity fault, never a business outcome — business
 * outcomes are reported as BLOCKING issues. Mirrors RF-01's
 * `WeddingDomainInvariantError`.
 */
export class SnapshotPayloadInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotPayloadInvariantError";
  }
}

/**
 * RF-02 Snapshot Payload v1 builder (docs/DECISIONS.md RF11 and "RF-02
 * Snapshot Sections Contract Clarification" S1–S14).
 *
 * Pure and deterministic. Every payload field is an explicit projection:
 * no source object is spread, so unknown runtime keys cannot leak. Inputs
 * are never mutated and the payload shares no mutable object with them.
 * RF-01 `resolveWeddingDomain` owns visibility, event order, ceremony
 * selection, sides and ceremony title; this builder only consumes it.
 */
export function buildSnapshotPayload(input: BuildSnapshotPayloadInput): BuildSnapshotPayloadResult {
  const { project, variant, weddingDetails, events, media, design, templateVersion } = input;

  assertSourceInvariants(input);

  // S13a step 1 — source presence. No fake record, no name issues, no resolver call.
  if (weddingDetails === null) {
    return {
      status: "BLOCKED",
      issues: [
        {
          code: "WEDDING_DETAILS_MISSING",
          severity: "BLOCKING",
          message: "The Project has no wedding details",
        },
      ],
    };
  }

  // S13a steps 2–3 — builder name issues in fixed order, then resolver issues unchanged.
  const resolution = resolveWeddingDomain({ variant, weddingDetails, events });
  const issues: SnapshotPayloadIssue[] = [...validateNames(weddingDetails), ...resolution.issues];

  // S13a step 4 — payload gate.
  if (issues.some((issue) => issue.severity === "BLOCKING") || resolution.status !== "RESOLVED") {
    const [first, ...rest] = issues;
    if (first === undefined) {
      throw new SnapshotPayloadInvariantError("Wedding domain resolution is blocked without an issue");
    }
    return { status: "BLOCKED", issues: [first, ...rest] };
  }

  const groomName = weddingDetails.groomName;
  const brideName = weddingDetails.brideName;
  if (groomName === null || brideName === null) {
    // Unreachable: validateNames() already reported these as BLOCKING.
    throw new SnapshotPayloadInvariantError("Name validation passed with a null name");
  }

  const { gift, qr } = projectGiftAndQr(weddingDetails, resolution.operationalSides);
  const content = {
    invitationMessage: weddingDetails.invitationMessage,
    loveStory: weddingDetails.loveStory,
  };
  const snapshotMedia = projectMedia(media, qr);

  const payload: SnapshotPayloadV1 = {
    payloadSchemaVersion: SNAPSHOT_PAYLOAD_SCHEMA_VERSION,
    project: { code: project.projectCode },
    template: {
      templateVersionId: templateVersion.id,
      rendererKey: templateVersion.rendererKey,
    },
    variant: resolution.variant,
    people: {
      groom: { side: "GROOM", name: groomName },
      bride: { side: "BRIDE", name: brideName },
      primarySide: resolution.primarySide,
      secondarySide: resolution.secondarySide,
    },
    families: {
      groom: {
        side: "GROOM",
        father: resolution.families.groom.father,
        mother: resolution.families.groom.mother,
        address: resolution.families.groom.address,
      },
      bride: {
        side: "BRIDE",
        father: resolution.families.bride.father,
        mother: resolution.families.bride.mother,
        address: resolution.families.bride.address,
      },
    },
    ceremony: projectCeremony(resolution),
    events: resolution.visibleEvents.map(projectEvent),
    operationalSides: [...resolution.operationalSides],
    content,
    gift,
    media: snapshotMedia,
    sections: projectSections(content, snapshotMedia, gift),
    design: projectDesign(design),
  };

  return { status: "SUCCESS", payload, issues: [] };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Missing = null or blank after trim(). Used only to decide; never rewrites the value. */
function hasText(value: string | null): value is string {
  return value !== null && value.trim() !== "";
}

/** S12: fixed order GROOM_NAME_MISSING, then BRIDE_NAME_MISSING. */
function validateNames(details: SnapshotWeddingDetailsSource): SnapshotBuilderIssue[] {
  const issues: SnapshotBuilderIssue[] = [];
  if (!hasText(details.groomName)) {
    issues.push({ code: "GROOM_NAME_MISSING", severity: "BLOCKING", message: "Groom name is missing" });
  }
  if (!hasText(details.brideName)) {
    issues.push({ code: "BRIDE_NAME_MISSING", severity: "BLOCKING", message: "Bride name is missing" });
  }
  return issues;
}

function assertSourceInvariants(input: BuildSnapshotPayloadInput): void {
  const { project, weddingDetails, events, media, design, templateVersion } = input;

  if (typeof project.projectCode !== "string" || project.projectCode.length === 0) {
    throw new SnapshotPayloadInvariantError("Project code must be a non-empty string");
  }

  // Template pinning: the exact immutable version the design selected. No lookup, no fallback.
  if (typeof templateVersion.id !== "string" || templateVersion.id.length === 0) {
    throw new SnapshotPayloadInvariantError("Template version id must be a non-empty string");
  }
  if (templateVersion.id !== design.templateVersionId) {
    throw new SnapshotPayloadInvariantError(
      "Template version does not match the Project design's selected templateVersionId",
    );
  }
  if (typeof templateVersion.rendererKey !== "string" || templateVersion.rendererKey.length === 0) {
    throw new SnapshotPayloadInvariantError("Template version rendererKey must be a non-empty string");
  }

  // Every canonical source must belong to the same Project.
  if (design.projectId !== project.id) {
    throw new SnapshotPayloadInvariantError("Project design belongs to a different Project");
  }
  if (weddingDetails !== null && weddingDetails.projectId !== project.id) {
    throw new SnapshotPayloadInvariantError("Wedding details belong to a different Project");
  }
  for (const event of events) {
    if (event.projectId !== project.id) {
      throw new SnapshotPayloadInvariantError(`Project event ${event.id} belongs to a different Project`);
    }
  }

  assertCanonicalMedia(media, project.id);
}

function assertCanonicalMedia(media: readonly SnapshotMediaSource[], projectId: string): void {
  const seenIds = new Set<string>();

  for (const item of media) {
    if (typeof item.id !== "string" || item.id.length === 0) {
      throw new SnapshotPayloadInvariantError("Project media id must be a non-empty string");
    }
    if (seenIds.has(item.id)) {
      throw new SnapshotPayloadInvariantError(`Duplicate project media id: ${item.id}`);
    }
    seenIds.add(item.id);

    if (item.projectId !== projectId) {
      throw new SnapshotPayloadInvariantError(`Project media ${item.id} belongs to a different Project`);
    }
    if (!(MEDIA_TYPES as readonly string[]).includes(item.mediaType)) {
      throw new SnapshotPayloadInvariantError(`Project media ${item.id} has an unknown media type`);
    }
    if (!Number.isInteger(item.sortOrder)) {
      throw new SnapshotPayloadInvariantError(`Project media ${item.id} has a non-integer sortOrder`);
    }
  }
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

/** RF11 rule I: explicit rendering fields only — never `{ ...event }`. */
function projectEvent(event: ProjectEventRecord): SnapshotEvent {
  return {
    id: event.id,
    occasionType: event.occasionType,
    side: event.side,
    title: event.title,
    startsAt: event.startsAt,
    timezone: event.timezone,
    venueName: event.venueName,
    address: event.address,
    mapUrl: event.mapUrl,
    description: event.description,
    sortOrder: event.sortOrder,
    isPrimary: event.isPrimary,
    lunarDateDisplay: event.lunarDateDisplay,
  };
}

/** Everything except the RF3 title is copied from the resolved ceremony event (RF11 rule J). */
function projectCeremony(resolution: ResolvedWeddingDomain): SnapshotPayloadV1["ceremony"] {
  const { event, title } = resolution.ceremony;
  return {
    eventId: event.id,
    occasionType: event.occasionType,
    title,
    startsAt: event.startsAt,
    timezone: event.timezone,
    lunarDateDisplay: event.lunarDateDisplay,
  };
}

function giftSide<TSide extends CoupleSide>(
  side: TSide,
  details: SnapshotWeddingDetailsSource,
): SnapshotGiftSide<TSide> {
  return side === "GROOM"
    ? {
        side,
        bankName: details.groomBankName,
        bankAccountName: details.groomBankAccountName,
        bankAccountNumber: details.groomBankAccountNumber,
        bankQrMediaId: details.groomBankQrMediaId,
      }
    : {
        side,
        bankName: details.brideBankName,
        bankAccountName: details.brideBankAccountName,
        bankAccountNumber: details.brideBankAccountNumber,
        bankQrMediaId: details.brideBankQrMediaId,
      };
}

/** S7: a non-blank bank text field, or the side's canonical QR reference. */
function isMeaningfulGift(side: SnapshotGiftSide): boolean {
  return (
    hasText(side.bankName) ||
    hasText(side.bankAccountName) ||
    hasText(side.bankAccountNumber) ||
    side.bankQrMediaId !== null
  );
}

/**
 * S8/S9: gift sides and QR references come only from the variant's
 * operationalSides and the canonical per-side wedding_details fields.
 * `qr.commonMediaId` is never set — no canonical common-QR owner exists.
 */
function projectGiftAndQr(
  details: SnapshotWeddingDetailsSource,
  operationalSides: readonly CoupleSide[],
): { gift: SnapshotGift; qr: SnapshotQrMedia } {
  const gift: SnapshotGift = {};
  const qr: SnapshotQrMedia = {};

  for (const side of operationalSides) {
    if (side === "GROOM") {
      const groom = giftSide("GROOM", details);
      if (isMeaningfulGift(groom)) gift.groom = groom;
      if (groom.bankQrMediaId !== null) qr.groomMediaId = groom.bankQrMediaId;
    } else {
      const bride = giftSide("BRIDE", details);
      if (isMeaningfulGift(bride)) gift.bride = bride;
      if (bride.bankQrMediaId !== null) qr.brideMediaId = bride.bankQrMediaId;
    }
  }

  return { gift, qr };
}

/** RF11 rule C canonical media order: sortOrder ASC, then id ASC (code-unit compare). */
function compareMedia(a: SnapshotMediaSource, b: SnapshotMediaSource): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * RF11 rule C: cover/audio = first COVER/AUDIO row, gallery = all GALLERY
 * rows, in canonical order. QR rows are never read here (S9).
 */
function projectMedia(media: readonly SnapshotMediaSource[], qr: SnapshotQrMedia): SnapshotMedia {
  const ordered = [...media].sort(compareMedia);
  const cover = ordered.find((item) => item.mediaType === "COVER");
  const audio = ordered.find((item) => item.mediaType === "AUDIO");

  const result: SnapshotMedia = {
    galleryMediaIds: ordered.filter((item) => item.mediaType === "GALLERY").map((item) => item.id),
    qr,
  };
  if (cover !== undefined) result.coverMediaId = cover.id;
  if (audio !== undefined) result.audioMediaId = audio.id;
  return result;
}

/** S3–S7: content availability only; `design.sectionSettings` is never consulted (S10). */
function projectSections(
  content: SnapshotPayloadV1["content"],
  media: SnapshotMedia,
  gift: SnapshotGift,
): SnapshotSections {
  return {
    invitationMessage: hasText(content.invitationMessage),
    loveStory: hasText(content.loveStory),
    gallery: media.galleryMediaIds.length > 0,
    music: media.audioMediaId !== undefined,
    gift: gift.groom !== undefined || gift.bride !== undefined,
  };
}

function projectDesign(design: BuildSnapshotPayloadInput["design"]): SnapshotDesign {
  return {
    paletteKey: design.paletteKey,
    fontPresetKey: design.fontPresetKey,
    effectPresetKey: design.effectPresetKey,
    sectionSettings: copyFlatSettings(design.sectionSettings, "sectionSettings"),
    designSettings: copyFlatSettings(design.designSettings, "designSettings"),
  };
}

/**
 * Snapshot-owned copy of a Task 028 flat settings object (string | finite
 * number | boolean values, no nesting — validate-save-project-design-input.ts).
 * `Object.fromEntries` defines own data properties, so a `__proto__` key is
 * copied as data rather than altering the prototype.
 */
function copyFlatSettings(
  settings: Record<string, SnapshotDesignSettingValue>,
  label: string,
): Record<string, SnapshotDesignSettingValue> {
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    throw new SnapshotPayloadInvariantError(`Project design ${label} must be a JSON object`);
  }
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => {
      const isValid =
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value));
      if (!isValid) {
        throw new SnapshotPayloadInvariantError(
          `Project design ${label}.${key} must be a string, finite number or boolean`,
        );
      }
      return [key, value];
    }),
  );
}
