"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Cormorant_Garamond, Great_Vibes, Playfair_Display } from "next/font/google";
import { AnimatePresence, motion } from "framer-motion";

import { deriveCeremonyDisplay } from "../../_shared/derive-ceremony";
import { useCountdown } from "../../_shared/use-countdown";
import { useReducedMotion } from "../../_shared/use-reduced-motion";
import { useClipboard } from "../../_shared/use-clipboard";
import { useRsvpForm } from "../../_shared/use-rsvp-form";
import { useMusicControl } from "../../_shared/use-music-control";
import { resolveInvitation, resolveReceptionTitle } from "../../_shared/resolve-variant";
import { resolveGuestLine } from "../../_shared/invitation-text";
import { RSVP_OPTIONS } from "../../_shared/rsvp-options";
import { Reveal } from "../../_shared/reveal";
import { useLightbox } from "../../_shared/use-lightbox";
import { assignPhotosToSlots, photoObjectPosition } from "../../_shared/album-assignment";
import type { LightboxImage } from "../../_shared/use-lightbox";
import type {
  AlbumPhoto,
  DerivedCeremonyDisplay,
  DressCodeSwatch,
  InvitationVariant,
  PrototypeWeddingData,
  LoveStoryMilestone,
  MediaOrientation,
  SideDetails,
} from "../../_shared/types";
import type { SectionVisibility } from "../../_shared/sections";
import styles from "./vietnamese-heritage.module.css";

// Compact schedule row: up to 5 evenly spaced programme columns.
const MAX_SCHEDULE_ITEMS = 5;
// Chữ Hỷ (囍, "double happiness") — the traditional Vietnamese/East Asian
// wedding seal glyph, rendered via system CJK font fallback (no font file
// embedded, per docs/TYPOGRAPHY_AND_MOTION.md §4's licensing rule).
const HY = "囍";

// Opening-cover typography. Both faces are SIL Open Font License (free for
// web + commercial use) and ship a Vietnamese subset; next/font self-hosts
// them, so no font file is committed and only this template loads them.
const heritageSerif = Cormorant_Garamond({
  subsets: ["vietnamese"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--vh-serif",
});

const heritageDisplay = Playfair_Display({
  subsets: ["vietnamese"],
  weight: "500",
  style: "italic",
  display: "swap",
  variable: "--vh-display",
});

// Calligraphic "Trân Trọng Kính Mời" line — SIL OFL, Vietnamese subset.
const heritageScript = Great_Vibes({
  subsets: ["vietnamese"],
  weight: "400",
  display: "swap",
  variable: "--vh-script",
});

// Product-Owner-supplied Vietnamese Heritage decor (Task 029).
const HERITAGE_DECOR_BASE = "/prototypes/invitation/decor/vietnamese-heritage/";
const HERITAGE_ASSETS = {
  paperRed: `${HERITAGE_DECOR_BASE}heritage-paper-red.png`,
  paperIvory: `${HERITAGE_DECOR_BASE}heritage-paper-ivory.png`,
  borderLeft: `${HERITAGE_DECOR_BASE}heritage-border-left.png`,
  borderRight: `${HERITAGE_DECOR_BASE}heritage-border-right.png`,
  medallion: `${HERITAGE_DECOR_BASE}heritage-double-happiness-medallion.png`,
  divider: `${HERITAGE_DECOR_BASE}heritage-gold-divider.png`,
  floralTopLeft: `${HERITAGE_DECOR_BASE}heritage-floral-top-left.png`,
  floralBottomRight: `${HERITAGE_DECOR_BASE}heritage-floral-bottom-right.png`,
} as const;

// Internal-prototype demo photography (self-generated placeholder art,
// shared with the other directions) — swapped for real Project media later.
const DEMO_HERO_PHOTO = "/prototypes/invitation/demo/hero.svg";
const DEMO_PORTRAITS = {
  groom: "/prototypes/invitation/demo/groom-portrait.svg",
  couple: "/prototypes/invitation/demo/tri-center.svg",
  bride: "/prototypes/invitation/demo/bride-portrait.svg",
} as const;

type OpeningPhase = "closed" | "opening" | "done";

// Tap → Song Hỷ reacts and the cover text settles away (0–doorsStart),
// then the two red doors part left/right (doorsStart–total).
const OPENING_TIMING = {
  doorsStartMs: 260,
  doorsDurationMs: 880,
  totalMs: 1180,
  reducedTotalMs: 220,
} as const;

const DOOR_EASE = [0.65, 0, 0.35, 1] as const;

interface Props {
  data: PrototypeWeddingData;
  variant: InvitationVariant;
  personalization: boolean;
  guestDisplayName: string;
  sections: SectionVisibility;
}

export function VietnameseHeritagePrototype({ data, variant, personalization, guestDisplayName, sections }: Props) {
  const [openingPhase, setOpeningPhase] = useState<OpeningPhase>("closed");
  const [giftOpen, setGiftOpen] = useState(false);
  const giftButtonRef = useRef<HTMLButtonElement>(null);
  // Hand focus back to the gift button without scrolling the invitation.
  const closeGift = useCallback(() => {
    setGiftOpen(false);
    giftButtonRef.current?.focus({ preventScroll: true });
  }, []);
  const reducedMotion = useReducedMotion();
  // RSVP name prefill only with the personalization add-on (CLAUDE.md §10).
  const rsvpPrefill = personalization ? guestDisplayName.trim() : "";
  const music = useMusicControl();
  const lightbox = useLightbox();
  // Album viewer lives at the root (like the other overlays) so its fixed
  // overlay is never inside an animated/transformed ancestor.
  const [albumIndex, setAlbumIndex] = useState<number | null>(null);
  // Photos placed into the album's slots by orientation (visual order).
  const albumArrangement = useMemo(() => arrangeHeritageAlbum(data.album), [data.album]);
  const albumOpenerRef = useRef<HTMLElement | null>(null);
  const openAlbum = useCallback((index: number, opener: HTMLElement) => {
    albumOpenerRef.current = opener;
    setAlbumIndex(index);
  }, []);
  // Hand focus back to the tapped photo without scrolling the invitation.
  const closeAlbum = useCallback(() => {
    setAlbumIndex(null);
    albumOpenerRef.current?.focus({ preventScroll: true });
  }, []);
  // Functional update, so rapid taps each advance from the latest photo.
  const stepAlbum = useCallback(
    (step: number) =>
      setAlbumIndex((current) =>
        current === null ? current : (current + step + data.album.length) % data.album.length
      ),
    [data.album.length]
  );

  const resolved = resolveInvitation(data, variant);
  const ceremony = deriveCeremonyDisplay(data.ceremonyDateTimeIso, data.timeZone);
  const countdown = useCountdown(data.ceremonyDateTimeIso);
  const guestLine = resolveGuestLine(personalization, guestDisplayName, data.invitationWording.defaultGuestLabel);
  const multiSide = resolved.operationalSides.length > 1;

  const opened = openingPhase !== "closed";

  const startOpening = () => {
    if (openingPhase !== "closed") return;
    setOpeningPhase("opening");
  };

  // Unmount the cover once the doors have fully cleared the screen.
  useEffect(() => {
    if (openingPhase !== "opening") return;
    const timer = window.setTimeout(
      () => setOpeningPhase("done"),
      reducedMotion ? OPENING_TIMING.reducedTotalMs : OPENING_TIMING.totalMs
    );
    return () => window.clearTimeout(timer);
  }, [openingPhase, reducedMotion]);

  const showVenues = sections.receptionTime || sections.venue || sections.directions;
  const showCeremonialPage =
    sections.family ||
    sections.threePhoto ||
    sections.mainText ||
    sections.ceremony ||
    showVenues ||
    sections.timeline ||
    sections.countdown;

  return (
    <div
      className={`${styles.root} ${heritageSerif.variable} ${heritageDisplay.variable} ${heritageScript.variable} ${
        openingPhase === "done" ? "" : styles.rootClosed
      }`}
    >
      <button
        type="button"
        className={`${styles.musicButton} ${music.isPlaying ? styles.musicButtonActive : ""}`}
        onClick={music.toggle}
        aria-pressed={music.isPlaying}
        aria-label={music.isPlaying ? "Tắt nhạc nền" : "Bật nhạc nền"}
        title={data.music.trackLabel}
      >
        <span className={styles.musicIcon} aria-hidden="true">
          {music.isPlaying ? "♫" : "♪"}
        </span>
      </button>

      {openingPhase !== "done" && (
        <SplitDoorCover
          phase={openingPhase}
          reducedMotion={reducedMotion}
          primaryName={resolved.primary.personName}
          secondaryName={resolved.secondary.personName}
          weekdayLabel={ceremony.weekdayLabel}
          dateLabel={ceremony.fullDateLabel}
          onOpen={startOpening}
        />
      )}

      {/* Inner invitation starts fading in as the doors begin to part, so */}
      {/* it is already visible in the widening gap — no hard cut. */}
      <motion.div
        initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
        animate={{ opacity: opened ? 1 : 0, y: opened ? 0 : reducedMotion ? 0 : 12 }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { duration: 0.7, delay: OPENING_TIMING.doorsStartMs / 1000, ease: "easeOut" }
        }
      >
        <HeritageHero
          opened={opened}
          reducedMotion={reducedMotion}
          ceremonyTitle={resolved.ceremonyTitle}
          primaryName={resolved.primary.personName}
          secondaryName={resolved.secondary.personName}
          weekdayLabel={ceremony.weekdayLabel}
          dateLabel={ceremony.fullDateLabel}
          timeLabel={ceremony.timeLabel}
        />

        {showCeremonialPage && (
          <HeritageCeremonialPage
            sections={sections}
            primary={resolved.primary}
            secondary={resolved.secondary}
            // Portraits follow the resolver's side order so each one sits
            // above its own family column.
            primaryPortrait={resolved.primary === data.groom ? DEMO_PORTRAITS.groom : DEMO_PORTRAITS.bride}
            secondaryPortrait={resolved.secondary === data.groom ? DEMO_PORTRAITS.groom : DEMO_PORTRAITS.bride}
            couplePortrait={DEMO_PORTRAITS.couple}
            salutation={data.invitationWording.salutation}
            guestLine={guestLine}
            ceremonyTitle={resolved.ceremonyTitle}
            ceremonyHostLabel={resolved.ceremonyHost.sideLabel}
            ceremonyHostAddress={resolved.ceremonyHost.familyAddress}
            ceremony={ceremony}
            lunarDateLabel={data.ceremonyLunarDateLabel}
          >
            {showVenues && (
              <HeritageVenues
                venues={resolved.operationalSides.map((side) => {
                  const reception = deriveCeremonyDisplay(side.receptionDateTimeIso, data.timeZone);
                  return {
                    side,
                    receptionTitle: resolveReceptionTitle(data, side),
                    reception,
                    // The lunar label belongs to the ceremony day; show it on a
                    // reception only when that reception falls on the same day.
                    lunarDateLabel:
                      reception.fullDateLabel === ceremony.fullDateLabel ? data.ceremonyLunarDateLabel : null,
                  };
                })}
                showSideLabel={multiSide}
                showReceptionTime={sections.receptionTime}
                showVenue={sections.venue}
                showDirections={sections.directions}
              />
            )}

            {sections.timeline && data.timeline.length > 0 && (
              <HeritageSchedule
                items={data.timeline.slice(0, MAX_SCHEDULE_ITEMS).map((item) => ({
                  key: `${item.dateTimeIso}-${item.label}`,
                  timeLabel: deriveCeremonyDisplay(item.dateTimeIso, data.timeZone).timeLabel,
                  label: item.label,
                }))}
              />
            )}

            {sections.countdown && !countdown.hasPassed && (
              <Reveal y={10} className={styles.pageCountdown}>
                <div className={styles.timeline}>
                  <div className={styles.timelineCell}>
                    <span className={styles.timelineValue}>{countdown.days}</span>
                    <span className={styles.timelineLabel}>Ngày</span>
                  </div>
                  <div className={styles.timelineCell}>
                    <span className={styles.timelineValue}>{countdown.hours}</span>
                    <span className={styles.timelineLabel}>Giờ</span>
                  </div>
                  <div className={styles.timelineCell}>
                    <span className={styles.timelineValue}>{countdown.minutes}</span>
                    <span className={styles.timelineLabel}>Phút</span>
                  </div>
                  <div className={styles.timelineCell}>
                    <span className={styles.timelineValue}>{countdown.seconds}</span>
                    <span className={styles.timelineLabel}>Giây</span>
                  </div>
                </div>
              </Reveal>
            )}
          </HeritageCeremonialPage>
        )}

        {/* The programme renders as the compact schedule row on the ceremony */}
        {/* page; the love story carries its own story timeline. */}
        {sections.loveStory && (
          <HeritageLoveStory
            reducedMotion={reducedMotion}
            heading={data.loveStoryHeading}
            milestones={data.loveStoryMilestones}
            backgroundUrl={data.loveStoryBackgroundUrl}
            onOpenImage={lightbox.open}
          />
        )}

        {sections.rsvp && (
          // Keyed by the prefill so switching the previewed guest (or turning
          // personalization on/off) starts that guest's form fresh.
          <HeritageRsvp
            key={rsvpPrefill}
            prefillGuestName={rsvpPrefill}
            reducedMotion={reducedMotion}
          />
        )}

        {sections.gift && (
          // Only the note and the button on the page; bank details and QR
          // stay in the modal until the guest asks for them.
          <section className={styles.giftSection} style={{ backgroundImage: `url(${HERITAGE_ASSETS.paperIvory})` }}>
            <Reveal y={14} className={styles.giftCta}>
              <p className={styles.giftNote}>{data.giftIntroNote}</p>
              <button
                ref={giftButtonRef}
                type="button"
                className={styles.giftButton}
                onClick={() => setGiftOpen(true)}
                aria-haspopup="dialog"
              >
                Gửi quà cưới
              </button>
            </Reveal>
          </section>
        )}

        {sections.dressCode && (
          <HeritageDressCode
            description={data.dressCode.description}
            swatches={data.dressCode.swatches}
            reducedMotion={reducedMotion}
          />
        )}

        {sections.gallery && data.album.length > 0 && (
          <HeritageAlbum
            heading={data.albumHeading}
            arrangement={albumArrangement}
            reducedMotion={reducedMotion}
            onOpen={openAlbum}
          />
        )}

        {sections.closing && (
          <section className={styles.sectionClosing}>
            <div className={styles.closingDivider} aria-hidden="true">
              <span className={styles.closingDividerRule} />
              <LotusMark className={styles.closingDividerLotus} />
              <span className={styles.closingDividerRule} />
            </div>
            <span className={styles.closingSeal}>{HY}</span>
            {/* Wide framed photo as the backdrop, softly shaded; thank-you, */}
            {/* names and date set on top of it. */}
            <Reveal y={16} className={styles.closingFrame}>
              <footer className={styles.closingPanel}>
                <div
                  className={styles.closingPhoto}
                  style={{ backgroundImage: `url(${data.closingPhotoUrl})` }}
                  aria-hidden="true"
                />
                <div className={styles.closingShade} aria-hidden="true" />
                <div className={styles.closingContent}>
                  <p className={styles.closingLine}>{data.closingMessage}</p>
                  <p className={styles.closingNames}>
                    {resolved.primary.personName} &amp; {resolved.secondary.personName}
                  </p>
                  <p className={styles.closingDate}>{ceremony.fullDateLabel}</p>
                </div>
              </footer>
            </Reveal>
          </section>
        )}

        {/* Plain date line only when the closing panel (which carries it) is off. */}
        {!sections.closing && <footer className={styles.footer}>{ceremony.fullDateLabel}</footer>}
      </motion.div>

      {lightbox.image && <HeritageLightbox image={lightbox.image} onClose={lightbox.close} />}

      <AnimatePresence>
        {sections.gallery && albumIndex !== null && albumArrangement.photos[albumIndex] && (
          <HeritageAlbumViewer
            photos={albumArrangement.photos}
            index={albumIndex}
            reducedMotion={reducedMotion}
            onStep={stepAlbum}
            onClose={closeAlbum}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sections.gift && giftOpen && (
          <HeritageGiftModal sides={resolved.operationalSides} reducedMotion={reducedMotion} onClose={closeGift} />
        )}
      </AnimatePresence>
    </div>
  );
}

interface SplitDoorCoverProps {
  phase: OpeningPhase;
  reducedMotion: boolean;
  primaryName: string;
  secondaryName: string;
  weekdayLabel: string;
  dateLabel: string;
  onOpen: () => void;
}

/**
 * Outer opening cover — two ceremonial red doors. Both doors render the
 * same full-width face and each clips its own half, so the closed cover is
 * one seamless composition (no centre divider line). On open the text
 * settles away first, the Song Hỷ medallion glows, then the doors part.
 */
function SplitDoorCover({
  phase,
  reducedMotion,
  primaryName,
  secondaryName,
  weekdayLabel,
  dateLabel,
  onOpen,
}: SplitDoorCoverProps) {
  const opening = phase === "opening";
  const doorsStart = OPENING_TIMING.doorsStartMs / 1000;
  const doorTransition = reducedMotion
    ? { duration: 0 }
    : { duration: OPENING_TIMING.doorsDurationMs / 1000, delay: doorsStart, ease: DOOR_EASE };

  const renderDoor = (side: "left" | "right") => (
    <motion.div
      className={`${styles.door} ${side === "left" ? styles.doorLeft : styles.doorRight}`}
      animate={{ x: opening && !reducedMotion ? (side === "left" ? "-100%" : "100%") : "0%" }}
      transition={doorTransition}
      // The right door repeats the same face purely for the visual split.
      aria-hidden={side === "right" ? true : undefined}
    >
      <div className={styles.doorFace} style={{ backgroundImage: `url(${HERITAGE_ASSETS.paperRed})` }}>
        <div className={styles.doorFrame} />
        {/* Side borders appear only as short, fading top/bottom pieces so */}
        {/* the long middle of each side stays a quiet hairline. */}
        {(["Top", "Bottom"] as const).map((end) => (
          <div key={`left-${end}`} className={`${styles.coverBorder} ${styles.coverBorderLeft} ${styles[`coverBorder${end}`]}`}>
            <Image src={HERITAGE_ASSETS.borderLeft} alt="" fill sizes="200px" priority style={{ objectFit: "contain" }} />
          </div>
        ))}
        {(["Top", "Bottom"] as const).map((end) => (
          <div key={`right-${end}`} className={`${styles.coverBorder} ${styles.coverBorderRight} ${styles[`coverBorder${end}`]}`}>
            <Image src={HERITAGE_ASSETS.borderRight} alt="" fill sizes="200px" priority style={{ objectFit: "contain" }} />
          </div>
        ))}
        <div className={`${styles.coverFloral} ${styles.coverFloralTopLeft}`}>
          <Image src={HERITAGE_ASSETS.floralTopLeft} alt="" fill sizes="180px" loading="eager" style={{ objectFit: "contain" }} />
        </div>
        <div className={`${styles.coverFloral} ${styles.coverFloralBottomRight}`}>
          <Image src={HERITAGE_ASSETS.floralBottomRight} alt="" fill sizes="180px" loading="eager" style={{ objectFit: "contain" }} />
        </div>

        <div className={styles.coverContent}>
          <motion.div
            className={styles.coverText}
            animate={{ opacity: opening ? 0 : 1, y: opening && !reducedMotion ? -6 : 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.3, ease: "easeOut" }}
          >
            <div className={styles.coverTitle}>Thiệp Mời Cưới</div>
            <div className={styles.coverDivider}>
              <Image src={HERITAGE_ASSETS.divider} alt="" fill sizes="150px" loading="eager" style={{ objectFit: "contain" }} />
            </div>
            <div className={styles.coverNames}>
              <span>{primaryName}</span>
              <span className={styles.coverAmp}>&amp;</span>
              <span>{secondaryName}</span>
            </div>
            <div className={styles.coverDate}>
              <span className={styles.coverWeekday}>{weekdayLabel}</span>
              {dateLabel}
            </div>
          </motion.div>

          <motion.div
            className={styles.coverMedallion}
            animate={opening && !reducedMotion ? { scale: [1, 1.05, 1.02] } : { scale: 1 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.45, ease: "easeOut" }}
          >
            <motion.div
              className={styles.coverMedallionGlow}
              animate={{ opacity: opening && !reducedMotion ? 1 : 0 }}
              transition={{ duration: 0.3 }}
            />
            <Image
              src={HERITAGE_ASSETS.medallion}
              alt="Song Hỷ"
              fill
              sizes="240px"
              priority
              style={{ objectFit: "contain" }}
            />
          </motion.div>

          <motion.div
            className={styles.coverHintWrap}
            animate={{ opacity: opening ? 0 : 1 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
          >
            <span className={styles.coverHint}>Chạm để mở thiệp</span>
          </motion.div>
        </div>
      </div>
      <motion.div
        className={styles.doorEdge}
        animate={{ opacity: opening && !reducedMotion ? 1 : 0 }}
        // Only once a real gap has opened — never a line on the closed seam.
        transition={{ duration: 0.3, delay: reducedMotion ? 0 : doorsStart + 0.3 }}
      />
    </motion.div>
  );

  return (
    <motion.div
      className={styles.cover}
      // Reduced motion: no door travel — a quick fade that never blocks access.
      animate={{ opacity: opening && reducedMotion ? 0 : 1 }}
      transition={{ duration: reducedMotion ? OPENING_TIMING.reducedTotalMs / 1000 : 0 }}
    >
      {renderDoor("left")}
      {renderDoor("right")}
      <button
        type="button"
        className={styles.coverOpenButton}
        aria-label="Chạm để mở thiệp mời"
        onClick={onOpen}
        disabled={opening}
      />
    </motion.div>
  );
}

// Hero reveal, in seconds from the tap — a continuation of the door split:
// the framed photo emerges while the doors are still parting, the Song Hỷ
// seal settles onto the frame, then the names, wording and date follow.
const HERO_REVEAL = {
  photo: 0.4,
  seal: 0.78,
  ornament: 0.9,
  ceremony: 0.98,
  names: 1.06,
  date: 1.2,
} as const;

const HERO_EASE = [0.22, 1, 0.36, 1] as const;

interface HeritageHeroProps {
  opened: boolean;
  reducedMotion: boolean;
  ceremonyTitle: string;
  primaryName: string;
  secondaryName: string;
  weekdayLabel: string;
  dateLabel: string;
  timeLabel: string;
}

/**
 * First inner screen. Presentation only: name order and ceremony wording
 * arrive already resolved by the shared variant resolver (CLAUDE.md §5),
 * and weekday/date by the shared ceremony derivation (CLAUDE.md §7).
 */
function HeritageHero({
  opened,
  reducedMotion,
  ceremonyTitle,
  primaryName,
  secondaryName,
  weekdayLabel,
  dateLabel,
  timeLabel,
}: HeritageHeroProps) {
  const heroRef = useRef<HTMLElement>(null);
  const viewportHeight = useScrollViewportHeight(heroRef);
  const reveal = (
    delay: number,
    from: { y?: number },
    duration = 1
  ) => ({
    initial: reducedMotion ? false : { opacity: 0, ...from },
    animate: opened || reducedMotion ? { opacity: 1, y: 0 } : undefined,
    transition: reducedMotion ? { duration: 0 } : { duration, delay, ease: HERO_EASE },
  });

  return (
    <section
      ref={heroRef}
      className={styles.hero}
      style={{
        backgroundImage: `url(${HERITAGE_ASSETS.paperIvory})`,
        ...(viewportHeight ? { ["--hero-viewport-h" as string]: `${viewportHeight}px` } : {}),
      }}
    >
      <div className={styles.heroPhotoWrap}>
        <motion.div className={styles.heroPhotoFrame} {...reveal(HERO_REVEAL.photo, { y: 14 }, 1.3)}>
          <div className={styles.heroPhotoInner}>
            <motion.div
              className={styles.heroPhoto}
              style={{ backgroundImage: `url(${DEMO_HERO_PHOTO})` }}
              role="img"
              aria-label={`Ảnh cưới ${primaryName} và ${secondaryName}`}
              initial={reducedMotion ? false : { scale: 1.04 }}
              animate={opened || reducedMotion ? { scale: 1 } : undefined}
              transition={reducedMotion ? { duration: 0 } : { duration: 2.2, delay: HERO_REVEAL.photo, ease: HERO_EASE }}
            />
          </div>
        </motion.div>

        {/* Corner clusters: the supplied flowers kept small, each paired   */}
        {/* with a gold line-art lotus so they read Vietnamese first. */}
        <motion.div className={`${styles.heroCorner} ${styles.heroCornerTopLeft}`} {...reveal(HERO_REVEAL.photo + 0.25, {}, 1.2)}>
          <div className={styles.heroFloral}>
            <Image src={HERITAGE_ASSETS.floralTopLeft} alt="" fill sizes="110px" loading="eager" style={{ objectFit: "contain" }} />
          </div>
          <LotusMark className={styles.heroLotus} />
        </motion.div>
        <motion.div className={`${styles.heroCorner} ${styles.heroCornerBottomRight}`} {...reveal(HERO_REVEAL.photo + 0.35, {}, 1.2)}>
          <div className={styles.heroFloral}>
            <Image src={HERITAGE_ASSETS.floralBottomRight} alt="" fill sizes="120px" loading="eager" style={{ objectFit: "contain" }} />
          </div>
          <LotusMark className={styles.heroLotus} />
        </motion.div>

        {/* Song Hỷ seal set onto the frame's top edge, like a stamp. */}
        <motion.div className={styles.heroSeal} {...reveal(HERO_REVEAL.seal, { y: 6 }, 1)}>
          <div className={styles.heroSealImage}>
            <Image src={HERITAGE_ASSETS.medallion} alt="Song Hỷ" fill sizes="96px" loading="eager" style={{ objectFit: "contain" }} />
          </div>
        </motion.div>

        {/* Small gold ornament interrupting the frame's bottom edge. */}
        <motion.div className={styles.heroOrnament} {...reveal(HERO_REVEAL.ornament, { y: 4 }, 1)}>
          <div className={styles.heroOrnamentImage}>
            <Image src={HERITAGE_ASSETS.divider} alt="" fill sizes="130px" loading="eager" style={{ objectFit: "contain" }} />
          </div>
        </motion.div>
      </div>

      <motion.div className={styles.heroCeremony} {...reveal(HERO_REVEAL.ceremony, { y: 8 }, 1)}>
        {ceremonyTitle}
      </motion.div>

      <motion.h2 className={styles.heroNames} {...reveal(HERO_REVEAL.names, { y: 10 }, 1.1)}>
        <span>{primaryName}</span>
        <span className={styles.heroAmp}>&amp;</span>
        <span>{secondaryName}</span>
      </motion.h2>

      <motion.div className={styles.heroDate} {...reveal(HERO_REVEAL.date, { y: 6 }, 1)}>
        {weekdayLabel}
        <span className={styles.heroDateSep} aria-hidden="true">
          ·
        </span>
        {dateLabel}
        <span className={styles.heroDateSep} aria-hidden="true">
          ·
        </span>
        {timeLabel}
      </motion.div>
    </section>
  );
}

/**
 * Height of the nearest scrolling viewport — the phone frame in this
 * review page, the browser window on a real device — so the Hero can be
 * exactly one first screen tall. Tracks resizes (e.g. mobile URL bar).
 */
function useScrollViewportHeight(ref: React.RefObject<HTMLElement | null>): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    // Nearest scrolling ancestor, skipping the invitation root itself
    // (its overflow-x:hidden makes overflow-y compute to auto, but it grows
    // with its content and never scrolls). None → the browser window.
    let viewport: HTMLElement | null = ref.current?.parentElement ?? null;
    while (
      viewport &&
      (viewport.classList.contains(styles.root) || !/(auto|scroll)/.test(getComputedStyle(viewport).overflowY))
    ) {
      viewport = viewport.parentElement;
    }

    const measure = () => setHeight(viewport ? viewport.clientHeight : window.innerHeight);
    measure();
    if (!viewport) {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [ref]);

  return height;
}

/**
 * Stylized hoa sen (lotus) in fine gold line art with a faint rose-red
 * centre petal — a restrained Vietnamese motif, drawn inline (no asset of
 * this motif was supplied).
 */
function LotusMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 48" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M32 38 C23 38 12 33 6 23 C15 25 25 30 32 38 Z" fill="rgba(184, 147, 90, 0.12)" />
        <path d="M32 38 C41 38 52 33 58 23 C49 25 39 30 32 38 Z" fill="rgba(184, 147, 90, 0.12)" />
        <path d="M32 37 C24 33 18 25 18 14 C25 18 30 26 32 37 Z" fill="rgba(184, 147, 90, 0.16)" />
        <path d="M32 37 C40 33 46 25 46 14 C39 18 34 26 32 37 Z" fill="rgba(184, 147, 90, 0.16)" />
        <path d="M32 5 C38.5 15 38.5 28 32 37 C25.5 28 25.5 15 32 5 Z" fill="rgba(156, 43, 52, 0.16)" />
        <path d="M32 12 V31" strokeWidth="0.7" opacity="0.7" />
        <path d="M17 43 C25 39.5 39 39.5 47 43" />
      </g>
    </svg>
  );
}

interface HeritageCeremonialPageProps {
  sections: SectionVisibility;
  /** Ordered by the shared variant resolver (CLAUDE.md §5). */
  primary: SideDetails;
  secondary: SideDetails;
  primaryPortrait: string;
  secondaryPortrait: string;
  couplePortrait: string;
  /** Editable wording (data.invitationWording), never a code constant. */
  salutation: string;
  guestLine: string;
  /** "Lễ Thành Hôn" / "Lễ Vu Quy" from the shared resolver. */
  ceremonyTitle: string;
  /** Family home hosting the rite, from the resolver. */
  ceremonyHostLabel: string;
  ceremonyHostAddress: string;
  /** Every date/time part from the one canonical instant (CLAUDE.md §7). */
  ceremony: DerivedCeremonyDisplay;
  lunarDateLabel: string;
  /** Venues / directions / countdown, set below the rite details. */
  children?: React.ReactNode;
}

/**
 * The formal inner page after the Hero, composed as one printed sheet:
 * Song Hỷ → both families → three portraits → "Trân Trọng Kính Mời" + guest
 * → the rite's date block. Presentation only — order, wording, host side
 * and every date part arrive already resolved.
 */
function HeritageCeremonialPage({
  sections,
  primary,
  secondary,
  primaryPortrait,
  secondaryPortrait,
  couplePortrait,
  salutation,
  guestLine,
  ceremonyTitle,
  ceremonyHostLabel,
  ceremonyHostAddress,
  ceremony,
  lunarDateLabel,
  children,
}: HeritageCeremonialPageProps) {
  return (
    <section className={styles.page} style={{ backgroundImage: `url(${HERITAGE_ASSETS.paperIvory})` }}>
      <PageSideBorders />

      <Reveal y={8} className={styles.pageHy}>
        <span className={styles.pageHyRule} aria-hidden="true" />
        <span className={styles.pageHyGlyph} role="img" aria-label="Song Hỷ">
          {HY}
        </span>
        <span className={styles.pageHyRule} aria-hidden="true" />
      </Reveal>

      {sections.family && (
        <div className={styles.familyColumns}>
          <Reveal y={12}>
            <FamilySide side={primary} />
          </Reveal>
          <Reveal y={12} delay={0.12}>
            <FamilySide side={secondary} />
          </Reveal>
        </div>
      )}

      {sections.threePhoto && (
        <div className={styles.portraitRow}>
          <Reveal y={16} className={styles.portraitSide}>
            <PortraitFrame src={primaryPortrait} label={`Ảnh ${primary.personName}`} />
          </Reveal>
          <Reveal y={16} delay={0.1} className={styles.portraitCenter}>
            <PortraitFrame
              src={couplePortrait}
              label={`Ảnh cưới ${primary.personName} và ${secondary.personName}`}
            />
          </Reveal>
          <Reveal y={16} delay={0.2} className={styles.portraitSide}>
            <PortraitFrame src={secondaryPortrait} label={`Ảnh ${secondary.personName}`} />
          </Reveal>
        </div>
      )}

      {sections.mainText && (
        <Reveal y={0} className={styles.inviteBlock}>
          <span className={`${styles.inviteCorner} ${styles.inviteCornerTopLeft}`} aria-hidden="true" />
          <span className={`${styles.inviteCorner} ${styles.inviteCornerBottomRight}`} aria-hidden="true" />
          <p className={styles.inviteSalutation}>{salutation}</p>
          <p className={styles.inviteGuest}>{guestLine}</p>
        </Reveal>
      )}

      {sections.ceremony && (
        <div className={styles.rite}>
          <Reveal y={0}>
            <h2 className={styles.riteTitle}>{ceremonyTitle}</h2>
          </Reveal>

          <Reveal y={0} delay={0.08} className={styles.riteWeekday}>
            {ceremony.weekdayLabel}
          </Reveal>

          {/* time | DAY + month | year — the day is the strongest element. */}
          <div className={styles.riteDateRow}>
            <Reveal y={0} delay={0.14} className={`${styles.riteDateCell} ${styles.riteDateCellStart}`}>
              <span className={styles.riteSideValue}>{ceremony.timeLabel}</span>
            </Reveal>
            <Reveal y={0} delay={0.2} className={styles.riteDayCell}>
              <span className={styles.riteDay}>{ceremony.dayLabel}</span>
              <span className={styles.riteMonth}>Tháng {ceremony.monthLabel}</span>
            </Reveal>
            <Reveal y={0} delay={0.26} className={`${styles.riteDateCell} ${styles.riteDateCellEnd}`}>
              <span className={styles.riteSideValue}>{ceremony.yearLabel}</span>
            </Reveal>
          </div>

          <Reveal y={0} delay={0.4}>
            <p className={styles.riteLunar}>(Tức ngày {lunarDateLabel})</p>
          </Reveal>

          <Reveal y={0} delay={0.1} className={styles.riteHost}>
            <div className={styles.riteDivider} aria-hidden="true">
              <Image src={HERITAGE_ASSETS.divider} alt="" fill sizes="110px" style={{ objectFit: "contain" }} />
            </div>
            <p className={styles.venueName}>Tại tư gia {ceremonyHostLabel}</p>
            <p className={styles.venueAddress}>{ceremonyHostAddress}</p>
          </Reveal>
        </div>
      )}

      {children}
    </section>
  );
}

interface HeritageVenueItem {
  side: SideDetails;
  /** From the shared resolver ("Tiệc mừng Lễ Thành Hôn" / "… Vu Quy"). */
  receptionTitle: string;
  /** Derived from this side's canonical reception instant (CLAUDE.md §7). */
  reception: DerivedCeremonyDisplay;
  /** Ceremony-day lunar label, or null when the reception is on another day. */
  lunarDateLabel: string | null;
}

interface HeritageVenuesProps {
  /** The resolver's operational sides: both for COMMON, one otherwise. */
  venues: HeritageVenueItem[];
  showSideLabel: boolean;
  showReceptionTime: boolean;
  showVenue: boolean;
  showDirections: boolean;
}

/**
 * Reception blocks, one per operational side (Nhà Trai first for COMMON):
 * a rounded cream card with the reception title, time/weekday, date, lunar
 * date, venue name and address, then that side's "Xem chỉ đường" link.
 * Each part follows its own section toggle and drops out cleanly when off.
 */
function HeritageVenues({ venues, showSideLabel, showReceptionTime, showVenue, showDirections }: HeritageVenuesProps) {
  const showCard = showReceptionTime || showVenue;

  return (
    <div className={styles.venues}>
      {venues.map(({ side, receptionTitle, reception, lunarDateLabel }) => (
        <div key={side.sideLabel} className={styles.venueBlock}>
          {showSideLabel && (
            <Reveal y={0} className={styles.venueSide}>
              {side.sideLabel}
            </Reveal>
          )}
          {showCard && (
            <Reveal y={14} className={styles.receptionCard}>
              {showReceptionTime && (
                <>
                  <p className={styles.receptionTitle}>{receptionTitle}</p>
                  <p className={styles.receptionTime}>
                    {reception.timeLabel} - {reception.weekdayLabel}
                  </p>
                  <p className={styles.receptionDate}>{reception.fullDateLabel}</p>
                  {lunarDateLabel && <p className={styles.receptionLunar}>({formatLunarDateLine(lunarDateLabel)})</p>}
                </>
              )}
              {showReceptionTime && showVenue && <span className={styles.receptionRule} aria-hidden="true" />}
              {showVenue && (
                <>
                  <p className={styles.venueName}>{side.venueName}</p>
                  <p className={styles.venueAddress}>{side.venueAddress}</p>
                </>
              )}
            </Reveal>
          )}
          {showDirections && (
            <Reveal y={0} delay={0.1} className={styles.directionsWrap}>
              <a
                className={styles.directionsButton}
                href={side.mapsUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Xem chỉ đường đến ${side.venueName}`}
              >
                Xem chỉ đường
              </a>
            </Reveal>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * "08/09 Âm Lịch" → "Tức ngày 08 tháng 09 Âm lịch". Wording only, from the
 * existing prototype label; any other label shape falls back unchanged.
 */
function formatLunarDateLine(label: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\b/.exec(label.trim());
  return match ? `Tức ngày ${match[1]} tháng ${match[2]} Âm lịch` : `Tức ngày ${label}`;
}

interface HeritageScheduleItem {
  key: string;
  /** Derived from the item's canonical instant (CLAUDE.md §7). */
  timeLabel: string;
  label: string;
}

/** Compact programme row: evenly spaced time/label columns, 1–5 items. */
function HeritageSchedule({ items }: { items: HeritageScheduleItem[] }) {
  return (
    <ol className={styles.schedule} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item, index) => (
        <li key={item.key} className={styles.scheduleItem}>
          <Reveal y={8} delay={index * 0.08}>
            <span className={styles.scheduleTime}>{item.timeLabel}</span>
            <span className={styles.scheduleLabel}>{item.label}</span>
          </Reveal>
        </li>
      ))}
    </ol>
  );
}

// Editorial rhythm, cycled by milestone: large portrait, smaller near-square,
// taller portrait, medium landscape-ish, large portrait. Width is a share of
// the photo's column; narrower photos sit toward the outer edge, away from
// the central axis.
const LOVE_STORY_PHOTO_RHYTHM = [
  { width: "100%", ratio: "4 / 5" },
  { width: "86%", ratio: "1 / 1.02" },
  { width: "90%", ratio: "3 / 4.3" },
  { width: "94%", ratio: "5 / 4.4" },
  { width: "96%", ratio: "4 / 5" },
] as const;

// Prototype range: 1–5 milestones, rendered from data only.
const MAX_LOVE_STORY_MILESTONES = 5;

const LOVE_STORY_EASE = [0.22, 1, 0.36, 1] as const;

interface HeritageLoveStoryProps {
  reducedMotion: boolean;
  heading: string;
  milestones: LoveStoryMilestone[];
  backgroundUrl: string;
  onOpenImage: (image: LightboxImage) => void;
}

/**
 * Love story as one editorial timeline over a muted photo backdrop: a
 * central gold axis, with each milestone's photo and text alternating
 * sides (photo right first). Renders exactly the milestones in the data.
 */
function HeritageLoveStory({ reducedMotion, heading, milestones, backgroundUrl, onOpenImage }: HeritageLoveStoryProps) {
  const items = milestones.slice(0, MAX_LOVE_STORY_MILESTONES);
  const inView = (from: { x?: number; y?: number; scale?: number; scaleY?: number }, delay = 0, duration = 0.9) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, ...from },
          whileInView: { opacity: 1, x: 0, y: 0, scale: 1, scaleY: 1 },
          viewport: { once: true, margin: "-70px" },
          transition: { duration, delay, ease: LOVE_STORY_EASE },
        };

  return (
    <section className={styles.loveStory}>
      <div className={styles.loveStoryBackdrop} style={{ backgroundImage: `url(${backgroundUrl})` }} aria-hidden="true" />
      <div className={styles.loveStoryShade} aria-hidden="true" />
      <div className={styles.loveStoryGrain} style={{ backgroundImage: `url(${HERITAGE_ASSETS.paperIvory})` }} aria-hidden="true" />

      <motion.header className={styles.loveStoryHeader} {...inView({ y: 10 }, 0, 1)}>
        <span className={styles.loveStoryEyebrow}>Love Story</span>
        <h2 className={styles.loveStoryHeading}>{heading}</h2>
        <span className={styles.loveStoryRule} aria-hidden="true" />
      </motion.header>

      <ol className={styles.lsList}>
        {items.map((item, index) => {
          const photoRight = index % 2 === 0;
          const textFrom = photoRight ? -24 : 24;
          const photoFrom = photoRight ? 24 : -24;
          const rhythm = LOVE_STORY_PHOTO_RHYTHM[index % LOVE_STORY_PHOTO_RHYTHM.length];
          return (
            <li
              key={`${item.dateLabel}-${item.title}`}
              className={`${styles.lsItem} ${photoRight ? styles.lsItemPhotoRight : styles.lsItemPhotoLeft}`}
            >
              {index < items.length - 1 && (
                <motion.span className={styles.lsSegment} aria-hidden="true" {...inView({ scaleY: 0 }, 0.2, 1.2)} />
              )}
              <motion.span className={styles.lsMarker} aria-hidden="true" {...inView({ scale: 0.4 }, 0, 0.6)} />

              <motion.div className={styles.lsText} {...inView({ x: textFrom }, 0.15)}>
                <p className={styles.lsDate}>{item.dateLabel}</p>
                <p className={styles.lsTitle}>{item.title}</p>
                {item.description && <p className={styles.lsDescription}>{item.description}</p>}
              </motion.div>

              {item.imageUrl && (
                <motion.button
                  type="button"
                  className={styles.lsPhotoButton}
                  onClick={() => onOpenImage({ src: item.imageUrl ?? "", alt: item.title })}
                  aria-label={`Xem ảnh lớn: ${item.title}`}
                  style={{ width: rhythm.width }}
                  {...inView({ x: photoFrom }, 0)}
                >
                  <span
                    className={styles.lsPhoto}
                    style={{
                      backgroundImage: `url(${item.imageUrl})`,
                      aspectRatio: rhythm.ratio,
                    }}
                  />
                </motion.button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Full-size story photo; closes via the X, a tap outside, or Escape. */
function HeritageLightbox({ image, onClose }: { image: LightboxImage; onClose: () => void }) {
  return (
    <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={image.alt}>
      <button type="button" className={styles.modalScrim} aria-label="Đóng" onClick={onClose} />
      <div className={styles.lightboxImage}>
        <Image src={image.src} alt={image.alt} fill sizes="92vw" unoptimized style={{ objectFit: "contain" }} />
      </div>
      <button type="button" className={styles.lightboxClose} onClick={onClose} aria-label="Đóng" autoFocus>
        ✕
      </button>
    </div>
  );
}

const RSVP_EASE = [0.22, 1, 0.36, 1] as const;

interface HeritageRsvpProps {
  /** Personalized guest name, or "" when personalization is off. */
  prefillGuestName: string;
  reducedMotion: boolean;
}

/**
 * RSVP + wishes on the ivory paper: a two-line title over a deep red form
 * panel — name, one attendance select (default "Sẽ tham dự"), wish, send.
 * Uses the shared RSVP form behavior (CLAUDE.md §11); prototype state only,
 * nothing is persisted.
 */
function HeritageRsvp({ prefillGuestName, reducedMotion }: HeritageRsvpProps) {
  const rsvpForm = useRsvpForm(prefillGuestName, "attending");
  const submission = rsvpForm.submission;
  const submittedChoice = submission ? RSVP_OPTIONS.find((option) => option.id === submission.choice) : undefined;
  const swap = reducedMotion
    ? {}
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.35, ease: RSVP_EASE },
      };

  return (
    <section className={styles.rsvpSection} style={{ backgroundImage: `url(${HERITAGE_ASSETS.paperIvory})` }}>
      <PageSideBorders />

      <Reveal y={12} className={styles.rsvpHeader}>
        <div className={styles.rsvpDivider} aria-hidden="true">
          <Image src={HERITAGE_ASSETS.divider} alt="" fill sizes="110px" style={{ objectFit: "contain" }} />
        </div>
        <h2 className={styles.rsvpTitle}>
          <span>Xác Nhận Tham Dự</span>
          <span>&amp; Gửi Lời Chúc</span>
        </h2>
      </Reveal>

      <Reveal y={18} delay={0.1} className={styles.rsvpPanel}>
        <AnimatePresence mode="wait" initial={false}>
          {submission ? (
            <motion.div key="done" className={styles.rsvpDone} role="status" {...swap}>
              <p className={styles.rsvpDoneThanks}>Cảm ơn {submission.guestName}!</p>
              {submittedChoice && <p className={styles.rsvpDoneChoice}>{submittedChoice.label}</p>}
              {submission.message && <p className={styles.rsvpDoneMessage}>&ldquo;{submission.message}&rdquo;</p>}
              <button type="button" className={styles.rsvpEdit} onClick={rsvpForm.editAgain}>
                Sửa lại
              </button>
            </motion.div>
          ) : (
            <motion.form key="form" className={styles.rsvpFields} onSubmit={rsvpForm.submit} {...swap}>
              <input
                type="text"
                className={styles.rsvpInput}
                value={rsvpForm.guestName}
                onChange={(e) => rsvpForm.setGuestName(e.target.value)}
                placeholder="Tên của bạn"
                aria-label="Tên của bạn"
                autoComplete="name"
                required
              />
              <div className={styles.rsvpSelectWrap}>
                <select
                  className={`${styles.rsvpInput} ${styles.rsvpSelect}`}
                  value={rsvpForm.choice ?? "attending"}
                  onChange={(e) => {
                    const next = RSVP_OPTIONS.find((option) => option.id === e.target.value);
                    if (next) rsvpForm.setChoice(next.id);
                  }}
                  aria-label="Bạn sẽ tham dự chứ?"
                >
                  {RSVP_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                className={`${styles.rsvpInput} ${styles.rsvpTextarea}`}
                value={rsvpForm.message}
                onChange={(e) => rsvpForm.setMessage(e.target.value)}
                placeholder="Gửi lời chúc đến cô dâu & chú rể..."
                aria-label="Lời chúc"
                rows={4}
              />
              <button type="submit" className={styles.rsvpSubmit} disabled={!rsvpForm.canSubmit}>
                Gửi ngay
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </Reveal>
    </section>
  );
}

// Prototype range for the palette: 1–6 colours, rendered from data only.
const MAX_DRESS_CODE_SWATCHES = 6;

/**
 * A small printed note between Gift and the album: title, the editable
 * description, then one round swatch per configured colour (wrapping, not
 * shrinking, when there are many).
 */
function HeritageDressCode({
  description,
  swatches,
  reducedMotion,
}: {
  description: string;
  swatches: DressCodeSwatch[];
  reducedMotion: boolean;
}) {
  return (
    <section className={styles.dressSection} style={{ backgroundImage: `url(${HERITAGE_ASSETS.paperIvory})` }}>
      <Reveal y={10} className={styles.dressHeader}>
        <span className={styles.dressRule} aria-hidden="true">
          <span className={styles.dressRuleDiamond} />
        </span>
        <h2 className={styles.dressTitle}>Dress Code</h2>
        <p className={styles.dressText}>{description}</p>
      </Reveal>
      <ul className={styles.dressSwatches}>
        {swatches.slice(0, MAX_DRESS_CODE_SWATCHES).map((swatch, index) => (
          <motion.li
            key={`${swatch.color}-${swatch.label}`}
            className={styles.dressSwatch}
            style={{ backgroundColor: swatch.color }}
            title={swatch.label}
            aria-label={swatch.label}
            {...(reducedMotion
              ? {}
              : {
                  initial: { opacity: 0, scale: 0.85 },
                  whileInView: { opacity: 1, scale: 1 },
                  viewport: { once: true, margin: "-40px" },
                  transition: { duration: 0.5, delay: 0.15 + index * 0.07, ease: [0.22, 1, 0.36, 1] },
                })}
          />
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Wedding album
// ---------------------------------------------------------------------------

const ALBUM_EASE = [0.22, 1, 0.36, 1] as const;

type HeritageSlotRole = "large" | "medium" | "tall" | "tallSecond" | "wide";
type HeritageRowKind = "large" | "pair" | "tall" | "wide";

// Each slot role's orientations, best fit first. Both prints of the tall
// pair favour portrait, then near-square; wide rows favour landscape; the
// rest favour portrait.
const HERITAGE_SLOT_PREFERENCES: Record<HeritageSlotRole, readonly MediaOrientation[]> = {
  large: ["portrait", "square", "landscape"],
  medium: ["portrait", "square", "landscape"],
  tall: ["portrait", "square", "landscape"],
  tallSecond: ["portrait", "square", "landscape"],
  wide: ["landscape", "square", "portrait"],
};

// The album's fixed row rhythm, repeated as needed: large → pair → tall
// pair → wide → pair → wide.
const HERITAGE_ROW_PATTERN: readonly HeritageRowKind[] = ["large", "pair", "tall", "wide", "pair", "wide"];

const HERITAGE_ROW_SLOTS: Record<HeritageRowKind, readonly HeritageSlotRole[]> = {
  large: ["large"],
  pair: ["medium", "medium"],
  tall: ["tall", "tallSecond"],
  wide: ["wide"],
};

interface HeritageAlbumRow {
  kind: HeritageRowKind;
  /** Positions in the arranged (visual) photo order. */
  slots: number[];
}

interface HeritageAlbumArrangement {
  rows: HeritageAlbumRow[];
  /** Photos in visual order — the album viewer steps through this order. */
  photos: AlbumPhoto[];
}

/**
 * Lays the template's fixed row rhythm over however many photos there are
 * (a row that would need more photos than remain becomes a pair or a wide
 * row, so no slot is ever empty), then assigns photos to slots by
 * orientation via the shared assignment helper. The slots never change
 * shape per photo; photos are cropped into them.
 */
function arrangeHeritageAlbum(photos: AlbumPhoto[]): HeritageAlbumArrangement {
  const rows: HeritageAlbumRow[] = [];
  const roles: HeritageSlotRole[] = [];
  let patternIndex = 0;
  while (roles.length < photos.length) {
    const remaining = photos.length - roles.length;
    let kind = HERITAGE_ROW_PATTERN[patternIndex % HERITAGE_ROW_PATTERN.length];
    if (HERITAGE_ROW_SLOTS[kind].length > remaining) kind = remaining >= 2 ? "pair" : "wide";
    const rowRoles = HERITAGE_ROW_SLOTS[kind];
    rows.push({ kind, slots: rowRoles.map((_, i) => roles.length + i) });
    roles.push(...rowRoles);
    patternIndex += 1;
  }

  const assignment = assignPhotosToSlots(
    photos,
    roles.map((role) => ({ preferred: HERITAGE_SLOT_PREFERENCES[role] }))
  );
  return { rows, photos: assignment.map((photoIndex) => photos[photoIndex]) };
}

interface HeritageAlbumProps {
  heading: string;
  /** Rows plus photos already placed into slots (visual order). */
  arrangement: HeritageAlbumArrangement;
  reducedMotion: boolean;
  onOpen: (index: number, opener: HTMLElement) => void;
}

/**
 * Photo-rich album on the ivory paper: header, then curated rows of framed
 * prints. Each print rises in with a small stagger while its photo settles
 * from a slight zoom (a gentle depth cue); tapping opens the album viewer.
 */
function HeritageAlbum({ heading, arrangement, reducedMotion, onOpen }: HeritageAlbumProps) {
  const { rows, photos } = arrangement;

  const renderPhoto = (index: number, className: string, order: number) => {
    const photo = photos[index];
    return (
      <motion.button
        key={index}
        type="button"
        className={`${styles.albumPrint} ${className}`}
        onClick={(event) => onOpen(index, event.currentTarget)}
        aria-label={`Xem ảnh lớn: ${photo.alt}`}
        {...(reducedMotion
          ? {}
          : {
              initial: { opacity: 0, y: 26 },
              whileInView: { opacity: 1, y: 0 },
              viewport: { once: true, margin: "-60px" },
              transition: { duration: 0.9, delay: order * 0.12, ease: ALBUM_EASE },
            })}
      >
        <span className={styles.albumClip}>
          <motion.span
            className={styles.albumPhoto}
            {...(reducedMotion
              ? {}
              : {
                  initial: { scale: 1.08 },
                  whileInView: { scale: 1 },
                  viewport: { once: true, margin: "-60px" },
                  transition: { duration: 1.6, delay: order * 0.12, ease: ALBUM_EASE },
                })}
          >
            {/* Cropped into the fixed slot shape, never stretched; the */}
            {/* optional focal point keeps faces in view. */}
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              sizes="(max-width: 480px) 100vw, 460px"
              unoptimized
              style={{ objectFit: "cover", objectPosition: photoObjectPosition(photo) }}
            />
          </motion.span>
        </span>
      </motion.button>
    );
  };

  return (
    <section className={styles.albumSection} style={{ backgroundImage: `url(${HERITAGE_ASSETS.paperIvory})` }}>
      <Reveal y={12} className={styles.albumHeader}>
        <div className={styles.albumDivider} aria-hidden="true">
          <Image src={HERITAGE_ASSETS.divider} alt="" fill sizes="110px" style={{ objectFit: "contain" }} />
        </div>
        <span className={styles.albumEyebrow}>Album ảnh cưới</span>
        <h2 className={styles.albumHeading}>{heading}</h2>
      </Reveal>

      <div className={styles.albumRows}>
        {rows.map((row) => {
          const [first, second] = row.slots;
          if (row.kind === "pair") {
            return (
              <div key={`pair-${first}`} className={`${styles.albumRow} ${styles.albumPair}`}>
                {renderPhoto(first, styles.albumMedium, 0)}
                {renderPhoto(second, styles.albumMedium, 1)}
              </div>
            );
          }
          if (row.kind === "tall") {
            return (
              <div key={`tall-${first}`} className={`${styles.albumRow} ${styles.albumTallRow}`}>
                {renderPhoto(first, styles.albumTall, 0)}
                {renderPhoto(second, styles.albumTallSecond, 1)}
              </div>
            );
          }
          return (
            <div key={`${row.kind}-${first}`} className={styles.albumRow}>
              {renderPhoto(first, row.kind === "wide" ? styles.albumWide : styles.albumLarge, 0)}
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface HeritageAlbumViewerProps {
  photos: AlbumPhoto[];
  index: number;
  reducedMotion: boolean;
  /** Moves by ±1, wrapping; applied to the latest index. */
  onStep: (step: number) => void;
  onClose: () => void;
}

/**
 * Full-screen album viewer: the tapped photo large on a dark backdrop, with
 * previous/next (buttons, swipe, arrow keys), a counter, and close (X,
 * backdrop, Escape). The invitation behind cannot scroll while it is open;
 * the parent returns focus to the tapped photo on close.
 */
function HeritageAlbumViewer({ photos, index, reducedMotion, onStep, onClose }: HeritageAlbumViewerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState(0);
  const count = photos.length;
  const photo = photos[index];

  const go = useCallback(
    (step: number) => {
      setDirection(step);
      onStep(step);
    },
    [onStep]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go, onClose]);

  // Freeze (not reset) the nearest scrolling container while open.
  useEffect(() => {
    let scroller: HTMLElement | null = overlayRef.current?.parentElement ?? null;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    const locked = scroller ?? document.documentElement;
    const previousOverflow = locked.style.overflowY;
    locked.style.overflowY = "hidden";
    return () => {
      locked.style.overflowY = previousOverflow;
    };
  }, []);

  const fade = reducedMotion
    ? {}
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.35 } };

  return (
    <motion.div
      ref={overlayRef}
      className={styles.albumViewer}
      role="dialog"
      aria-modal="true"
      aria-label={`Album ảnh: ${photo.alt}`}
      {...fade}
    >
      <button type="button" className={styles.albumViewerScrim} aria-label="Đóng" onClick={onClose} />

      <div className={styles.albumViewerStage}>
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={index}
            className={styles.albumViewerImage}
            custom={direction}
            initial={reducedMotion ? false : { opacity: 0, x: direction * 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: direction * -48 }}
            transition={{ duration: reducedMotion ? 0 : 0.45, ease: ALBUM_EASE }}
            drag={count > 1 ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) go(1);
              else if (info.offset.x > 60) go(-1);
            }}
          >
            <Image src={photo.src} alt={photo.alt} fill sizes="100vw" unoptimized draggable={false} style={{ objectFit: "contain" }} />
          </motion.div>
        </AnimatePresence>
      </div>

      <button type="button" className={styles.albumViewerClose} onClick={onClose} aria-label="Đóng" autoFocus>
        ✕
      </button>
      {count > 1 && (
        <>
          <button
            type="button"
            className={`${styles.albumViewerNav} ${styles.albumViewerPrev}`}
            onClick={() => go(-1)}
            aria-label="Ảnh trước"
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.albumViewerNav} ${styles.albumViewerNext}`}
            onClick={() => go(1)}
            aria-label="Ảnh tiếp theo"
          >
            ›
          </button>
        </>
      )}
      <p className={styles.albumViewerCount} aria-live="polite">
        {index + 1} / {count}
      </p>
    </motion.div>
  );
}

/**
 * Slim gold side borders for the inner page: a hairline down each edge,
 * with the supplied border artwork only as short, fading end caps.
 */
function PageSideBorders() {
  return (
    <div className={styles.pageBorders} aria-hidden="true">
      {(["left", "right"] as const).map((side) =>
        (["Top", "Bottom"] as const).map((end) => (
          <div
            key={`${side}-${end}`}
            className={`${styles.pageBorderCap} ${side === "left" ? styles.pageBorderLeft : styles.pageBorderRight} ${
              styles[`pageBorderCap${end}`]
            }`}
          >
            <Image
              src={side === "left" ? HERITAGE_ASSETS.borderLeft : HERITAGE_ASSETS.borderRight}
              alt=""
              fill
              sizes="60px"
              style={{ objectFit: "contain" }}
            />
          </div>
        ))
      )}
    </div>
  );
}

function PortraitFrame({ src, label }: { src: string; label: string }) {
  return (
    <div className={styles.portraitFrame}>
      <div className={styles.portraitPhoto} style={{ backgroundImage: `url(${src})` }} role="img" aria-label={label} />
    </div>
  );
}

function FamilySide({ side }: { side: SideDetails }) {
  return (
    <div className={styles.familySide}>
      <div className={styles.familyHeading}>{side.sideLabel}</div>
      <span className={styles.familyHeadingRule} aria-hidden="true" />
      <div className={styles.familyParent}>{side.fatherName}</div>
      <div className={styles.familyParent}>{side.motherName}</div>
      <div className={styles.familyAddress}>{side.familyAddress}</div>
    </div>
  );
}

const GIFT_EASE = [0.22, 1, 0.36, 1] as const;

interface HeritageGiftModalProps {
  /** The resolver's operational sides: both for COMMON (Nhà Trai first), one otherwise. */
  sides: SideDetails[];
  reducedMotion: boolean;
  onClose: () => void;
}

/**
 * Wedding gift details, shown only on request: QR area, bank, holder and a
 * copyable account number per side. COMMON gets Nhà Trai / Nhà Gái tabs
 * (Nhà Trai first); GROOM/BRIDE show their one side without tabs. While
 * open, the invitation behind cannot scroll, so it stays where it was.
 */
function HeritageGiftModal({ sides, reducedMotion, onClose }: HeritageGiftModalProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const { copiedKey, copy } = useClipboard();
  const overlayRef = useRef<HTMLDivElement>(null);
  const side = sides[activeIndex] ?? sides[0];
  const hasTabs = sides.length > 1;

  // Escape closes; the nearest scrolling container is frozen (not reset)
  // while open, then restored with its scroll position untouched.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    let scroller: HTMLElement | null = overlayRef.current?.parentElement ?? null;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    const locked = scroller ?? document.documentElement;
    const previousOverflow = locked.style.overflowY;
    locked.style.overflowY = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      locked.style.overflowY = previousOverflow;
    };
  }, [onClose]);

  const fade = (from: { scale?: number; y?: number }, duration: number) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, ...from },
          animate: { opacity: 1, scale: 1, y: 0 },
          exit: { opacity: 0, ...from },
          transition: { duration, ease: GIFT_EASE },
        };

  return (
    <div ref={overlayRef} className={styles.giftOverlay} role="dialog" aria-modal="true" aria-labelledby="heritage-gift-title">
      <motion.button type="button" className={styles.giftScrim} aria-label="Đóng" onClick={onClose} {...fade({}, 0.3)} />
      <motion.div className={styles.giftPanel} {...fade({ scale: 0.97, y: 12 }, 0.4)}>
        <button type="button" className={styles.giftClose} onClick={onClose} aria-label="Đóng" autoFocus>
          ✕
        </button>

        <div className={styles.giftLotus} aria-hidden="true">
          <LotusMark />
        </div>
        <h2 id="heritage-gift-title" className={styles.giftTitle}>
          Gửi Quà Cưới
        </h2>

        {hasTabs ? (
          <div className={styles.giftTabs} role="tablist" aria-label="Chọn nhà">
            {sides.map((s, index) => (
              <button
                key={s.sideLabel}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                className={`${styles.giftTab} ${index === activeIndex ? styles.giftTabActive : ""}`}
                onClick={() => setActiveIndex(index)}
              >
                {s.sideLabel}
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.giftSideLabel}>{side.sideLabel}</p>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={side.sideLabel} className={styles.giftDetails} {...fade({}, 0.25)}>
            <div className={styles.giftQr}>
              {side.gift.qrImageUrl ? (
                <div className={styles.giftQrImage}>
                  <Image
                    src={side.gift.qrImageUrl}
                    alt={`Mã QR chuyển khoản ${side.sideLabel}`}
                    fill
                    sizes="200px"
                    unoptimized
                    style={{ objectFit: "contain" }}
                  />
                </div>
              ) : (
                // Placeholder for the configured QR image — never a QR
                // generated from prototype data.
                <div className={styles.giftQrPlaceholder} aria-label="Vị trí mã QR" role="img">
                  <span className={`${styles.giftQrFinder} ${styles.giftQrFinderTopLeft}`} />
                  <span className={`${styles.giftQrFinder} ${styles.giftQrFinderTopRight}`} />
                  <span className={`${styles.giftQrFinder} ${styles.giftQrFinderBottomLeft}`} />
                  <span className={styles.giftQrNote}>Mã QR</span>
                </div>
              )}
            </div>

            <dl className={styles.giftInfo}>
              <div className={styles.giftInfoRow}>
                <dt>Ngân hàng</dt>
                <dd>{side.gift.bankName}</dd>
              </div>
              <div className={styles.giftInfoRow}>
                <dt>Chủ tài khoản</dt>
                <dd>{side.gift.accountHolder}</dd>
              </div>
              <div className={styles.giftInfoRow}>
                <dt>Số tài khoản</dt>
                <dd className={styles.giftAccount}>
                  <span className={styles.giftAccountNumber}>{side.gift.accountNumber}</span>
                  <button
                    type="button"
                    className={`${styles.giftCopy} ${copiedKey === side.sideLabel ? styles.giftCopyDone : ""}`}
                    onClick={() => copy(side.sideLabel, side.gift.accountNumber)}
                    aria-live="polite"
                  >
                    {copiedKey === side.sideLabel ? "Đã sao chép" : "Sao chép"}
                  </button>
                </dd>
              </div>
            </dl>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
