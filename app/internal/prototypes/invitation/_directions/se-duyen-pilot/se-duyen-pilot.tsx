"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import { Be_Vietnam_Pro, Cormorant_Garamond } from "next/font/google";

import { assignPhotosToSlots, photoObjectPosition } from "../../_shared/album-assignment";
import { deriveCeremonyDisplay } from "../../_shared/derive-ceremony";
import { buildInvitationMessage, resolveGuestLine } from "../../_shared/invitation-text";
import { Reveal } from "../../_shared/reveal";
import { resolveInvitation, resolveReceptionTitle } from "../../_shared/resolve-variant";
import { useCountdown } from "../../_shared/use-countdown";
import { useLightbox } from "../../_shared/use-lightbox";
import type { LightboxImage } from "../../_shared/use-lightbox";
import { useMusicControl } from "../../_shared/use-music-control";
import { useReducedMotion } from "../../_shared/use-reduced-motion";
import { DEFAULT_SECTION_VISIBILITY } from "../../_shared/sections";
import type { SectionVisibility } from "../../_shared/sections";
import type { AlbumPhoto, InvitationVariant, PrototypeWeddingData } from "../../_shared/types";
import styles from "./se-duyen-pilot.module.css";

/**
 * Se Duyên — "Hộp cưới mở ra" (Visual Pilot v0.3, refinement pass).
 *
 * One sequence, nothing else: a closed Vietnamese lacquer wedding box with
 * the couple's names above it and the wedding date below -> the guest taps
 * the box itself -> the lid lifts off and a wedding photo rises out of the
 * silk-lined basin -> that same photo grows out of the box to fill the
 * screen and becomes the photo-led hero.
 *
 * There is ONE photo element in the whole sequence. An earlier pass had a
 * card inside the box and a second full-screen copy in the hero, crossfaded;
 * it showed large ghosted faces behind the small card, so the hero's own
 * image is gone and the card itself grows instead.
 *
 * This is a SEPARATE direction from `se-duyen/`, deliberately. The brief
 * said to preserve existing uncommitted work, and the SD-01 lacquer-lid
 * integration is uncommitted, so it is left exactly as it is and this pilot
 * is registered beside it rather than overwriting it. Both are selectable in
 * the review harness.
 *
 * ARTWORK, v0.3 set (hashes checked against its README, used byte-for-byte):
 * `bg-red-lacquer`, `box-lid`, `box-open-base`. The couple photo and the tơ
 * hồng are the v0.2 assets, unchanged — the brief keeps the current
 * fictional wedding photo. The photo file itself is a COPY of an approved
 * fictional showroom demo photo; the original under `public/showroom/` is
 * untouched.
 *
 * ASSET ALIGNMENT, per the v0.3 README's warning that the three box renders
 * are not one registered 3D object — what was actually measured in-browser
 * and off the files:
 *
 *   - `box-lid` and `box-open-base` DO share the 1448x1086 canvas, the
 *     camera and the horizontal centre (lid spans 2.1%-97.8% of the canvas,
 *     base 3.2%-96.8%, both centred on 50.0%). Seating the lid on the base
 *     needs ONE vertical offset: the lid's front-bottom edge (77.6% of the
 *     canvas) onto the base's front rim (58.5%), i.e. -19.1%. That composite
 *     reads as a single closed box, so the lift is a real lid lift rather
 *     than a crossfade.
 *   - `box-closed` is a different render: shallower, wider (1.8%-98.2%),
 *     with a lotus medallion and tassel the other two do not have, and its
 *     lid portion is ~25% shorter than the `box-lid` asset. It cannot be
 *     lifted apart, and crossfading it into the lid/base composite pops the
 *     tassel out of existence. It is therefore NOT used in this sequence.
 *     Reinstating it as the closed state is a Product Owner call; it would
 *     cost the mechanical opening.
 */

/**
 * Display face: Cormorant Garamond, Vietnamese subset. An old-style serif
 * with calligraphic roots reads as poetic and classic without pretending to
 * be a script, and it is already the serif of the Vietnamese Heritage and
 * Romantic Minimal directions, so this adds no font to the catalogue
 * (CLAUDE.md §19). It replaces Prata, whose didone stiffness the Product
 * Owner judged wrong for this direction. Micro-type stays on Be Vietnam Pro,
 * which is drawn for Vietnamese and holds up at 10-11px.
 */
const pilotDisplay = Cormorant_Garamond({
  subsets: ["vietnamese"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--sdp-display",
});

const pilotSans = Be_Vietnam_Pro({
  subsets: ["vietnamese"],
  weight: ["300", "400", "500"],
  display: "swap",
  variable: "--sdp-sans",
});

// Prototype wording. Editable copy in production.
const COVER_EYEBROW = "Thiệp Cưới";
const OPEN_HINT = "Chạm vào hộp để nhận thiệp";
const HERO_EYEBROW = "Se Duyên";
const COUPLE_EYEBROW = "Uyên Ương";
const GROOM_ROLE = "Chú Rể";
const BRIDE_ROLE = "Cô Dâu";
const RITE_EYEBROW = "Hôn Lễ";
const ALBUM_EYEBROW = "Album Cưới";
const RSVP_EYEBROW = "Hồi Âm";
const RSVP_HEADING = "Xác Nhận Tham Dự";
const RSVP_INTRO =
  "Sự hiện diện của bạn là niềm vinh hạnh của hai gia đình. Xin dành đôi phút gửi đôi lời hồi âm.";
const RSVP_NAME_LABEL = "Tên của bạn";
const RSVP_NAME_PLACEHOLDER = "Nhập tên bạn muốn hiển thị";
const RSVP_ATTENDANCE_LABEL = "Bạn sẽ tới chứ?";
const RSVP_COUNT_LABEL = "Số người";
const RSVP_COUNT_UNIT = "người";
const RSVP_NOTE_LABEL = "Lời chúc (không bắt buộc)";
const RSVP_NOTE_PLACEHOLDER = "Gửi đôi lời tới cô dâu chú rể…";
const RSVP_SUBMIT = "Gửi Hồi Âm";
const RSVP_AGAIN = "Sửa lại hồi âm";
const RSVP_DEMO_BADGE = "Bản xem thử — chưa gửi dữ liệu";
const RSVP_THANKS = "Cảm ơn bạn";
const RSVP_MIN_GUESTS = 1;
const RSVP_MAX_GUESTS = 8;

/** Labels are DOM text; the value is only read back by this demo's own
 *  summary — no contract, no schema, nothing persisted. */
const RSVP_CHOICES = [
  { value: "yes", label: "Sẽ tham dự", summary: "sẽ có mặt" },
  { value: "maybe", label: "Có thể tham dự", summary: "có thể sẽ có mặt" },
  { value: "no", label: "Không tham dự", summary: "rất tiếc không thể tới" },
] as const;

type RsvpChoice = (typeof RSVP_CHOICES)[number]["value"];

const GIFT_EYEBROW = "Tấm Lòng";
const GIFT_HEADING = "Mừng Cưới";
const GIFT_OPEN_HINT = "Chạm vào phong bì";
const GIFT_CLOSE_HINT = "Gấp phong bì lại";
const GIFT_SIDE_LEGEND = "Chọn nhà";
const GIFT_BANK_LABEL = "Ngân hàng";
const GIFT_HOLDER_LABEL = "Chủ tài khoản";
const GIFT_ACCOUNT_LABEL = "Số tài khoản";
/** Says on its face that the numbers below are fiction, like the RSVP badge. */
const GIFT_DEMO_BADGE = "Thông tin minh hoạ — không phải tài khoản thật";
const GIFT_COPY_LABEL = "Sao chép số tài khoản";
const GIFT_COPY_DONE = "Đã sao chép";
const GIFT_COPY_FAILED = "Không sao chép được";
/** How long the account label stays swapped for the copy feedback. */
const GIFT_COPY_RESET_MS = 1900;
const GIFT_QR_CAPTION = "QR minh hoạ";
const GIFT_QR_ALT = "Mã QR chuyển khoản minh hoạ";
/**
 * Demo transfer-QR artwork for this pilot, one block per family side, so the
 * slip can be judged with a QR in its composition.
 *
 * Drawn placeholders, deliberately NOT scannable: finder, separator, timing
 * and alignment patterns with the remaining modules filled from a fixed
 * pseudo-random seed, carrying no payload, no format information and no error
 * correction. Nothing is generated from the fictional demo banking data and
 * no real VietQR payload is involved — see the asset README beside the files.
 * A project's own uploaded bank-QR media takes this slot in production.
 */
const GIFT_DEMO_QR = {
  groom: "/prototypes/invitation/demo/se-duyen/gift/qr-demo-groom.svg",
  bride: "/prototypes/invitation/demo/se-duyen/gift/qr-demo-bride.svg",
} as const;

const COUNTDOWN_HEADING = "Chờ Ngày Se Duyên";
/** Shown instead of the dials once the canonical instant has passed. */
const COUNTDOWN_ARRIVED = "Ngày Vui Đã Đến";
const COUNTDOWN_LABELS = ["Ngày", "Giờ", "Phút", "Giây"] as const;

const CLOSING_EYEBROW = "Lời Cảm Ơn";

const RITE_VENUE_LABEL = "Tại";
/* The rite is held at the hosting family's home; the reception is the
   separate party at that side's own venue. Both already exist in the data
   (`familyAddress` vs `venueName`/`venueAddress`/`mapsUrl`), and this is the
   same split Vietnamese Heritage renders. */
const RITE_HOME_PREFIX = "Tư gia";

const GUEST_TOKEN = "{guest}";

/**
 * Loose wording comparison — case, spacing and trailing punctuation aside —
 * used only to notice that the sentence's lead is the salutation already
 * printed above it. Nothing is ever dropped on a near-match of real wording.
 */
function sameWording(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:…!?]+$/u, "").trim();
  return normalize(a) !== "" && normalize(a) === normalize(b);
}

/** Only a real web address is ever offered as a directions link. */
function isMapUrl(url: string | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim());
}
const RITE_MONTH_PREFIX = "Tháng";
const RITE_DIRECTIONS = "Xem chỉ đường";

/* ---- 2b. Hai Bên Gia Đình (both families) ------------------------------
   Headings only. The parent names are printed as the dataset holds them —
   "Ông Hoàng Văn Thành", "Bà Nguyễn Thị Lệ" — so the honorific is part of
   the name the customer entered and this template never prefixes, titles
   or groups them. No collective parent wording ("Song thân" and the like)
   is used anywhere: each name stands on its own line, and a side with one
   name shows one line. */
const FAMILY_EYEBROW = "Trăm Năm Gắn Kết";
const FAMILY_HEADING = "Hai Bên Gia Đình";

/* ---- 3a. Lịch trình hôn lễ (wedding-day timeline) ----------------------
   Run-of-show steps, read from the prototype dataset's own `timeline`
   (`data.timeline`) — the approved canonical home for them is the Timeline
   table, never `project_events` and never this template
   (docs/DECISIONS.md RF7 "Timeline"). The dataset carries a time and a
   plain label per step, which is exactly what the approved Snapshot
   contract carries, so nothing new is introduced here.

   The short line under each step is this direction's own ART DIRECTION
   copy, not Project data: it is keyed off the demo step label and simply
   does not render for a label it does not know, so the layout degrades to
   time + title rather than inventing wording for a step. The approved
   Timeline contract has no description field — see the task report. */
const TIMELINE_EYEBROW = "Trình Tự Ngày Vui";
const TIMELINE_HEADING = "Lịch Trình Hôn Lễ";
/** Says on its own face that these hours are fiction, like the RSVP and
 *  gift badges above — the one hour that is NOT illustrative is the rite,
 *  which is marked separately with `TIMELINE_RITE_MARK`. */
const TIMELINE_DEMO_BADGE = "Các mốc giờ khác chỉ là minh hoạ cho bản xem thử";
/** Marks the one step whose instant IS the canonical ceremony instant. */
const TIMELINE_RITE_MARK = "Giờ trên thiệp";
const TIMELINE_NOTES: Record<string, string> = {
  "Đón khách": "Hai gia đình kính mời quý khách dùng trà, bánh và chụp ảnh lưu niệm.",
  "Làm lễ": "Nghi thức chính của ngày vui, trước sự chứng giám của hai họ.",
  "Khai tiệc": "Mời quý khách vào tiệc, nâng ly chung vui cùng cô dâu chú rể.",
};

/* ---- Photo slots (P0-2) -------------------------------------------------

   SE DUYÊN V1 REQUIRES AT LEAST ONE CUSTOMER PHOTOGRAPH (Product Owner
   decision, 2026-10-21). The box opening is built around a photograph that
   rises out of the box and grows into the hero, and this direction has no
   approved opening without one — a zero-photo invitation is deliberately out
   of scope for Se Duyên V1 (a future Chibi-based experience may serve
   customers with no photographs; it is not this template).

   For production integration that means the requirement is enforced
   UPSTREAM — in Se Duyên's editor manifest / readiness, not here. This
   renderer never invents a photograph to cover a short set: it fills the
   frames it can and omits the rest (see `resolveSlotPhotos`). One photo is
   enough for a complete invitation; it fills the opening and every other
   frame is omitted.

   The eight art-directed photo frames. Each reads its image and crop from a
   CSS custom property whose fallback is this direction's own approved demo
   photograph and hand-tuned crop, so with no Project media supplied the
   stylesheet stands and the approved review appearance is untouched.

   The approved crops are tuned to the five 1086x1448 (3:4) demo photos, and
   four of the frames zoom by a fixed percentage rather than `cover`. A fixed
   zoom cannot adapt: measured against the real frames, a 3:2 source covers
   only 0.89-0.97 of those frames vertically and 16:9 only 0.75-0.82, which
   would show bare lacquer inside the frame. So a SUPPLIED photo always
   switches that frame to `cover` plus its own focal point — the only crop
   that can neither gap nor distort whatever ratio the customer uploads.

   Orientation preferences feed the shared `assignPhotosToSlots`, the same
   helper Vietnamese Heritage and Romantic Minimal use; nothing new is
   introduced here and there is no second media system. */
const PHOTO_SLOTS = [
  { stem: "hero", preferred: ["portrait", "square"] },
  { stem: "coupleMain", preferred: ["portrait", "square"] },
  { stem: "coupleAside", preferred: ["portrait", "square"] },
  { stem: "albumLead", preferred: ["portrait", "square"] },
  { stem: "albumTall", preferred: ["portrait", "square"] },
  { stem: "albumSmall", preferred: ["portrait", "square"] },
  { stem: "albumFoot", preferred: ["square", "landscape"] },
  { stem: "closing", preferred: ["portrait", "square"] },
] as const;

type PhotoSlotStem = (typeof PHOTO_SLOTS)[number]["stem"];
type SlotPhotos = Partial<Record<PhotoSlotStem, AlbumPhoto>>;

/**
 * Inline custom properties for one frame. `undefined` when the slot has no
 * Project photo, which leaves the stylesheet's approved demo image and its
 * tuned crop in place (CLAUDE.md §17 — media belongs to the Project, and a
 * template swap must never require re-uploading it).
 */
function slotPhotoStyle(stem: PhotoSlotStem, photo?: AlbumPhoto): CSSProperties | undefined {
  if (!photo) return undefined;
  return {
    [`--sdp-${stem}-image`]: `url("${photo.src}")`,
    [`--sdp-${stem}-size`]: "cover",
    [`--sdp-${stem}-pos`]: photoObjectPosition(photo),
  } as CSSProperties;
}

/**
 * Fill order when a Project has fewer than eight photos. The art-directed
 * single frames come first, in the order the invitation needs them — the
 * opening photograph, the couple's own frame, the closing portrait, then the
 * supporting frame beside the couple — and the four album frames follow as
 * the gallery sequence. So three photos make a complete opening, couple and
 * closing rather than a half-filled album.
 */
/** The four album frames, in the order they are laid out. */
const GALLERY_SLOTS = ["albumLead", "albumTall", "albumSmall", "albumFoot"] as const;

const SLOT_FILL_PRIORITY: readonly PhotoSlotStem[] = [
  "hero",
  "coupleMain",
  "closing",
  "coupleAside",
  "albumLead",
  "albumTall",
  "albumSmall",
  "albumFoot",
] as const;

/**
 * Places the Project's photos into the frames it can fill, and leaves the
 * rest empty.
 *
 * Only as many slots as there are photos are offered to the shared
 * `assignPhotosToSlots`, which is exactly its documented precondition
 * (`slots.length` must not exceed `photos.length`). That is what keeps a
 * short set honest: asked for more slots than photos, the shared helper
 * fills the remainder with the first photo over and over, and a customer's
 * one photograph would be repeated into all eight frames. The helper itself
 * is unchanged — Vietnamese Heritage and Romantic Minimal are untouched.
 *
 * An empty slot is never backfilled: not from another of the customer's
 * photos and not from this direction's demo art (docs/DECISIONS.md M6–M10,
 * P7 — media is never substituted). The renderer omits that frame instead.
 */
function resolveSlotPhotos(photos: AlbumPhoto[] | undefined): SlotPhotos {
  if (!photos || photos.length === 0) return {};
  const fillable = SLOT_FILL_PRIORITY.slice(0, Math.min(photos.length, SLOT_FILL_PRIORITY.length));
  const slots = fillable.map(
    (stem) => PHOTO_SLOTS.find((slot) => slot.stem === stem) as (typeof PHOTO_SLOTS)[number],
  );
  const assignment = assignPhotosToSlots(
    photos,
    slots.map((slot) => ({ preferred: slot.preferred })),
  );
  const resolved: SlotPhotos = {};
  fillable.forEach((stem, index) => {
    resolved[stem] = photos[assignment[index]];
  });
  return resolved;
}

type Phase = "closed" | "opening" | "hero";

/**
 * Lid lifts (90-1270) -> photo rises (620-1660) -> a SHORT hold -> the risen
 * card grows to full screen (1150ms) with the hero text settling over it.
 *
 * v0.3.2: the hold drops from ~1.7s to ~0.5s (the Product Owner found the
 * photo sat small too long) while every earlier stage keeps its v0.3.1
 * timing, so the lid opening is exactly as slow as approved.
 */
const HERO_AT_MS = 2150;
const HERO_AT_REDUCED_MS = 200;

interface Props {
  data: PrototypeWeddingData;
  variant: InvitationVariant;
  personalization: boolean;
  guestDisplayName: string;
  /** `mainText`, `portraitStory`, `ceremony`, `timeline`, `gallery`, `rsvp`
   *  and `gift` exist in this pilot so far; the remaining keys are accepted
   *  and ignored. */
  sections?: SectionVisibility;
  /** This Project's own wedding photography, in upload order. Omitted in the
   *  harness, where `data.album` holds the shared generic placeholder set
   *  rather than this direction's approved art — so the demo keeps its
   *  stylesheet photographs and their approved crops. Production supplies
   *  the ViewModel's media here. */
  projectPhotos?: AlbumPhoto[];
}

export function SeDuyenPilotPrototype({
  data,
  variant,
  personalization,
  guestDisplayName,
  sections = DEFAULT_SECTION_VISIBILITY,
  projectPhotos,
}: Props) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("closed");
  /* RSVP demo state. Local to this component on purpose: the prototype must
     not touch the RSVP domain service, and nothing here is persisted. */
  const [rsvpName, setRsvpName] = useState<string | null>(null);
  const [rsvpChoice, setRsvpChoice] = useState<RsvpChoice>("yes");
  const [rsvpGuests, setRsvpGuests] = useState(2);
  const [rsvpNote, setRsvpNote] = useState("");
  const [rsvpSent, setRsvpSent] = useState(false);
  /* Gift demo state. Also local, also inert: the envelope only opens and the
     panel only switches which side's fictional details and demo QR block are
     shown. Nothing is copied, encoded into a QR, posted or persisted. */
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftSideIndex, setGiftSideIndex] = useState(0);
  /* Copy feedback for the account number. Kept local rather than on the
     shared `useClipboard` hook on purpose: that hook sets its copied state
     before the write settles, so it reports success even when the clipboard
     is unavailable. This slip must only say "Đã sao chép" once the write has
     actually resolved (CLAUDE.md §22), and the four directions already on the
     shared hook are approved work this task must not disturb. */
  const [giftCopy, setGiftCopy] = useState<{
    /** Which slip state the feedback belongs to; see `giftCopyState`. */
    key: string;
    state: "done" | "failed";
  } | null>(null);
  const giftCopyTimerRef = useRef<number | null>(null);
  const rsvpFieldId = useId();
  const giftFieldId = useId();
  const timerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (giftCopyTimerRef.current !== null) window.clearTimeout(giftCopyTimerRef.current);
    };
  }, []);

  /**
   * The photo card grows from inside the box to the whole screen. Its
   * containing block is the box, so the full-screen rectangle has to be
   * expressed relative to the box — a layout fact CSS cannot name. Measured
   * once, on tap, and handed to the stylesheet as custom properties; the
   * stylesheet owns every timing and easing.
   */
  const measureExpansion = () => {
    const root = rootRef.current;
    const box = boxRef.current;
    if (!root || !box) return;

    const rootRect = root.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();

    root.style.setProperty("--sdp-expand-left", `${rootRect.left - boxRect.left}px`);
    root.style.setProperty("--sdp-expand-top", `${rootRect.top - boxRect.top}px`);
    root.style.setProperty("--sdp-expand-width", `${rootRect.width}px`);
    root.style.setProperty("--sdp-expand-height", `${rootRect.height}px`);
  };

  /**
   * The review harness switches viewport width without remounting, so the
   * measured rectangle has to follow the phone frame or the grown photo
   * would keep a stale size. Cheap: it only writes custom properties.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureExpansion());
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const openBox = () => {
    if (phase !== "closed") return;
    measureExpansion();
    setPhase("opening");
    timerRef.current = window.setTimeout(
      () => setPhase("hero"),
      reducedMotion ? HERO_AT_REDUCED_MS : HERO_AT_MS,
    );
  };

  const resolved = resolveInvitation(data, variant);
  // One canonical instant, one derivation point (CLAUDE.md §7).
  const ceremony = deriveCeremonyDisplay(data.ceremonyDateTimeIso, data.timeZone);
  /* Same canonical instant the date, weekday and time above are read from —
     never a second parse and never a separate countdown target
     (CLAUDE.md §7). The shared hook owns the one-second tick, its cleanup
     and the clamp at zero; `hasPassed` is its, not this template's. */
  const countdown = useCountdown(data.ceremonyDateTimeIso);
  /* Hours, minutes and seconds are padded so the row's width does not
     change as they tick; days are left as they fall. */
  const countdownValues = [
    String(countdown.days),
    String(countdown.hours).padStart(2, "0"),
    String(countdown.minutes).padStart(2, "0"),
    String(countdown.seconds).padStart(2, "0"),
  ];

  const primaryName = resolved.primary.personName;
  const secondaryName = resolved.secondary.personName;
  const photoAlt = `Ảnh cưới của ${primaryName} và ${secondaryName}`;

  // Same local derivation the Green Ivory direction uses: the resolver owns
  // WHO is primary, the template only labels them (CLAUDE.md §5).
  const primaryRole = variant === "BRIDE" ? BRIDE_ROLE : GROOM_ROLE;
  /* Which side's venue the rite is announced at is a variant rule, so it
     comes from the shared resolver (`ceremonyHost`: Thành Hôn at the groom's
     side for COMMON/GROOM, Vu Quy at the bride's) rather than being decided
     in this template — CLAUDE.md §5/§6. */
  const riteVenue = resolved.ceremonyHost;

  /* Per-side receptions (tiệc), from the same shared resolver the gift slip
     reads: COMMON carries Nhà Trai and Nhà Gái independently, GROOM/BRIDE
     only their own side. Each side keeps its own instant, venue and map —
     nothing is shared between them and nothing is derived from the rite.

     A side with neither a usable instant nor a venue is dropped entirely
     rather than rendered as an empty card, and each line inside a row is
     printed only when that field exists: no placeholder, no substitution
     from the other side (docs/DECISIONS.md M6–M10, P7). */
  const receptions = resolved.operationalSides
    .map((side) => {
      const iso = side.receptionDateTimeIso?.trim() ?? "";
      const usable = iso !== "" && !Number.isNaN(new Date(iso).getTime());
      const when = usable ? deriveCeremonyDisplay(iso, data.timeZone) : null;
      return {
        side,
        when,
        /* The rite's day is already printed above, so a reception on the
           same day shows its hour alone and only a different day repeats
           the full date. */
        sameDay: when !== null && when.fullDateLabel === ceremony.fullDateLabel,
        title: resolveReceptionTitle(data, side),
        venueName: side.venueName?.trim() ?? "",
        venueAddress: side.venueAddress?.trim() ?? "",
        /* A directions link is offered only for a real http(s) address and
           only while the Project shows directions — never a dead link. */
        mapsUrl: isMapUrl(side.mapsUrl) ? side.mapsUrl.trim() : "",
      };
    })
    .filter(
      (entry) =>
        entry.when !== null ||
        (sections.venue && (entry.venueName !== "" || entry.venueAddress !== "")),
    );

  const multiReception = receptions.length > 1;

  /* Wedding-day timeline steps.

     Every hour on the list is derived from that step's own canonical
     instant through the SAME shared derivation point the ceremony date and
     the countdown use — no step time is written out by hand and there is
     no second parse (CLAUDE.md §7).

     The rite step is told apart by comparing instants, not by matching a
     label: the step whose instant IS `data.ceremonyDateTimeIso` is the
     ceremony, so it can never drift from the hour printed on the
     invitation, and it carries the variant's own rite title straight from
     the shared resolver — Lễ Thành Hôn for COMMON and GROOM, Lễ Vu Quy for
     BRIDE (CLAUDE.md §5, resolved by the domain layer and only labelled
     here, §6). */
  /* Both families, primary side first.

     Which side leads is a variant rule and comes from the shared resolver
     (CLAUDE.md §5): COMMON and GROOM lead with the groom's family, BRIDE
     with the bride's. Both sides stay on the page in every variant —
     §5 forbids treating one side as the only family on COMMON, and a
     Vietnamese invitation names both houses whichever side it is sent
     from. Only the order changes.

     Nothing is invented and nothing is padded: a side contributes only the
     parent names it actually has, in the dataset's own wording, and a side
     with no name at all is dropped rather than printed as an empty column.
     If neither side has a name the section does not render, so an empty
     band can never appear. */
  const familySides = [resolved.primary, resolved.secondary]
    .map((side) => ({
      side,
      parents: [side.fatherName, side.motherName]
        .map((name) => name?.trim())
        .filter((name): name is string => Boolean(name)),
      address: side.familyAddress?.trim() || undefined,
    }))
    .filter((entry) => entry.parents.length > 0);

  const slotPhotos = resolveSlotPhotos(projectPhotos);

  /* `undefined` means the internal prototype with no Project media at all:
     the frames keep this direction's own demo photographs, which is the
     approved review appearance and exists only for internal visual review.
     An array means a real Project's own media, and then a frame with no
     photo of its own is omitted rather than filled with demo art
     (docs/DECISIONS.md P7: demo media is never a production fallback).

     Customer media is expected to hold at least one photograph (see the
     photo-slot note above). It is never empty in Se Duyên V1, so no frame a
     guest sees is ever filled from the demo set. */
  const customerMedia = projectPhotos !== undefined;
  const framed = (stem: PhotoSlotStem) => !customerMedia || slotPhotos[stem] !== undefined;
  /* The customer's own caption when there is one; otherwise the fixed
     template copy written for the demo photograph in that frame. */
  const framedAlt = (stem: PhotoSlotStem, fallback: string) => slotPhotos[stem]?.alt ?? fallback;
  const albumFramed =
    framed("albumLead") || framed("albumTall") || framed("albumSmall") || framed("albumFoot");

  /* The gallery frames a guest can open, in layout order and only where a
     photo actually resolved — so a part-filled album steps through the
     photos that exist and never through an empty frame. The direction's own
     demo art is not openable: there is nothing of the customer's to show
     (docs/DECISIONS.md P7). */
  const galleryImages: LightboxImage[] = GALLERY_SLOTS.flatMap((stem) => {
    const photo = slotPhotos[stem];
    return photo ? [{ src: photo.src, alt: photo.alt }] : [];
  });

  const lightbox = useLightbox();

  /* Shared visual play/pause state. This prototype loads and plays no audio
     at all (see `use-music-control`), so there is nothing that could
     autoplay; the state starts paused and only this control changes it. */
  const music = useMusicControl();
  const musicTrack = data.music?.trackLabel?.trim() ?? "";

  const ceremonyInstantMs = new Date(data.ceremonyDateTimeIso).getTime();
  const timelineSteps = data.timeline.map((item, index) => {
    const isRite = new Date(item.dateTimeIso).getTime() === ceremonyInstantMs;
    return {
      key: `${index}-${item.dateTimeIso}`,
      timeLabel: deriveCeremonyDisplay(item.dateTimeIso, data.timeZone).timeLabel,
      title: isRite ? resolved.ceremonyTitle : item.label,
      note: TIMELINE_NOTES[item.label],
      isRite,
    };
  });
  /* null means "untouched", so a personalized guest sees their own name
     already written in and the harness's personalization toggle still
     reaches the field until someone edits it. */
  const rsvpNameValue = rsvpName ?? (personalization ? guestDisplayName : "");
  const rsvpChoiceSummary =
    RSVP_CHOICES.find((choice) => choice.value === rsvpChoice)?.summary ?? "";
  const rsvpNoteValue = rsvpNote.trim();
  const secondaryRole = variant === "BRIDE" ? GROOM_ROLE : BRIDE_ROLE;

  /* Rule of Three for the gift section, answered by the shared resolver and
     not by this template (CLAUDE.md §5/§6): COMMON offers both families'
     own gift details side by side, GROOM and BRIDE offer that one side.
     `operationalSides` is the same list the other directions read. */
  const giftSides = resolved.operationalSides;
  const giftSide = giftSides[Math.min(giftSideIndex, giftSides.length - 1)];
  /* Existing fictional wording — the fuller note, which also speaks to
     guests who cannot attend. No new data contract is introduced here. */
  const giftNote = data.giftIntroNoteExtended ?? data.giftIntroNote;
  /* The chosen side's own configured QR when the dataset carries one, else
     this pilot's demo block for that side — so the QR follows the Nhà Trai /
     Nhà Gái choice on COMMON and matches the single side on GROOM / BRIDE.
     Sides are told apart by dataset identity, the same way
     `resolveReceptionTitle` does it, rather than by reading a label. */
  const giftQrSrc =
    giftSide.gift.qrImageUrl ??
    (giftSide === data.bride ? GIFT_DEMO_QR.bride : GIFT_DEMO_QR.groom);

  /* The feedback is tied to the slip state it was produced in, so a number
     that is no longer on the slip cannot keep a "copied" mark: switching
     family or closing the envelope changes the key and the mark is simply
     not rendered any more. Derived here rather than reset from an effect. */
  const giftCopyKey = `${giftSideIndex}:${giftOpen}`;
  const giftCopyState = giftCopy?.key === giftCopyKey ? giftCopy.state : "idle";

  /* Copies whichever side is on the slip right now, so COMMON copies the
     chosen family's number and GROOM / BRIDE copy their single one. The
     feedback waits for the write to settle and says so plainly when it
     fails — a guest told "Đã sao chép" over an empty clipboard pastes the
     wrong account number into a transfer. */
  const copyGiftAccount = async () => {
    if (giftCopyTimerRef.current !== null) window.clearTimeout(giftCopyTimerRef.current);
    const key = giftCopyKey;
    try {
      await navigator.clipboard.writeText(giftSide.gift.accountNumber);
      setGiftCopy({ key, state: "done" });
    } catch {
      setGiftCopy({ key, state: "failed" });
    }
    giftCopyTimerRef.current = window.setTimeout(
      () => setGiftCopy((current) => (current?.key === key ? null : current)),
      GIFT_COPY_RESET_MS,
    );
  };

  /* The gilt label carries the feedback itself, in its own type and on its
     own line, so nothing below the number moves while the message shows. */
  const giftAccountLabel =
    giftCopyState === "done"
      ? GIFT_COPY_DONE
      : giftCopyState === "failed"
        ? GIFT_COPY_FAILED
        : GIFT_ACCOUNT_LABEL;

  const guestLine = resolveGuestLine(
    personalization,
    guestDisplayName,
    data.invitationWording.defaultGuestLabel,
  );

  /* The customer's own invitation sentence, shown on the plate without
     saying anything twice.

     The sentence is split at its `{guest}` token and both halves are kept:
     what comes before the guest is printed above the guest line, what comes
     after below it, so no customer wording is ever dropped. The one thing
     skipped is a lead that merely repeats the salutation already set on its
     own line above ("Trân trọng kính mời"), which is how the default
     wording reads.

     The shared formatter does the substitution on each half — the
     `{ceremonyTitle}` token included, always from the variant resolver — so
     the wording rules stay in one place. A template with no `{guest}` token
     has nothing to duplicate and is printed whole, below the guest line. */
  const wordingTemplate = data.invitationWording.template ?? "";
  const guestTokenAt = wordingTemplate.indexOf(GUEST_TOKEN);
  const buildWording = (part: string) =>
    buildInvitationMessage(part, resolved.ceremonyTitle, personalization, guestDisplayName).trim();

  const leadWording = guestTokenAt >= 0 ? buildWording(wordingTemplate.slice(0, guestTokenAt)) : "";
  const inviteLead = sameWording(leadWording, data.invitationWording.salutation) ? "" : leadWording;
  const inviteMessage = buildWording(
    guestTokenAt >= 0 ? wordingTemplate.slice(guestTokenAt + GUEST_TOKEN.length) : wordingTemplate,
  );

  // The interior only exists once the box has been opened, so a guest cannot
  // scroll past an unopened invitation.
  const interiorVisible = phase === "hero";

  return (
    <div className={`${styles.page} ${pilotDisplay.variable} ${pilotSans.variable}`}>
      {/* ================= FROZEN: approved cover + opening ================= */}
      <div ref={rootRef} className={styles.root} data-phase={phase}>
        {/* ---- Box stage: closed box, lid lift, photo rising and then growing.
             Not aria-hidden in the hero phase any more — the photo lives here
             now, so only the cover text steps out of the accessibility tree. */}
        <section className={styles.stage}>
          <div className={styles.background} />

          <div className={styles.coverTop} aria-hidden={phase !== "closed"}>
            <p className={styles.coverEyebrow}>{COVER_EYEBROW}</p>

            <h1 className={styles.coverNames}>
              <span className={styles.coverName}>{primaryName}</span>
              <span className={styles.coverAmp}>&amp;</span>
              <span className={styles.coverName}>{secondaryName}</span>
            </h1>
          </div>

          {/* The whole box is the control — there is no separate button. The
              hint rides along in this row so it stays tied to the box. */}
          <div className={styles.boxArea}>
            <button
              type="button"
              className={styles.boxButton}
              onClick={openBox}
              disabled={phase !== "closed"}
              aria-label={OPEN_HINT}
            >
              <span className={styles.box} ref={boxRef}>
                <span className={`${styles.boxArt} ${styles.boxBase}`} />
                <span className={`${styles.boxArt} ${styles.boxLid}`} />

                {/* Clipped to the basin's front inner rim, so the card's lower
                    edge stays inside the box as it rises — then this same slot
                    grows to the full screen and becomes the hero image. */}
                <span className={styles.photoSlot}>
                  <span
                    className={styles.photoCard}
                    style={slotPhotoStyle("hero", slotPhotos.hero)}
                    role="img"
                    aria-label={photoAlt}
                  />
                </span>
              </span>
            </button>

            {/* Immediately under the box, because it is about the box. */}
            <p className={styles.coverHint} aria-hidden={phase !== "closed"}>
              {OPEN_HINT}
            </p>
          </div>

          <div className={styles.coverBottom} aria-hidden={phase !== "closed"}>
            <p className={styles.coverDate}>
              <span>{ceremony.weekdayLabel}</span>
              <span className={styles.coverDateMain}>{ceremony.fullDateLabel}</span>
            </p>
          </div>
        </section>

        {/* ---- Photo-led hero: scrim and text only. The picture beneath is the
             grown card, not a second copy. ---- */}
        <section className={styles.hero} aria-hidden={phase !== "hero"}>
          <div className={styles.heroScrim} />

          <div className={styles.heroText}>
            <p className={styles.heroEyebrow}>{HERO_EYEBROW}</p>

            <h1 className={styles.heroNames}>
              <span className={styles.heroName}>{primaryName}</span>
              <span className={styles.heroAmp}>&amp;</span>
              <span className={styles.heroName}>{secondaryName}</span>
            </h1>

            {/* The one ornament in the hero — the tơ hồng, used sparingly. */}
            <span className={styles.heroThread} aria-hidden="true" />

            <p className={styles.heroDate}>
              <span>{ceremony.weekdayLabel}</span>
              <span className={styles.heroDateMain}>{ceremony.fullDateLabel}</span>
            </p>
          </div>
        </section>
      </div>
      {/* =============== END FROZEN =============== */}

      {interiorVisible && (
        <div className={styles.interior}>
          {/* Discreet music control — a gilt disc on the lacquer, the same
              idiom Vietnamese Heritage and Romantic Minimal already use, in
              this direction's own materials.

              It lives inside the interior, so it appears only once the box
              has been opened: the approved cover and lid sequence keeps
              every pixel it was approved with, and nothing overlays the box
              a guest taps. Hidden entirely when no track is configured. */}
          {musicTrack !== "" && (
            <button
              type="button"
              className={`${styles.musicButton} ${music.isPlaying ? styles.musicButtonActive : ""}`}
              onClick={music.toggle}
              aria-pressed={music.isPlaying}
              aria-label={music.isPlaying ? "Tắt nhạc nền" : "Bật nhạc nền"}
              title={musicTrack}
            >
              <span className={styles.musicIcon} aria-hidden="true">
                {music.isPlaying ? "♫" : "♪"}
              </span>
            </button>
          )}

          {/* ---- 1. Invitation introduction ---- */}
          {sections.mainText && (
            <section className={styles.invite}>
              <div className={styles.inviteSeam} aria-hidden="true" />

              <Reveal y={18} className={styles.inviteCard}>
                {/* The plate is artwork only — every word here is DOM text,
                    per the asset README's ground rules. */}
                <div className={styles.inviteInner}>
                  <p className={styles.inviteRite}>{resolved.ceremonyTitle}</p>

                  <p className={styles.inviteSalutation}>
                    {data.invitationWording.salutation}
                  </p>

                  {inviteLead !== "" && (
                    <p className={styles.inviteMessage}>{inviteLead}</p>
                  )}

                  <p className={styles.inviteGuest}>{guestLine}</p>

                  {inviteMessage !== "" && (
                    <p className={styles.inviteMessage}>{inviteMessage}</p>
                  )}

                  <span className={styles.inviteThread} aria-hidden="true" />

                  <div className={styles.inviteWhen}>
                    <span className={styles.inviteWeekday}>{ceremony.weekdayLabel}</span>
                    <span className={styles.inviteDate}>{ceremony.fullDateLabel}</span>
                    <span className={styles.inviteTime}>{ceremony.timeLabel}</span>
                  </div>

                  {/* Static companion label, never presented as computed. */}
                  <p className={styles.inviteLunar}>
                    (Tức ngày {data.ceremonyLunarDateLabel})
                  </p>
                </div>
              </Reveal>
            </section>
          )}

          {/* ---- 2. Couple ---- */}
          {sections.portraitStory && (
            <section className={styles.couple}>
              <Reveal y={16} className={styles.coupleHead}>
                <p className={styles.coupleEyebrow}>{COUPLE_EYEBROW}</p>
                <h2 className={styles.coupleHeading}>
                  {primaryRole} &amp; {secondaryRole}
                </h2>
              </Reveal>

              {/* The aside is positioned against this frame, so it only
                  exists alongside the main photograph. Without it the frame
                  drops the overhang's footroom and the main photo keeps its
                  approved size and position. */}
              {framed("coupleMain") && (
                <Reveal y={0} delay={0.08}>
                  <div
                    className={`${styles.coupleFrames} ${framed("coupleAside") ? "" : styles.coupleFramesSolo}`}
                  >
                    <div
                      className={styles.couplePhotoMain}
                      style={slotPhotoStyle("coupleMain", slotPhotos.coupleMain)}
                      role="img"
                      aria-label={framedAlt("coupleMain", photoAlt)}
                    />
                    {framed("coupleAside") && (
                      <div
                        className={styles.couplePhotoAside}
                        style={slotPhotoStyle("coupleAside", slotPhotos.coupleAside)}
                        role="img"
                        aria-label={framedAlt("coupleAside", photoAlt)}
                      />
                    )}
                  </div>
                </Reveal>
              )}

              <Reveal y={16} delay={0.14} className={styles.coupleNames}>
                <span className={styles.coupleRow}>
                  <span className={styles.coupleRole}>{primaryRole}</span>
                  <span className={styles.coupleName}>{primaryName}</span>
                </span>

                <span className={styles.coupleAmp} aria-hidden="true" />

                <span className={styles.coupleRow}>
                  <span className={styles.coupleRole}>{secondaryRole}</span>
                  <span className={styles.coupleName}>{secondaryName}</span>
                </span>
              </Reveal>

              <Reveal y={16} delay={0.2}>
                <p className={styles.coupleStory}>
                  {data.loveStoryShort ?? data.loveStory}
                </p>
                <span className={styles.coupleLotus} aria-hidden="true" />
              </Reveal>
            </section>
          )}

          {/* ---- 2b. Hai Bên Gia Đình / both families ----
              The last dark beat before the ceremony page opens into full
              ivory. Two houses side by side with one gold hairline between
              them and nothing boxed: the divider is the same faded rule
              the ceremony rail and the countdown dials already use, so the
              two families read as equals rather than as two cards.

              Lacquer in, lacquer out: the couple section ends on flat
              --sdi-lacquer-deep and the ceremony's own seam layer fades
              from exactly that colour, so this section opens AND closes on
              it and both approved junctions are untouched.

              Motion is the shared Reveal only, one short stagger per
              house. */}
          {sections.family && familySides.length > 0 && (
            <section className={styles.houses}>
              <span className={styles.housesWatermark} aria-hidden="true" />

              <Reveal y={16} className={styles.housesHead}>
                <p className={styles.housesEyebrow}>{FAMILY_EYEBROW}</p>
                <h2 className={styles.housesHeading}>{FAMILY_HEADING}</h2>
                <span className={styles.housesRule} aria-hidden="true" />
              </Reveal>

              {/* One column per house that has a name. With a single house
                  the grid collapses to one centred column and no divider
                  is drawn, so nothing hints at a missing family. */}
              <div
                className={styles.housesGrid}
                data-single={familySides.length === 1 || undefined}
              >
                {familySides.map((entry, index) => (
                  <Reveal
                    key={entry.side.sideLabel}
                    y={14}
                    delay={0.08 + 0.07 * index}
                    className={styles.house}
                  >
                    <h3 className={styles.houseLabel}>{entry.side.sideLabel}</h3>

                    {/* Each name on its own line, exactly as stored — no
                        honorific added here and no collective wording. */}
                    <p className={styles.houseParents}>
                      {entry.parents.map((name) => (
                        <span key={name} className={styles.houseParent}>
                          {name}
                        </span>
                      ))}
                    </p>

                    {entry.address && (
                      <p className={styles.houseAddress}>{entry.address}</p>
                    )}
                  </Reveal>
                ))}
              </div>
            </section>
          )}

          {/* ---- 3. Ceremony information ---- */}
          {sections.ceremony && (
            <section className={styles.rite}>
              <div className={styles.riteSeam} aria-hidden="true" />
              <span className={styles.riteWatermark} aria-hidden="true" />

              <Reveal y={16} className={styles.riteHead}>
                <p className={styles.riteEyebrow}>{RITE_EYEBROW}</p>
                <h2 className={styles.riteTitle}>{resolved.ceremonyTitle}</h2>
                <span className={styles.riteRule} aria-hidden="true" />
              </Reveal>

              {/* Weekday, day, month, year and hour all come from the one
                  canonical instant via deriveCeremonyDisplay — nothing here
                  is written by hand (CLAUDE.md §7). */}
              <Reveal y={14} delay={0.08} className={styles.riteWhen}>
                <span className={styles.riteWeekday}>{ceremony.weekdayLabel}</span>

                <span className={styles.riteRail}>
                  <span className={styles.riteRailSide}>
                    {RITE_MONTH_PREFIX} {ceremony.monthLabel}
                  </span>
                  <span className={styles.riteRailDivider} aria-hidden="true" />
                  <span className={styles.riteDay}>{ceremony.dayLabel}</span>
                  <span className={styles.riteRailDivider} aria-hidden="true" />
                  <span className={styles.riteRailSide}>{ceremony.yearLabel}</span>
                </span>

                <span className={styles.riteTime}>{ceremony.timeLabel}</span>
              </Reveal>

              {/* Where the rite itself is held: the hosting family's home.
                  The venue fields below belong to that side's reception and
                  are printed once, in its own row, so no address is repeated
                  twice in this section. No map link here — the contract
                  carries a map for the reception venue, not for a family
                  home, and one is never invented. */}
              {sections.venue && (
              <Reveal y={14} delay={0.16} className={styles.riteVenue}>
                <span className={styles.riteVenueLabel}>{RITE_VENUE_LABEL}</span>
                <p className={styles.riteVenueName}>
                  {RITE_HOME_PREFIX} {riteVenue.sideLabel}
                </p>
                {riteVenue.familyAddress.trim() !== "" && (
                  <p className={styles.riteVenueAddress}>{riteVenue.familyAddress}</p>
                )}
              </Reveal>
              )}

              {/* The receptions, under the rite and in its own type: an hour
                  and a place per side, on the section's gold hairline rather
                  than in cards. */}
              {receptions.length > 0 && (
                <Reveal y={14} delay={0.22} className={styles.riteParties}>
                  {receptions.map((entry) => (
                    <div key={entry.side.sideLabel} className={styles.ritePartyRow}>
                      {multiReception && (
                        <p className={styles.ritePartySide}>{entry.side.sideLabel}</p>
                      )}

                      <p className={styles.ritePartyTitle}>{entry.title}</p>

                      {entry.when && (
                        <p className={styles.ritePartyWhen}>
                          <span className={styles.ritePartyTime}>{entry.when.timeLabel}</span>
                          {!entry.sameDay && (
                            <span className={styles.ritePartyDate}>
                              {entry.when.weekdayLabel}, {entry.when.fullDateLabel}
                            </span>
                          )}
                        </p>
                      )}

                      {sections.venue && entry.venueName !== "" && (
                        <p className={styles.ritePartyVenue}>{entry.venueName}</p>
                      )}
                      {sections.venue && entry.venueAddress !== "" && (
                        <p className={styles.ritePartyAddress}>{entry.venueAddress}</p>
                      )}
                      {sections.directions && entry.mapsUrl !== "" && (
                        <a
                          className={styles.ritePartyDirections}
                          href={entry.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${RITE_DIRECTIONS} — ${entry.venueName || entry.side.sideLabel}`}
                        >
                          {RITE_DIRECTIONS}
                        </a>
                      )}
                    </div>
                  ))}
                </Reveal>
              )}
            </section>
          )}

          {/* ---- 3a. Lịch Trình Hôn Lễ / wedding-day timeline ----
              A tơ hồng drawn down the page with the day's moments knotted
              onto it, not a stack of cards: one gold hairline at a fixed
              left rail, a small knot per step, and the step's hour, title
              and line set in the room to its right. The rite's own knot is
              the lotus medallion the ceremony and couple sections already
              use, so the eye lands on the hour that is actually printed on
              the invitation.

              Lacquer in, lacquer out: this opens on exactly the
              --sdi-lacquer the ceremony card closes down into and closes on
              the same value the countdown opens on, so inserting it between
              them leaves both approved junctions as the two identical
              pixels they already were. Neither neighbour is touched.

              Motion is the shared Reveal only — a staggered fade-up per
              step, nothing continuous and nothing looping, so the
              reduced-motion path is simply the finished list. */}
          {sections.timeline && timelineSteps.length > 0 && (
            <section className={styles.flow}>
              <span className={styles.flowWatermark} aria-hidden="true" />

              <Reveal y={16} className={styles.flowHead}>
                <p className={styles.flowEyebrow}>{TIMELINE_EYEBROW}</p>
                <h2 className={styles.flowHeading}>{TIMELINE_HEADING}</h2>
                <span className={styles.flowRule} aria-hidden="true" />
              </Reveal>

              <ol className={styles.flowList}>
                {timelineSteps.map((step, index) => (
                  <li
                    key={step.key}
                    className={`${styles.flowStep} ${step.isRite ? styles.flowStepRite : ""}`}
                  >
                    <Reveal y={14} delay={0.06 * index} className={styles.flowStepBody}>
                      <p className={styles.flowTime}>{step.timeLabel}</p>
                      <h3 className={styles.flowTitle}>{step.title}</h3>
                      {step.note && <p className={styles.flowNote}>{step.note}</p>}
                      {step.isRite && (
                        <p className={styles.flowRiteMark}>{TIMELINE_RITE_MARK}</p>
                      )}
                    </Reveal>
                  </li>
                ))}
              </ol>

              <Reveal y={12}>
                <p className={styles.flowBadge}>{TIMELINE_DEMO_BADGE}</p>
              </Reveal>
            </section>
          )}

          {/* ---- 3b. Chờ Ngày Se Duyên / countdown ----
              The hinge between the ivory ceremony card and the red gallery
              chapter: the lacquer starts here instead of at the album, so
              the paper-to-lacquer edge the approved layout already had is
              unchanged — this section opens and closes on the album's own
              top colour and simply deepens in the middle.

              Four figures on one line with gold hairlines between them, no
              boxes and no per-second motion: the numerals are tabular so
              the row does not shift as the seconds turn, and nothing here
              animates, which is also what makes it correct under reduced
              motion. Every value comes from the shared hook. */}
          {sections.countdown && (
            <section className={styles.countdown}>
              <span className={styles.countdownGlow} aria-hidden="true" />

              <Reveal y={16} className={styles.countdownHead}>
                <h2 className={styles.countdownHeading}>{COUNTDOWN_HEADING}</h2>
                <span className={styles.countdownRule} aria-hidden="true" />
              </Reveal>

              <Reveal y={14} delay={0.08}>
                {countdown.hasPassed ? (
                  <p className={styles.countdownArrived}>{COUNTDOWN_ARRIVED}</p>
                ) : (
                  /* Label before value in the DOM so the pairs read
                     correctly; the column is reversed visually so the
                     figure still sits above its label. */
                  <dl className={styles.countdownDials}>
                    {COUNTDOWN_LABELS.map((label, index) => (
                      <div key={label} className={styles.countdownDial}>
                        <dt className={styles.countdownDialLabel}>{label}</dt>
                        <dd className={styles.countdownDialValue}>
                          {countdownValues[index]}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                <span className={styles.countdownThread} aria-hidden="true" />
              </Reveal>
            </section>
          )}

          {/* ---- 4. Wedding gallery ----
              Four photos, not a grid: one full-width lead, a staggered pair,
              then a square crop set against the right margin. Each frame is
              a different shape and no two baselines agree, which is what
              keeps it editorial rather than a contact sheet.

              Four is the whole eligible set, not a layout choice. Of the ten
              approved demo photos only 01, 02, 03 and 10 are áo dài without
              a 囍 double-happiness glyph, which this direction excludes;
              05/06/08/09 carry one and 04/07 put the groom in a tuxedo. The
              two already seen in the couple section appear here in markedly
              different crops so they do not read as repeats. */}
          {sections.gallery && albumFramed && (
            <section className={styles.album}>
              <Reveal y={16} className={styles.albumHead}>
                <p className={styles.albumEyebrow}>{ALBUM_EYEBROW}</p>
                <h2 className={styles.albumHeading}>{data.albumHeading}</h2>
                <span className={styles.albumRule} aria-hidden="true" />
              </Reveal>

              {framed("albumLead") && (
                <Reveal y={14} delay={0.08} className={styles.albumLeadRow}>
                  <AlbumFrame
                    className={styles.albumLead}
                    style={slotPhotoStyle("albumLead", slotPhotos.albumLead)}
                    photo={slotPhotos.albumLead}
                    fallbackAlt={framedAlt("albumLead", "Đôi uyên ương trong tà áo dài giữa sắc pháo giấy")}
                    onOpen={lightbox.open}
                  />
                </Reveal>
              )}

              {/* One of the pair on its own is centred rather than left
                  hanging at the edge the other one used to sit against. */}
              {(framed("albumTall") || framed("albumSmall")) && (
                <Reveal y={14} delay={0.14}>
                  <div
                    className={`${styles.albumPair} ${
                      framed("albumTall") && framed("albumSmall") ? "" : styles.albumPairSolo
                    }`}
                  >
                    {framed("albumTall") && (
                      <AlbumFrame
                        className={styles.albumPairTall}
                        style={slotPhotoStyle("albumTall", slotPhotos.albumTall)}
                        photo={slotPhotos.albumTall}
                        fallbackAlt={framedAlt("albumTall", "Cô dâu trong tà áo dài đỏ với chiếc quạt giấy")}
                        onOpen={lightbox.open}
                      />
                    )}
                    {framed("albumSmall") && (
                      <AlbumFrame
                        className={styles.albumPairSmall}
                        style={slotPhotoStyle("albumSmall", slotPhotos.albumSmall)}
                        photo={slotPhotos.albumSmall}
                        fallbackAlt={framedAlt("albumSmall", "Cô dâu và chú rể trong tà áo dài truyền thống")}
                        onOpen={lightbox.open}
                      />
                    )}
                  </div>
                </Reveal>
              )}

              {framed("albumFoot") && (
                <Reveal y={14} delay={0.2} className={styles.albumFootRow}>
                  <AlbumFrame
                    className={styles.albumFoot}
                    style={slotPhotoStyle("albumFoot", slotPhotos.albumFoot)}
                    photo={slotPhotos.albumFoot}
                    fallbackAlt={framedAlt("albumFoot", "Cô dâu và chú rể sóng bước bên nhau")}
                    onOpen={lightbox.open}
                  />
                </Reveal>
              )}
            </section>
          )}

          {/* ---- 5. RSVP ----
              A response card, not a web form: ruled lines instead of boxed
              inputs, the choices as a short written list, and one gold rule
              under the heading.

              PROTOTYPE ONLY. Nothing here talks to Supabase, the RSVP domain
              service or any route handler; submitting swaps in a local
              summary that says so on its face. CLAUDE.md §11 keeps real RSVP
              writes in a shared server-validated service, and this template
              deliberately has no part of it. */}
          {sections.rsvp && (
            <section className={styles.rsvp}>
              <Reveal y={16} className={styles.rsvpCard}>
                <p className={styles.rsvpEyebrow}>{RSVP_EYEBROW}</p>
                <h2 className={styles.rsvpHeading}>{RSVP_HEADING}</h2>
                <span className={styles.rsvpRule} aria-hidden="true" />
                <p className={styles.rsvpIntro}>{RSVP_INTRO}</p>

                {rsvpSent ? (
                  <div className={styles.rsvpDone} role="status">
                    <p className={styles.rsvpDoneTitle}>{RSVP_THANKS}</p>
                    <p className={styles.rsvpDoneLine}>
                      {rsvpNameValue.trim() || guestLine} {rsvpChoiceSummary}
                      {rsvpChoice === "no"
                        ? "."
                        : ` — ${rsvpGuests} ${RSVP_COUNT_UNIT}.`}
                    </p>
                    {rsvpNoteValue && (
                      <p className={styles.rsvpDoneNote}>“{rsvpNoteValue}”</p>
                    )}
                    <p className={styles.rsvpDemo}>{RSVP_DEMO_BADGE}</p>
                    <button
                      type="button"
                      className={styles.rsvpAgain}
                      onClick={() => setRsvpSent(false)}
                    >
                      {RSVP_AGAIN}
                    </button>
                  </div>
                ) : (
                  <form
                    className={styles.rsvpForm}
                    onSubmit={(event) => {
                      /* No network, no action attribute, no handler beyond
                         this: the demo state is the whole behaviour. */
                      event.preventDefault();
                      setRsvpSent(true);
                    }}
                  >
                    <label
                      className={styles.rsvpLabel}
                      htmlFor={`${rsvpFieldId}-name`}
                    >
                      {RSVP_NAME_LABEL}
                    </label>
                    <input
                      id={`${rsvpFieldId}-name`}
                      className={styles.rsvpInput}
                      type="text"
                      autoComplete="off"
                      placeholder={RSVP_NAME_PLACEHOLDER}
                      value={rsvpNameValue}
                      onChange={(event) => setRsvpName(event.target.value)}
                    />

                    <fieldset className={styles.rsvpChoices}>
                      <legend className={styles.rsvpLegend}>
                        {RSVP_ATTENDANCE_LABEL}
                      </legend>
                      {RSVP_CHOICES.map((choice) => (
                        <label key={choice.value} className={styles.rsvpChoice}>
                          <input
                            className={styles.rsvpRadio}
                            type="radio"
                            name={`${rsvpFieldId}-choice`}
                            value={choice.value}
                            checked={rsvpChoice === choice.value}
                            onChange={() => setRsvpChoice(choice.value)}
                          />
                          <span className={styles.rsvpMark} aria-hidden="true" />
                          <span className={styles.rsvpChoiceText}>{choice.label}</span>
                        </label>
                      ))}
                    </fieldset>

                    <div className={styles.rsvpCount}>
                      <span className={styles.rsvpLabel} id={`${rsvpFieldId}-count`}>
                        {RSVP_COUNT_LABEL}
                      </span>
                      <span className={styles.rsvpStepper}>
                        <button
                          type="button"
                          className={styles.rsvpStep}
                          aria-label="Bớt một người"
                          disabled={rsvpGuests <= RSVP_MIN_GUESTS}
                          onClick={() =>
                            setRsvpGuests((count) =>
                              Math.max(RSVP_MIN_GUESTS, count - 1)
                            )
                          }
                        >
                          −
                        </button>
                        <output
                          className={styles.rsvpCountValue}
                          aria-labelledby={`${rsvpFieldId}-count`}
                        >
                          {rsvpGuests}
                          <span className={styles.rsvpCountUnit}>
                            {RSVP_COUNT_UNIT}
                          </span>
                        </output>
                        <button
                          type="button"
                          className={styles.rsvpStep}
                          aria-label="Thêm một người"
                          disabled={rsvpGuests >= RSVP_MAX_GUESTS}
                          onClick={() =>
                            setRsvpGuests((count) =>
                              Math.min(RSVP_MAX_GUESTS, count + 1)
                            )
                          }
                        >
                          +
                        </button>
                      </span>
                    </div>

                    <label
                      className={`${styles.rsvpLabel} ${styles.rsvpNoteLabel}`}
                      htmlFor={`${rsvpFieldId}-note`}
                    >
                      {RSVP_NOTE_LABEL}
                    </label>
                    <textarea
                      id={`${rsvpFieldId}-note`}
                      className={styles.rsvpNoteField}
                      rows={3}
                      placeholder={RSVP_NOTE_PLACEHOLDER}
                      value={rsvpNote}
                      onChange={(event) => setRsvpNote(event.target.value)}
                    />

                    <button type="submit" className={styles.rsvpSubmit}>
                      {RSVP_SUBMIT}
                    </button>
                    <p className={styles.rsvpDemo}>{RSVP_DEMO_BADGE}</p>
                  </form>
                )}
              </Reveal>
            </section>
          )}

          {/* ---- 6. Wedding gift / Mừng Cưới ----
              A lacquer-red gift envelope on the same deep lacquer the RSVP
              card sits on, so the two sections meet without a seam. The
              envelope is the focal point: gold hairline edges, a folded
              flap over a darker envelope mouth, and the lotus medallion as
              its seal. One tap lays the flap back and an ivory slip of
              paper rises out from behind it.

              PROTOTYPE ONLY, and deliberately inert. The bank details are
              the shared fictional demo dataset and the QR on the slip is
              drawn demo artwork; no QR is generated from those details,
              and there is no clipboard action, no link, no network call and
              nothing persisted. The panel says on its face, twice, that
              what it shows is illustrative. */}
          {sections.gift && (
            <section className={styles.gift}>
              <span className={styles.giftGlow} aria-hidden="true" />

              <Reveal y={16} className={styles.giftHead}>
                <p className={styles.giftEyebrow}>{GIFT_EYEBROW}</p>
                <h2 className={styles.giftHeading}>{GIFT_HEADING}</h2>
                <span className={styles.giftRule} aria-hidden="true" />
                <p className={styles.giftNote}>{giftNote}</p>
              </Reveal>

              <Reveal y={14} delay={0.1}>
                <div className={styles.giftStage} data-open={giftOpen || undefined}>
                  {/* The whole envelope is the control, as the wedding box
                      is on the cover — no separate button beside it. */}
                  <button
                    type="button"
                    className={styles.giftEnvelope}
                    aria-expanded={giftOpen}
                    aria-controls={`${giftFieldId}-panel`}
                    aria-label={giftOpen ? GIFT_CLOSE_HINT : GIFT_OPEN_HINT}
                    onClick={() => setGiftOpen((open) => !open)}
                  >
                    <span className={styles.giftPaper} aria-hidden="true">
                      {/* The darker inside of the envelope, on the same
                          triangle as the flap and hidden under it while
                          closed, so the opened mouth has real depth. */}
                      <span className={styles.giftMouth} />
                      {/* The crease of the bottom flap, folded up the way a
                          pointed-flap envelope is made. Its peak meets the
                          top flap's point under the seal. */}
                      <span className={styles.giftFold} />
                      <span className={styles.giftFlap} />
                      <span className={styles.giftSeal} />
                    </span>
                  </button>

                  {/* Mounted in both states, not added and removed: that is
                      what lets the slip slide back down into the envelope on
                      close instead of vanishing under a flap that is still
                      falling. Closed it is display:none — out of the
                      accessibility tree and out of the tab order — and
                      `inert` keeps it unreachable through the short exit
                      transition as well. */}
                  <div
                    id={`${giftFieldId}-panel`}
                    className={styles.giftSlip}
                    inert={!giftOpen}
                  >
                    {giftSides.length > 1 ? (
                      <div
                        className={styles.giftTabs}
                        role="tablist"
                        aria-label={GIFT_SIDE_LEGEND}
                      >
                        {giftSides.map((side, index) => (
                          <button
                            key={side.sideLabel}
                            type="button"
                            role="tab"
                            id={`${giftFieldId}-tab-${index}`}
                            aria-selected={side === giftSide}
                            aria-controls={`${giftFieldId}-details`}
                            className={`${styles.giftTab} ${
                              side === giftSide ? styles.giftTabActive : ""
                            }`}
                            onClick={() => setGiftSideIndex(index)}
                          >
                            {side.sideLabel}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.giftSideLabel}>{giftSide.sideLabel}</p>
                    )}

                    {/* The transfer QR, printed on the slip above the
                        account rows and keyed to the chosen side so it
                        swaps with the tabs. Illustrative artwork only —
                        nothing is encoded from the fictional numbers
                        below, and the caption and the slip's own badge
                        both say so. */}
                    <figure className={styles.giftQr}>
                      <Image
                        className={styles.giftQrImage}
                        src={giftQrSrc}
                        alt={`${GIFT_QR_ALT} — ${giftSide.sideLabel}`}
                        width={600}
                        height={600}
                        unoptimized
                      />
                      <figcaption className={styles.giftQrCaption}>
                        {GIFT_QR_CAPTION}
                      </figcaption>
                    </figure>

                    <dl
                      className={styles.giftRows}
                      id={`${giftFieldId}-details`}
                      role={giftSides.length > 1 ? "tabpanel" : undefined}
                      aria-labelledby={
                        giftSides.length > 1
                          ? `${giftFieldId}-tab-${giftSides.indexOf(giftSide)}`
                          : undefined
                      }
                    >
                      <div className={styles.giftRow}>
                        <dt className={styles.giftRowLabel}>{GIFT_BANK_LABEL}</dt>
                        <dd className={styles.giftRowValue}>{giftSide.gift.bankName}</dd>
                      </div>
                      <div className={styles.giftRow}>
                        <dt className={styles.giftRowLabel}>{GIFT_HOLDER_LABEL}</dt>
                        <dd className={styles.giftRowValue}>
                          {giftSide.gift.accountHolder}
                        </dd>
                      </div>
                      <div className={styles.giftRow}>
                        {/* The label doubles as the copy status line: same
                            type, same place, so the confirmation costs no
                            layout shift and no second line of UI. */}
                        <dt
                          className={`${styles.giftRowLabel} ${
                            giftCopyState === "idle" ? "" : styles.giftRowLabelStatus
                          }`}
                          aria-live="polite"
                        >
                          {giftAccountLabel}
                        </dt>
                        <dd
                          className={`${styles.giftRowValue} ${styles.giftAccountNumber} ${styles.giftAccountRow}`}
                        >
                          <span>{giftSide.gift.accountNumber}</span>
                          {/* Copies the number shown beside it; the glyph
                              becomes a tick once the write has resolved. */}
                          <button
                            type="button"
                            className={styles.giftCopy}
                            onClick={copyGiftAccount}
                            aria-label={`${GIFT_COPY_LABEL} ${giftSide.sideLabel}`}
                          >
                            {giftCopyState === "done" ? (
                              <svg
                                viewBox="0 0 16 16"
                                aria-hidden="true"
                                focusable="false"
                              >
                                <path
                                  d="M3 8.5 6.3 11.8 13 4.7"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : (
                              <svg
                                viewBox="0 0 16 16"
                                aria-hidden="true"
                                focusable="false"
                              >
                                <rect
                                  x="5.8"
                                  y="1.7"
                                  width="8.5"
                                  height="10.6"
                                  rx="1.6"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.3"
                                />
                                <path
                                  d="M10.2 14.3H3.3a1.6 1.6 0 0 1-1.6-1.6V4.9"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        </dd>
                      </div>
                    </dl>

                    <p className={styles.giftDemo}>{GIFT_DEMO_BADGE}</p>
                  </div>

                  {/* Caption for the stage, not a second control: the
                      envelope itself carries the accessible name. */}
                  <p className={styles.giftHint} aria-hidden="true">
                    {giftOpen ? GIFT_CLOSE_HINT : GIFT_OPEN_HINT}
                  </p>
                </div>
              </Reveal>
            </section>
          )}

          {/* ---- 7. Lời cảm ơn / Thank you ----
              The last beat. The lacquer that has carried every section
              since the hero finally darkens out, and the one photograph
              rises out of it under an arch with no frame around it: the
              image is masked away at the foot so the red of the studio
              backdrop becomes the red of the page.

              Then the couple's own words, the tơ hồng drawn under them as
              a single thread, and their names signed in the same gilt the
              cover opened with — the invitation closes on the two names it
              opened on.

              The names come from the shared resolver, so the signature
              order follows the variant the way the cover and the couple
              section already do (CLAUDE.md §5): COMMON and GROOM sign with
              the groom first, BRIDE with the bride first. */}
          {sections.closing && (
            <section className={styles.closing}>
              <span className={styles.closingGlow} aria-hidden="true" />

              <Reveal y={16} className={styles.closingHead}>
                <p className={styles.closingEyebrow}>{CLOSING_EYEBROW}</p>
                <span className={styles.closingRule} aria-hidden="true" />
              </Reveal>

              {framed("closing") && (
                <Reveal y={14} delay={0.08}>
                  <div
                    className={styles.closingPhoto}
                    style={slotPhotoStyle("closing", slotPhotos.closing)}
                    role="img"
                    aria-label={framedAlt("closing", photoAlt)}
                  />
                </Reveal>
              )}

              <Reveal y={16} delay={0.14}>
                {/* Editable wording; the line breaks in the demo copy are
                    honoured here rather than reflowed. */}
                <p className={styles.closingMessage}>{data.closingMessage}</p>
              </Reveal>

              <Reveal y={16} delay={0.2}>
                <span className={styles.closingThread} aria-hidden="true" />

                <p className={styles.closingSign}>
                  <span className={styles.closingSignName}>{primaryName}</span>
                  <span className={styles.closingSignAmp} aria-hidden="true">
                    &amp;
                  </span>
                  <span className={styles.closingSignName}>{secondaryName}</span>
                </p>
              </Reveal>
            </section>
          )}
        </div>
      )}

      {/* Outside the interior: that element is a size container, which would
          make it the containing block for a fixed overlay. */}
      {lightbox.image && (
        <SeDuyenLightbox
          images={galleryImages}
          image={lightbox.image}
          onSelect={lightbox.open}
          onClose={lightbox.close}
        />
      )}
    </div>
  );
}

/**
 * One album frame. With a photo of the Project's own it becomes the control
 * that opens that photo full size; without one it stays exactly what it was,
 * a decorative frame carrying this direction's demo art, which is not the
 * customer's to open.
 */
function AlbumFrame({
  className,
  style,
  photo,
  fallbackAlt,
  onOpen,
}: {
  className: string;
  style?: CSSProperties;
  photo?: AlbumPhoto;
  fallbackAlt: string;
  onOpen: (image: LightboxImage) => void;
}) {
  if (!photo) {
    return <div className={className} style={style} role="img" aria-label={fallbackAlt} />;
  }
  return (
    <button
      type="button"
      className={`${className} ${styles.photoButton}`}
      style={style}
      onClick={() => onOpen({ src: photo.src, alt: photo.alt })}
      aria-label={`Xem ảnh lớn: ${photo.alt}`}
    />
  );
}

/**
 * Full-size view of one gallery photo. Same shape as the Vietnamese Heritage
 * and Romantic Minimal overlays — scrim, contained photo, close control and
 * Escape from the shared `useLightbox` — in this direction's lacquer and
 * gilt, plus stepping through the photos the album actually has.
 */
function SeDuyenLightbox({
  images,
  image,
  onSelect,
  onClose,
}: {
  images: LightboxImage[];
  image: LightboxImage;
  onSelect: (image: LightboxImage) => void;
  onClose: () => void;
}) {
  const index = images.findIndex((item) => item.src === image.src);
  const canStep = images.length > 1 && index >= 0;

  useEffect(() => {
    if (!canStep) return;
    const step = (delta: number) =>
      onSelect(images[(index + delta + images.length) % images.length]);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canStep, images, index, onSelect]);

  const step = (delta: number) => {
    if (!canStep) return;
    onSelect(images[(index + delta + images.length) % images.length]);
  };

  return (
    <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={image.alt}>
      <button type="button" className={styles.lightboxScrim} aria-label="Đóng" onClick={onClose} />

      <div className={styles.lightboxFrame}>
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes="92vw"
          unoptimized
          style={{ objectFit: "contain" }}
        />
      </div>

      {canStep && (
        <>
          <button
            type="button"
            className={`${styles.lightboxStep} ${styles.lightboxPrev}`}
            onClick={() => step(-1)}
            aria-label="Ảnh trước"
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.lightboxStep} ${styles.lightboxNext}`}
            onClick={() => step(1)}
            aria-label="Ảnh tiếp theo"
          >
            ›
          </button>
        </>
      )}

      <button
        type="button"
        className={styles.lightboxClose}
        onClick={onClose}
        aria-label="Đóng"
        autoFocus
      >
        ✕
      </button>
    </div>
  );
}
