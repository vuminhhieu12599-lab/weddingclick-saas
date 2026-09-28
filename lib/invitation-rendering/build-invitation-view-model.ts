import { extractSnapshotMediaRefs } from "./extract-snapshot-media-refs";
import type {
  BuildInvitationViewModelInput,
  GuestOverlay,
  InvitationViewModel,
  MediaResolution,
  ViewModelEvent,
  ViewModelFamily,
  ViewModelGift,
  ViewModelGiftSide,
  ViewModelMedia,
  ViewModelPerson,
} from "./invitation-view-model-types";
import { InvitationViewModelInvariantError, projectMediaResolution } from "./media-resolution";
import type {
  SnapshotDesignSettingValue,
  SnapshotEvent,
  SnapshotFamily,
  SnapshotGiftSide,
  SnapshotPayloadV1,
  SnapshotPerson,
} from "./snapshot-payload-types";
import { COUPLE_SIDES, type CoupleSide } from "./wedding-domain-types";

/**
 * RF-03 Layer B — pure synchronous InvitationViewModel builder
 * (docs/DECISIONS.md RF-03 clarification A1, M5–M13, V1–V12).
 *
 * Inputs are the Snapshot, an optional already-authorized guest overlay and
 * the complete media resolution set from Layer A. The Snapshot is the only
 * canonical content source (V9): nothing is re-read from Project records,
 * no domain rule is re-run, and nothing is sorted. The builder never calls
 * a resolver, signs, fetches, reads the environment or the clock.
 *
 * Every field is an explicit projection into fresh objects, so unknown
 * runtime keys cannot leak (V10), inputs are never mutated, and the result
 * shares no mutable object with its inputs. `UNAVAILABLE` media is normal
 * data: it never blocks construction and never rewrites `sections` (M12, V6).
 */
export function buildInvitationViewModel(input: BuildInvitationViewModelInput): InvitationViewModel {
  const { snapshot, guest, mediaResolutions } = input;

  const resolutions = indexResolutionSet(snapshot, mediaResolutions);
  assertGiftQrConsistency(snapshot);
  const { primarySide, secondarySide } = assertSides(snapshot);

  const groom = projectPerson(snapshot.people.groom);
  const bride = projectPerson(snapshot.people.bride);
  const groomFamily = projectFamily(snapshot.families.groom);
  const brideFamily = projectFamily(snapshot.families.bride);

  const viewModel: InvitationViewModel = {
    project: { code: snapshot.project.code },
    template: {
      templateVersionId: snapshot.template.templateVersionId,
      rendererKey: snapshot.template.rendererKey,
    },
    variant: snapshot.variant,
    people: {
      groom,
      bride,
      primarySide,
      secondarySide,
      primary: projectPerson(primarySide === "GROOM" ? snapshot.people.groom : snapshot.people.bride),
      secondary: projectPerson(secondarySide === "GROOM" ? snapshot.people.groom : snapshot.people.bride),
    },
    families: {
      groom: groomFamily,
      bride: brideFamily,
      primary: projectFamily(primarySide === "GROOM" ? snapshot.families.groom : snapshot.families.bride),
      secondary: projectFamily(secondarySide === "GROOM" ? snapshot.families.groom : snapshot.families.bride),
    },
    ceremony: {
      eventId: snapshot.ceremony.eventId,
      occasionType: snapshot.ceremony.occasionType,
      title: snapshot.ceremony.title,
      startsAt: snapshot.ceremony.startsAt,
      timezone: snapshot.ceremony.timezone,
      lunarDateDisplay: snapshot.ceremony.lunarDateDisplay,
    },
    events: snapshot.events.map(projectEvent),
    operationalSides: [...snapshot.operationalSides],
    content: {
      invitationMessage: snapshot.content.invitationMessage,
      loveStory: snapshot.content.loveStory,
    },
    gift: projectGift(snapshot),
    media: projectMedia(snapshot, resolutions),
    sections: {
      invitationMessage: snapshot.sections.invitationMessage,
      loveStory: snapshot.sections.loveStory,
      gallery: snapshot.sections.gallery,
      music: snapshot.sections.music,
      gift: snapshot.sections.gift,
    },
    design: {
      paletteKey: snapshot.design.paletteKey,
      fontPresetKey: snapshot.design.fontPresetKey,
      effectPresetKey: snapshot.design.effectPresetKey,
      sectionSettings: copyFlatSettings(snapshot.design.sectionSettings),
      designSettings: copyFlatSettings(snapshot.design.designSettings),
    },
  };

  if (guest !== undefined) {
    viewModel.guest = projectGuest(guest);
  }

  return viewModel;
}

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

/**
 * M5 / V10: the supplied set must hold exactly one valid result per unique
 * referenced id. A missing entry is an invariant violation — never
 * `UNAVAILABLE`. Duplicate or unreferenced entries are rejected, not ignored,
 * so entry order and extra input can never affect the output.
 */
function indexResolutionSet(
  snapshot: SnapshotPayloadV1,
  mediaResolutions: readonly MediaResolution[],
): ReadonlyMap<string, MediaResolution> {
  if (!Array.isArray(mediaResolutions)) {
    throw new InvitationViewModelInvariantError("Media resolution set must be an array");
  }

  const referenced = new Set(extractSnapshotMediaRefs(snapshot));
  const byId = new Map<string, MediaResolution>();

  for (const entry of mediaResolutions) {
    const projected = projectMediaResolution(entry);
    if (byId.has(projected.mediaId)) {
      throw new InvitationViewModelInvariantError(`Duplicate media resolution for ${projected.mediaId}`);
    }
    if (!referenced.has(projected.mediaId)) {
      throw new InvitationViewModelInvariantError(
        `Media resolution for ${projected.mediaId} is not referenced by the Snapshot`,
      );
    }
    byId.set(projected.mediaId, projected);
  }

  for (const mediaId of referenced) {
    if (!byId.has(mediaId)) {
      throw new InvitationViewModelInvariantError(`Missing media resolution for referenced media ${mediaId}`);
    }
  }

  return byId;
}

/**
 * M11: `media.qr.<side>MediaId` is the canonical QR reference and, by RF-02
 * construction, equals `gift.<side>.bankQrMediaId`. A disagreement is never
 * reconciled and the gift pointer is never resolved on its own.
 */
function assertGiftQrConsistency(snapshot: SnapshotPayloadV1): void {
  const checks: Array<[CoupleSide, SnapshotGiftSide | undefined, string | undefined]> = [
    ["GROOM", snapshot.gift.groom, snapshot.media.qr.groomMediaId],
    ["BRIDE", snapshot.gift.bride, snapshot.media.qr.brideMediaId],
  ];

  for (const [side, giftSide, qrMediaId] of checks) {
    const giftQrMediaId = giftSide?.bankQrMediaId ?? null;
    if (giftQrMediaId !== (qrMediaId ?? null)) {
      throw new InvitationViewModelInvariantError(
        `Snapshot ${side} gift bankQrMediaId does not match media.qr reference`,
      );
    }
  }
}

function isCoupleSide(value: unknown): value is CoupleSide {
  return (COUPLE_SIDES as readonly unknown[]).includes(value);
}

function assertSides(snapshot: SnapshotPayloadV1): { primarySide: CoupleSide; secondarySide: CoupleSide } {
  const { primarySide, secondarySide } = snapshot.people;
  if (!isCoupleSide(primarySide) || !isCoupleSide(secondarySide) || primarySide === secondarySide) {
    throw new InvitationViewModelInvariantError("Snapshot primary/secondary sides must be distinct couple sides");
  }
  return { primarySide, secondarySide };
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

function projectPerson(person: SnapshotPerson): ViewModelPerson {
  return { side: person.side, name: person.name };
}

function projectFamily(family: SnapshotFamily): ViewModelFamily {
  return { side: family.side, father: family.father, mother: family.mother, address: family.address };
}

function projectEvent(event: SnapshotEvent): ViewModelEvent {
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

function projectGiftSide<TSide extends CoupleSide>(side: SnapshotGiftSide<TSide>): ViewModelGiftSide<TSide> {
  return {
    side: side.side,
    bankName: side.bankName,
    bankAccountName: side.bankAccountName,
    bankAccountNumber: side.bankAccountNumber,
    bankQrMediaId: side.bankQrMediaId,
  };
}

/** Only sides the Snapshot included; no meaningful-content filtering is re-run. */
function projectGift(snapshot: SnapshotPayloadV1): ViewModelGift {
  const gift: ViewModelGift = {};
  if (snapshot.gift.groom !== undefined) gift.groom = projectGiftSide(snapshot.gift.groom);
  if (snapshot.gift.bride !== undefined) gift.bride = projectGiftSide(snapshot.gift.bride);
  return gift;
}

/** A fresh slot per role, so ViewModel slots never share mutable objects. */
function slot(resolutions: ReadonlyMap<string, MediaResolution>, mediaId: string): MediaResolution {
  const resolution = resolutions.get(mediaId);
  if (resolution === undefined) {
    // Unreachable: indexResolutionSet() proved every referenced id has an entry.
    throw new InvitationViewModelInvariantError(`Missing media resolution for referenced media ${mediaId}`);
  }
  return resolution.status === "RESOLVED"
    ? {
        status: "RESOLVED",
        mediaId: resolution.mediaId,
        url: resolution.url,
        width: resolution.width,
        height: resolution.height,
      }
    : { status: "UNAVAILABLE", mediaId: resolution.mediaId };
}

/**
 * M6–M11: every Snapshot reference stays observable with its runtime state.
 * Absent reference → absent slot; gallery keeps Snapshot order and count.
 * QR roles come only from `media.qr`; there is no common QR slot.
 */
function projectMedia(
  snapshot: SnapshotPayloadV1,
  resolutions: ReadonlyMap<string, MediaResolution>,
): ViewModelMedia {
  const { coverMediaId, galleryMediaIds, audioMediaId, qr } = snapshot.media;

  const media: ViewModelMedia = {
    gallery: galleryMediaIds.map((mediaId) => slot(resolutions, mediaId)),
    qr: {},
  };
  if (coverMediaId !== undefined) media.cover = slot(resolutions, coverMediaId);
  if (audioMediaId !== undefined) media.audio = slot(resolutions, audioMediaId);
  if (qr.groomMediaId !== undefined) media.qr.groom = slot(resolutions, qr.groomMediaId);
  if (qr.brideMediaId !== undefined) media.qr.bride = slot(resolutions, qr.brideMediaId);
  return media;
}

/** V1: exactly `displayName`, passed through as given. */
function projectGuest(guest: GuestOverlay): GuestOverlay {
  if (typeof guest !== "object" || guest === null) {
    throw new InvitationViewModelInvariantError("Guest overlay must be an object");
  }
  if (typeof guest.displayName !== "string" || guest.displayName.length === 0) {
    throw new InvitationViewModelInvariantError("Guest overlay displayName must be a non-empty string");
  }
  return { displayName: guest.displayName };
}

/**
 * ViewModel-owned copy of a flat Snapshot settings object. `Object.fromEntries`
 * defines own data properties, so a `__proto__` key stays data.
 */
function copyFlatSettings(
  settings: Record<string, SnapshotDesignSettingValue>,
): Record<string, SnapshotDesignSettingValue> {
  return Object.fromEntries(Object.entries(settings));
}
