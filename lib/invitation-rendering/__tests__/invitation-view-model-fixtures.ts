import type { InvitationVariant } from "../../domain";
import type { MediaResolution, MediaResolver } from "../invitation-view-model-types";
import type { SnapshotPayloadV1 } from "../snapshot-payload-types";

/**
 * Shared RF-03 test fixtures. Snapshots are hand-built SnapshotPayloadV1
 * values that follow RF-02 semantics (gift/QR per operationalSides, QR ids
 * equal to gift bankQrMediaId); RF-03 never builds or re-reads them.
 */

export const RUNTIME_URL_MARKER = "RUNTIME_URL_MUST_NOT_ENTER_SNAPSHOT";

export function runtimeUrl(mediaId: string): string {
  return `https://media.example/${mediaId}?sig=${RUNTIME_URL_MARKER}`;
}

export function resolved(mediaId: string, width: number | null = 1200, height: number | null = 800): MediaResolution {
  return { status: "RESOLVED", mediaId, url: runtimeUrl(mediaId), width, height };
}

export function unavailable(mediaId: string): MediaResolution {
  return { status: "UNAVAILABLE", mediaId };
}

/** Obvious adapter-internal runtime keys that must never reach the ViewModel. */
export const ADAPTER_SENTINELS = {
  storagePath: "projects/p1/STORAGE_PATH_SENTINEL.jpg",
  bucket: "BUCKET_SENTINEL",
  signedAt: "SIGNED_AT_SENTINEL",
  expiresAt: "EXPIRES_AT_SENTINEL",
  providerError: "PROVIDER_ERROR_SENTINEL",
  credentialMetadata: "CREDENTIAL_SENTINEL",
  adapterMetadata: { internal: "ADAPTER_METADATA_SENTINEL" },
} as const;

export function withAdapterSentinels(resolution: MediaResolution): MediaResolution {
  return { ...resolution, ...ADAPTER_SENTINELS } as MediaResolution;
}

export interface RecordingResolver extends MediaResolver {
  calls: string[];
}

/**
 * Fake injected resolver: records every call and answers from `overrides`,
 * defaulting to RESOLVED with a distinctive runtime URL.
 */
export function recordingResolver(
  overrides: Record<string, (mediaId: string) => unknown> = {},
): RecordingResolver {
  const calls: string[] = [];
  return {
    calls,
    async resolveMedia(mediaId: string) {
      calls.push(mediaId);
      const override = overrides[mediaId];
      return (override ? override(mediaId) : resolved(mediaId)) as MediaResolution;
    },
  };
}

interface SnapshotOptions {
  variant?: InvitationVariant;
  media?: SnapshotPayloadV1["media"];
  gift?: SnapshotPayloadV1["gift"];
}

const GROOM_GIFT = {
  side: "GROOM" as const,
  bankName: "Vietcombank",
  bankAccountName: "NGUYEN VAN MINH",
  bankAccountNumber: "0011001234567",
  bankQrMediaId: "m-qr-groom",
};

const BRIDE_GIFT = {
  side: "BRIDE" as const,
  bankName: "Techcombank",
  bankAccountName: "TRAN THI LAN",
  bankAccountNumber: "1903123456789",
  bankQrMediaId: "m-qr-bride",
};

/** A SUCCESS-shaped Snapshot for the given variant, following RF-02 side rules. */
export function snapshot(options: SnapshotOptions = {}): SnapshotPayloadV1 {
  const variant = options.variant ?? "COMMON";
  const isBride = variant === "BRIDE";
  const primarySide = isBride ? "BRIDE" : "GROOM";
  const secondarySide = isBride ? "GROOM" : "BRIDE";
  const operationalSides: SnapshotPayloadV1["operationalSides"] =
    variant === "COMMON" ? ["GROOM", "BRIDE"] : [primarySide];

  const defaultGift: SnapshotPayloadV1["gift"] = {};
  const defaultQr: SnapshotPayloadV1["media"]["qr"] = {};
  if (operationalSides.includes("GROOM")) {
    defaultGift.groom = { ...GROOM_GIFT };
    defaultQr.groomMediaId = GROOM_GIFT.bankQrMediaId;
  }
  if (operationalSides.includes("BRIDE")) {
    defaultGift.bride = { ...BRIDE_GIFT };
    defaultQr.brideMediaId = BRIDE_GIFT.bankQrMediaId;
  }

  const ceremony = isBride
    ? {
        eventId: "b-vuquy",
        occasionType: "VU_QUY" as const,
        title: "Lễ Vu Quy" as const,
        startsAt: "2026-10-17T02:00:00.000Z",
        timezone: "Asia/Ho_Chi_Minh",
        lunarDateDisplay: "07/09 Âm lịch",
      }
    : {
        eventId: "g-thanhhon",
        occasionType: "THANH_HON" as const,
        title: "Lễ Thành Hôn" as const,
        startsAt: "2026-10-18T02:00:00.000Z",
        timezone: "Asia/Ho_Chi_Minh",
        lunarDateDisplay: "08/09 Âm lịch",
      };

  const media = options.media ?? {
    coverMediaId: "m-cover",
    galleryMediaIds: ["m-g1", "m-g2", "m-g3"],
    audioMediaId: "m-audio",
    qr: defaultQr,
  };

  return {
    payloadSchemaVersion: 1,
    project: { code: "WC-2026-0001" },
    template: { templateVersionId: "tv-elegant-editorial-1", rendererKey: "wedding.elegant-editorial.v1" },
    variant,
    people: {
      groom: { side: "GROOM", name: "Nguyễn Văn Minh" },
      bride: { side: "BRIDE", name: "Trần Thị Lan" },
      primarySide,
      secondarySide,
    },
    families: {
      groom: { side: "GROOM", father: "Nguyễn Văn A", mother: "Lê Thị B", address: "Hà Nội" },
      bride: { side: "BRIDE", father: "Trần Văn C", mother: null, address: "Hải Phòng" },
    },
    ceremony,
    events: [
      {
        id: ceremony.eventId,
        occasionType: ceremony.occasionType,
        side: isBride ? "BRIDE" : "GROOM",
        title: isBride ? "Lễ Vu Quy nhà gái" : "Lễ Thành Hôn nhà trai",
        startsAt: ceremony.startsAt,
        timezone: "Asia/Ho_Chi_Minh",
        venueName: null,
        address: null,
        mapUrl: null,
        description: null,
        sortOrder: 5,
        isPrimary: true,
        lunarDateDisplay: ceremony.lunarDateDisplay,
      },
      {
        id: "c-reception",
        occasionType: "RECEPTION",
        side: "COMMON",
        title: "Tiệc cưới",
        startsAt: "2026-10-18T05:00:00.000Z",
        timezone: "Asia/Ho_Chi_Minh",
        venueName: "Nhà hàng A",
        address: "Hà Nội",
        mapUrl: "https://maps.example/a",
        description: "Tiệc",
        sortOrder: 1,
        isPrimary: false,
        lunarDateDisplay: null,
      },
    ],
    operationalSides,
    content: { invitationMessage: "Trân trọng kính mời", loveStory: null },
    gift: options.gift ?? defaultGift,
    media,
    sections: {
      invitationMessage: true,
      loveStory: false,
      gallery: media.galleryMediaIds.length > 0,
      music: media.audioMediaId !== undefined,
      gift: true,
    },
    design: {
      paletteKey: "ivory",
      fontPresetKey: "editorial-serif",
      effectPresetKey: "light",
      sectionSettings: { gallery: false, music: false },
      designSettings: { heroLayout: "split", ornamentScale: 1.5 },
    },
  };
}

/** Recursively freezes a plain JSON-like value so any mutation attempt throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
