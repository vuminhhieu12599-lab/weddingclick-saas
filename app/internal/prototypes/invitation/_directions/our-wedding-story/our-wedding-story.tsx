"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import Image from "next/image";
import { Allura, Cormorant_Garamond, Inter } from "next/font/google";
import { AnimatePresence, motion } from "framer-motion";

import { deriveCalendarMonth, deriveCeremonyDisplay } from "../../_shared/derive-ceremony";
import { useCountdown } from "../../_shared/use-countdown";
import { useReducedMotion } from "../../_shared/use-reduced-motion";
import { assignPhotosToSlots, photoObjectPosition } from "../../_shared/album-assignment";
import type { AlbumSlotPreference } from "../../_shared/album-assignment";
import { resolveInvitation, resolveReceptionTitle } from "../../_shared/resolve-variant";
import type { ResolvedInvitation } from "../../_shared/resolve-variant";
import { resolveGuestLine } from "../../_shared/invitation-text";
import { RSVP_OPTIONS } from "../../_shared/rsvp-options";
import type { RsvpOption } from "../../_shared/rsvp-options";
import { Reveal } from "../../_shared/reveal";
import type { AlbumPhoto, InvitationVariant, PrototypeWeddingData, SideDetails } from "../../_shared/types";
import type { SectionVisibility } from "../../_shared/sections";
import { resolveOwsMedia } from "./demo-media";
import type { OwsMedia, OwsMediaScenario } from "./demo-media";
import styles from "./our-wedding-story.module.css";

// Our Wedding Story typography (approved spec v1). All three faces are SIL
// Open Font License (web + commercial use) with a Vietnamese subset;
// next/font self-hosts them and only this direction loads them.
const owsSerif = Cormorant_Garamond({
  subsets: ["vietnamese"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--ows-serif",
});

const owsSans = Inter({
  subsets: ["vietnamese"],
  weight: ["300", "400", "500"],
  display: "swap",
  variable: "--ows-sans",
});

// The one restrained script accent.
const owsScript = Allura({
  subsets: ["vietnamese"],
  weight: "400",
  display: "swap",
  variable: "--ows-script",
});

// Calendar weekday header, Sunday-first to match the derived grid.
const CALENDAR_WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// Gallery feature row: one large slot (portrait preferred) + two small.
const FEATURE_SLOTS: AlbumSlotPreference[] = [
  { preferred: ["portrait", "square", "landscape"] },
  { preferred: ["square", "landscape", "portrait"] },
  { preferred: ["square", "landscape", "portrait"] },
];

const RSVP_NAME_MAX = 200;
const RSVP_MESSAGE_MAX = 500;
const PARTY_SIZE_MIN = 1;
const PARTY_SIZE_MAX = 20;

const EASE_EDITORIAL = [0.22, 1, 0.36, 1] as const;

type BodySectionKey = "families" | "couple" | "invitation" | "date" | "gallery" | "rsvp" | "thanks";

interface Props {
  data: PrototypeWeddingData;
  variant: InvitationVariant;
  personalization: boolean;
  guestDisplayName: string;
  sections: SectionVisibility;
  mediaScenario: OwsMediaScenario;
}

/**
 * Template 04 — "Our Wedding Story" (Warm Champagne Wedding Editorial).
 * Internal visual prototype only: static fictional data, local state only,
 * no network writes. Variant rules come from the shared resolver and every
 * date/time/weekday/calendar/countdown value derives from the one canonical
 * ceremony instant (CLAUDE.md §5, §7).
 */
export function OurWeddingStoryPrototype({
  data,
  variant,
  personalization,
  guestDisplayName,
  sections,
  mediaScenario,
}: Props) {
  const reducedMotion = useReducedMotion();
  const resolved = resolveInvitation(data, variant);
  const media = resolveOwsMedia(mediaScenario, data.album);
  const ceremony = deriveCeremonyDisplay(data.ceremonyDateTimeIso, data.timeZone);
  const trimmedGuest = guestDisplayName.trim();
  const personalizedGuest = personalization && trimmedGuest.length > 0 ? trimmedGuest : null;

  const [opened, setOpened] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const music = useAudioControl(media.audioUrl);

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const viewerOpenerRef = useRef<HTMLElement | null>(null);
  const openViewer = useCallback((index: number, opener: HTMLElement) => {
    viewerOpenerRef.current = opener;
    setViewerIndex(index);
  }, []);
  const closeViewer = useCallback(() => {
    setViewerIndex(null);
    viewerOpenerRef.current?.focus({ preventScroll: true });
  }, []);

  const [giftOpen, setGiftOpen] = useState(false);
  const giftButtonRef = useRef<HTMLButtonElement>(null);
  const closeGift = useCallback(() => {
    setGiftOpen(false);
    giftButtonRef.current?.focus({ preventScroll: true });
  }, []);

  // After "Mở thiệp", bring the first inner page into view.
  useEffect(() => {
    if (!opened) return;
    const frame = requestAnimationFrame(() => {
      bodyRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [opened, reducedMotion]);

  const handleOpen = () => {
    setOpened(true);
    // The tap is a user gesture, so the browser may allow playback here.
    music.play(false);
  };

  // Editorial page numbers follow the sections actually shown.
  const visibleBody: BodySectionKey[] = [];
  if (sections.family) visibleBody.push("families");
  if (sections.portraitStory || sections.loveStory) visibleBody.push("couple");
  if (sections.mainText || sections.ceremony || sections.receptionTime || sections.venue || sections.directions) {
    visibleBody.push("invitation");
  }
  if (sections.ceremony || sections.countdown) visibleBody.push("date");
  if (sections.gallery && media.album.length > 0) visibleBody.push("gallery");
  if (sections.rsvp || sections.gift) visibleBody.push("rsvp");
  if (sections.closing) visibleBody.push("thanks");
  const pageNumber = (key: BodySectionKey) => String(visibleBody.indexOf(key) + 2).padStart(2, "0");

  const rootClass = `${styles.root} ${owsSerif.variable} ${owsSans.variable} ${owsScript.variable}`;

  return (
    <div className={rootClass}>
      {music.element}

      <CoverSection
        resolved={resolved}
        media={media}
        ceremonyDate={ceremony}
        personalizedGuest={personalizedGuest}
        opened={opened}
        onOpen={handleOpen}
        reducedMotion={reducedMotion}
      />

      {opened && (
        <>
          {music.available && (
            <div className={styles.musicDock}>
              <button
                type="button"
                className={styles.musicFab}
                onClick={music.toggle}
                aria-label={music.playing ? "Tạm dừng nhạc" : "Phát nhạc"}
                aria-pressed={music.playing}
              >
                <MusicGlyph playing={music.playing} />
              </button>
              {/* Only after an explicit tap fails — a blocked start on "Mở thiệp" just stays paused. */}
              {music.failed && (
                <p className={styles.musicError} role="status">
                  Không phát được nhạc
                </p>
              )}
            </div>
          )}

          <div ref={bodyRef} className={styles.body}>
            {visibleBody.includes("families") && (
              <FamiliesSection
                number={pageNumber("families")}
                resolved={resolved}
              />
            )}

            {visibleBody.includes("couple") && (
              <CoupleSection
                number={pageNumber("couple")}
                data={data}
                variant={variant}
                media={media}
                showPortraits={sections.portraitStory}
                showStory={sections.loveStory}
              />
            )}

            {visibleBody.includes("invitation") && (
              <InvitationSection
                number={pageNumber("invitation")}
                data={data}
                resolved={resolved}
                sections={sections}
                guestLine={resolveGuestLine(
                  personalization,
                  guestDisplayName,
                  data.invitationWording.defaultGuestLabel
                )}
                ceremonyDate={ceremony}
              />
            )}

            {visibleBody.includes("date") && (
              <DateSection
                number={pageNumber("date")}
                data={data}
                ceremonyDate={ceremony}
                showCalendar={sections.ceremony}
                showCountdown={sections.countdown}
              />
            )}

            {visibleBody.includes("gallery") && (
              <GallerySection
                number={pageNumber("gallery")}
                heading={data.albumHeading}
                photos={media.album}
                onOpen={openViewer}
              />
            )}

            {visibleBody.includes("rsvp") && (
              <RsvpGiftSection
                number={pageNumber("rsvp")}
                showRsvp={sections.rsvp}
                showGift={sections.gift}
                giftNote={data.giftIntroNoteExtended ?? data.giftIntroNote}
                onOpenGift={() => setGiftOpen(true)}
                giftButtonRef={giftButtonRef}
              />
            )}

            {visibleBody.includes("thanks") && (
              <ThankYouSection
                number={pageNumber("thanks")}
                data={data}
                resolved={resolved}
                photoUrl={media.closingPhotoUrl}
                ceremonyDate={ceremony}
              />
            )}

            <footer className={styles.footer}>
              <span className={styles.footerRule} aria-hidden="true" />
              <span className={styles.footerDate}>Our Wedding Story</span>
            </footer>
          </div>
        </>
      )}

      <AnimatePresence>
        {viewerIndex !== null && media.album[viewerIndex] && (
          <PhotoViewer
            key="viewer"
            photos={media.album}
            index={viewerIndex}
            onIndexChange={setViewerIndex}
            onClose={closeViewer}
            reducedMotion={reducedMotion}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {giftOpen && (
          <GiftSheet
            key="gift"
            sides={resolved.operationalSides}
            note={data.giftIntroNote}
            onClose={closeGift}
            reducedMotion={reducedMotion}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function SectionHead({ number, kicker, title }: { number: string; kicker: string; title?: string }) {
  return (
    <Reveal y={12} className={styles.sectionHead}>
      <div className={styles.kicker}>
        <span className={styles.kickerNumber}>{number}</span>
        <span className={styles.kickerRule} aria-hidden="true" />
        <span>{kicker}</span>
      </div>
      {title && <h2 className={styles.sectionTitle}>{title}</h2>}
    </Reveal>
  );
}

function Photo({
  src,
  alt,
  sizes,
  priority = false,
  objectPosition,
  className,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  objectPosition?: string;
  className?: string;
}) {
  return (
    <div className={`${styles.photo} ${className ?? ""}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        style={{ objectFit: "cover", objectPosition: objectPosition ?? "50% 50%" }}
      />
    </div>
  );
}

/**
 * Real audio playback (not a fake toggle): the playing state comes from the
 * element's own play/pause events, and a rejected `play()` (autoplay policy,
 * missing file) leaves it paused. Renders nothing when no audio exists.
 */
function useAudioControl(src: string | undefined) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  // `reportFailure` is false for the opportunistic start on "Mở thiệp":
  // a blocked autoplay just stays paused; an explicit tap reports failure.
  const play = useCallback((reportFailure = true) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().then(
      () => setFailed(false),
      () => {
        setPlaying(false);
        if (reportFailure) setFailed(true);
      }
    );
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) play(true);
    else audio.pause();
  }, [play]);

  const element = src ? (
    <audio
      ref={audioRef}
      src={src}
      loop
      preload="none"
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onError={() => {
        setPlaying(false);
        setFailed(true);
      }}
    />
  ) : null;

  return { available: Boolean(src), playing, failed, play, toggle, element };
}

function MusicGlyph({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="3.5" y="3" width="2.6" height="10" rx="0.6" fill="currentColor" />
      <rect x="9.9" y="3" width="2.6" height="10" rx="0.6" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M4.5 2.8v10.4L13 8z" fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 01 Cover                                                            */
/* ------------------------------------------------------------------ */

function CoverSection({
  resolved,
  media,
  ceremonyDate,
  personalizedGuest,
  opened,
  onOpen,
  reducedMotion,
}: {
  resolved: ResolvedInvitation;
  media: OwsMedia;
  ceremonyDate: ReturnType<typeof deriveCeremonyDisplay>;
  personalizedGuest: string | null;
  opened: boolean;
  onOpen: () => void;
  reducedMotion: boolean;
}) {
  const enter = (delay: number, y = 10) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.9, delay, ease: EASE_EDITORIAL },
        };

  return (
    <section className={`${styles.cover} ${media.coverUrl ? "" : styles.coverTextOnly}`} aria-label="Bìa thiệp">
      <motion.header className={styles.masthead} {...enter(0.05, -8)}>
        <div className={styles.mastheadMeta}>
          <span>A Love Story</span>
          <span>{ceremonyDate.fullDateLabel}</span>
        </div>
        <div className={styles.mastheadTitle}>
          <span className={styles.mastheadWord}>Our Wedding</span>
          <span className={styles.mastheadScript}>Story</span>
        </div>
        <div className={styles.mastheadRule} aria-hidden="true" />
      </motion.header>

      {media.coverUrl && (
        <motion.div
          className={styles.coverFigure}
          {...(reducedMotion
            ? {}
            : {
                initial: { opacity: 0, clipPath: "inset(8% 6% 8% 6%)" },
                animate: { opacity: 1, clipPath: "inset(0% 0% 0% 0%)" },
                transition: { duration: 1.3, delay: 0.2, ease: EASE_EDITORIAL },
              })}
        >
          <Photo
            src={media.coverUrl}
            alt={`Ảnh cưới ${resolved.primary.personName} và ${resolved.secondary.personName}`}
            sizes="(max-width: 480px) 92vw, 440px"
            priority
            className={styles.coverPhoto}
          />
          <span className={styles.coverFrame} aria-hidden="true" />
          <span className={styles.coverLine}>Cover story</span>
        </motion.div>
      )}

      <div className={styles.coverText}>
        <motion.h1 className={styles.coverNames} {...enter(0.45)}>
          <span className={styles.coverName}>{resolved.primary.personName}</span>
          <span className={styles.coverAmp}>&amp;</span>
          <span className={styles.coverName}>{resolved.secondary.personName}</span>
        </motion.h1>

        <motion.div className={styles.coverDate} {...enter(0.6)}>
          <span>{ceremonyDate.weekdayLabel}</span>
          <span className={styles.coverDateDot} aria-hidden="true" />
          <span>{ceremonyDate.fullDateLabel}</span>
        </motion.div>

        {personalizedGuest && (
          <motion.p className={styles.coverGuest} {...enter(0.7)}>
            <span className={styles.coverGuestLabel}>Thân gửi</span>
            <span className={styles.coverGuestName}>{personalizedGuest}</span>
          </motion.p>
        )}

        <motion.div className={styles.coverAction} {...enter(0.8)}>
          {opened ? (
            <span className={styles.coverScrollHint}>Cuộn xuống để đọc tiếp</span>
          ) : (
            <button type="button" className={styles.openButton} onClick={onOpen}>
              Mở thiệp
            </button>
          )}
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 02 Our Families                                                     */
/* ------------------------------------------------------------------ */

function FamiliesSection({ number, resolved }: { number: string; resolved: ResolvedInvitation }) {
  // Primary family first (GROOM: nhà trai; BRIDE: nhà gái; COMMON: both,
  // groom's side first per the shared resolver).
  const families = [resolved.primary, resolved.secondary];
  return (
    <section className={`${styles.section} ${styles.families}`}>
      <SectionHead number={number} kicker="Our Families" title="Hai Gia Đình" />

      <div className={styles.familyGrid}>
        {families.map((side, index) => (
          <Reveal key={side.sideLabel} y={14} delay={0.08 + index * 0.12} className={styles.familyCol}>
            <div className={styles.familySide}>{side.sideLabel}</div>
            <div className={styles.familyParent}>{side.fatherName}</div>
            <div className={styles.familyParent}>{side.motherName}</div>
            <div className={styles.familyAddress}>{side.familyAddress}</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 03 The Couple                                                       */
/* ------------------------------------------------------------------ */

interface CouplePerson {
  role: "GROOM" | "BRIDE";
  name: string;
  englishLabel: string;
  vietnameseLabel: string;
  portraitUrl?: string;
}

function CoupleSection({
  number,
  data,
  variant,
  media,
  showPortraits,
  showStory,
}: {
  number: string;
  data: PrototypeWeddingData;
  variant: InvitationVariant;
  media: OwsMedia;
  showPortraits: boolean;
  showStory: boolean;
}) {
  const groom: CouplePerson = {
    role: "GROOM",
    name: data.groom.personName,
    englishLabel: "The Groom",
    vietnameseLabel: "Chú rể",
    portraitUrl: media.groomPortraitUrl,
  };
  const bride: CouplePerson = {
    role: "BRIDE",
    name: data.bride.personName,
    englishLabel: "The Bride",
    vietnameseLabel: "Cô dâu",
    portraitUrl: media.bridePortraitUrl,
  };
  // Explicit role order from the variant — BRIDE leads only on the bride's invitation.
  const people = variant === "BRIDE" ? [bride, groom] : [groom, bride];
  const withPhoto = people.filter((p) => p.portraitUrl);
  const story = data.loveStoryShort ?? data.loveStory;

  return (
    <section className={`${styles.section} ${styles.couple}`}>
      <SectionHead number={number} kicker="The Couple" title={showStory ? data.loveStoryHeading : undefined} />

      {showPortraits &&
        (withPhoto.length === 2 ? (
          <div className={styles.portraitStagger}>
            {people.map((person, index) => (
              <Reveal
                key={person.role}
                y={20}
                delay={index * 0.15}
                className={index === 0 ? styles.portraitLead : styles.portraitFollow}
              >
                <figure className={styles.portraitFigure}>
                  <Photo
                    src={person.portraitUrl as string}
                    alt={`${person.vietnameseLabel} ${person.name}`}
                    sizes="(max-width: 480px) 58vw, 260px"
                    className={styles.portraitPhoto}
                  />
                  <figcaption className={styles.portraitCaption}>
                    <span className={styles.portraitRole}>{person.englishLabel}</span>
                    <span className={styles.portraitName}>{person.name}</span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        ) : (
          // One or no portrait: never an empty frame — any missing portrait
          // becomes a typographic name block beside the photo that exists.
          <div className={withPhoto.length === 1 ? styles.portraitSingle : styles.portraitNamesOnly}>
            {people.map((person, index) =>
              person.portraitUrl ? (
                <Reveal key={person.role} y={18} delay={index * 0.12} className={styles.portraitSingleFigure}>
                  <figure className={styles.portraitFigure}>
                    <Photo
                      src={person.portraitUrl}
                      alt={`${person.vietnameseLabel} ${person.name}`}
                      sizes="(max-width: 480px) 52vw, 240px"
                      className={styles.portraitPhoto}
                    />
                    <figcaption className={styles.portraitCaption}>
                      <span className={styles.portraitRole}>{person.englishLabel}</span>
                      <span className={styles.portraitName}>{person.name}</span>
                    </figcaption>
                  </figure>
                </Reveal>
              ) : (
                <Reveal key={person.role} y={14} delay={index * 0.12} className={styles.nameBlock}>
                  <span className={styles.portraitRole}>{person.englishLabel}</span>
                  <span className={styles.nameBlockName}>{person.name}</span>
                  <span className={styles.nameBlockRole}>{person.vietnameseLabel}</span>
                </Reveal>
              )
            )}
          </div>
        ))}

      {showStory && (
        <div className={styles.coupleStory}>
          {media.couplePhotoUrl && (
            <Reveal y={0} className={styles.couplePhotoWrap}>
              <Photo
                src={media.couplePhotoUrl}
                alt={`${data.groom.personName} và ${data.bride.personName}`}
                sizes="(max-width: 480px) 100vw, 480px"
                className={styles.couplePhoto}
              />
            </Reveal>
          )}
          <Reveal y={12} delay={0.1} className={media.couplePhotoUrl ? styles.storyCard : styles.storyCardAlone}>
            <p className={styles.storyText}>{story}</p>
          </Reveal>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 04 The Invitation                                                   */
/* ------------------------------------------------------------------ */

function InvitationSection({
  number,
  data,
  resolved,
  sections,
  guestLine,
  ceremonyDate,
}: {
  number: string;
  data: PrototypeWeddingData;
  resolved: ResolvedInvitation;
  sections: SectionVisibility;
  guestLine: string;
  ceremonyDate: ReturnType<typeof deriveCeremonyDisplay>;
}) {
  const showReception = sections.receptionTime || sections.venue || sections.directions;
  const multiSide = resolved.operationalSides.length > 1;

  return (
    <section className={`${styles.section} ${styles.invitation}`}>
      <SectionHead number={number} kicker="The Invitation" />

      <Reveal y={16} className={styles.inviteCard}>
        {sections.mainText && (
          <div className={styles.inviteLead}>
            <div className={styles.inviteSalutation}>{data.invitationWording.salutation}</div>
            <div className={styles.inviteGuest}>{guestLine}</div>
            <div className={styles.inviteTo}>tới dự</div>
          </div>
        )}

        <h3 className={styles.inviteTitle}>{resolved.ceremonyTitle}</h3>
        <div className={styles.inviteCoupleLine}>
          {resolved.primary.personName} <span className={styles.inviteAmp}>&amp;</span>{" "}
          {resolved.secondary.personName}
        </div>

        {sections.ceremony && (
          <div className={styles.inviteDate}>
            <div className={styles.inviteDateCaption}>Hôn lễ được cử hành vào lúc</div>
            <div className={styles.inviteDateRow}>
              <span className={styles.inviteDateSide}>{ceremonyDate.weekdayLabel}</span>
              <span className={styles.inviteDateCenter}>
                <span className={styles.inviteDateTime}>{ceremonyDate.timeLabel}</span>
                <span className={styles.inviteDateDay}>{ceremonyDate.dayLabel}</span>
              </span>
              <span className={styles.inviteDateSide}>
                Tháng {ceremonyDate.monthLabel}
                <br />
                {ceremonyDate.yearLabel}
              </span>
            </div>
          </div>
        )}
      </Reveal>

      {showReception && (
        <div className={`${styles.receptions} ${multiSide ? styles.receptionsMulti : ""}`}>
          {resolved.operationalSides.map((side, index) => {
            const reception = deriveCeremonyDisplay(side.receptionDateTimeIso, data.timeZone);
            return (
              <Reveal key={side.sideLabel} y={14} delay={0.08 + index * 0.1} className={styles.receptionCard}>
                <div className={styles.receptionKicker}>{side.sideLabel}</div>
                <div className={styles.receptionTitle}>{resolveReceptionTitle(data, side)}</div>
                {sections.receptionTime && (
                  <div className={styles.receptionTime}>
                    <span className={styles.receptionClock}>{reception.timeLabel}</span>
                    <span>
                      {reception.weekdayLabel}, {reception.fullDateLabel}
                    </span>
                  </div>
                )}
                {sections.venue && (
                  <>
                    <div className={styles.receptionVenue}>{side.venueName}</div>
                    <div className={styles.receptionAddress}>{side.venueAddress}</div>
                  </>
                )}
                {sections.directions && side.mapsUrl && (
                  <a
                    className={styles.directionsLink}
                    href={side.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={multiSide ? `Chỉ đường tới ${side.venueName}` : undefined}
                  >
                    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                      <path
                        d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.4 4.5 8.5 4.5 8.5s4.5-5.1 4.5-8.5A4.5 4.5 0 0 0 8 1.5zm0 6.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4z"
                        fill="currentColor"
                      />
                    </svg>
                    Chỉ đường
                  </a>
                )}
              </Reveal>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 05 The Date                                                         */
/* ------------------------------------------------------------------ */

function DateSection({
  number,
  data,
  ceremonyDate,
  showCalendar,
  showCountdown,
}: {
  number: string;
  data: PrototypeWeddingData;
  ceremonyDate: ReturnType<typeof deriveCeremonyDisplay>;
  showCalendar: boolean;
  showCountdown: boolean;
}) {
  const calendar = deriveCalendarMonth(data.ceremonyDateTimeIso, data.timeZone);
  const countdown = useCountdown(data.ceremonyDateTimeIso);
  const units = [
    { value: countdown.days, label: "Ngày" },
    { value: countdown.hours, label: "Giờ" },
    { value: countdown.minutes, label: "Phút" },
    { value: countdown.seconds, label: "Giây" },
  ];

  return (
    <section className={`${styles.section} ${styles.date}`}>
      <SectionHead number={number} kicker="The Date" />

      <Reveal y={16} className={styles.datePanel}>
        <div className={styles.dateHeader}>
          <span className={styles.dateMonth}>Tháng {calendar.month}</span>
          <span className={styles.dateYear}>{calendar.year}</span>
        </div>

        {showCalendar && (
          <div className={styles.calendar} role="grid" aria-label={`Lịch tháng ${calendar.month} năm ${calendar.year}`}>
            {CALENDAR_WEEKDAYS.map((weekday) => (
              <span key={weekday} className={styles.calendarWeekday} role="columnheader">
                {weekday}
              </span>
            ))}
            {calendar.cells.map((day, index) =>
              day === null ? (
                <span key={`blank-${index}`} className={styles.calendarBlank} aria-hidden="true" />
              ) : (
                <span
                  key={day}
                  role="gridcell"
                  className={`${styles.calendarDay} ${day === calendar.day ? styles.calendarDayActive : ""}`}
                  aria-current={day === calendar.day ? "date" : undefined}
                >
                  {day}
                </span>
              )
            )}
          </div>
        )}

        <div className={styles.dateCaption}>
          {ceremonyDate.weekdayLabel} · {ceremonyDate.timeLabel} · {ceremonyDate.fullDateLabel}
        </div>

        {showCountdown && (
          <div className={styles.countdown}>
            {countdown.hasPassed ? (
              <p className={styles.countdownPassed}>Ngày chung đôi đã đến</p>
            ) : (
              <div className={styles.countdownRow} aria-label="Đếm ngược tới ngày cưới">
                {units.map((unit) => (
                  <div key={unit.label} className={styles.countdownUnit}>
                    <span className={styles.countdownValue}>{String(unit.value).padStart(2, "0")}</span>
                    <span className={styles.countdownLabel}>{unit.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 06 Our Gallery                                                      */
/* ------------------------------------------------------------------ */

type GalleryRow =
  | { kind: "feature"; large: number; small: [number, number]; flip: boolean }
  | { kind: "pair"; items: [number, number] }
  | { kind: "single"; item: number };

/**
 * Magazine rhythm: rows of one large + two small photos, alternating side;
 * a remainder of two becomes a pair, a remainder of one a wide closer.
 * Placement inside each row is orientation-aware (shared assignment).
 */
function buildGalleryRows(photos: AlbumPhoto[]): GalleryRow[] {
  const rows: GalleryRow[] = [];
  let start = 0;
  let flip = false;
  while (photos.length - start >= 3) {
    const chunk = photos.slice(start, start + 3);
    const [large, smallA, smallB] = assignPhotosToSlots(chunk, FEATURE_SLOTS).map((i) => i + start);
    rows.push({ kind: "feature", large, small: [smallA, smallB], flip });
    flip = !flip;
    start += 3;
  }
  const remaining = photos.length - start;
  if (remaining === 2) rows.push({ kind: "pair", items: [start, start + 1] });
  if (remaining === 1) rows.push({ kind: "single", item: start });
  return rows;
}

function GallerySection({
  number,
  heading,
  photos,
  onOpen,
}: {
  number: string;
  heading: string;
  photos: AlbumPhoto[];
  onOpen: (index: number, opener: HTMLElement) => void;
}) {
  const rows = buildGalleryRows(photos);

  const tile = (index: number, className: string, sizes: string) => {
    const photo = photos[index];
    return (
      <button
        key={index}
        type="button"
        className={`${styles.galleryTile} ${className}`}
        onClick={(event) => onOpen(index, event.currentTarget)}
        aria-label={`Xem ảnh ${index + 1} trên ${photos.length}: ${photo.alt}`}
      >
        <Photo src={photo.src} alt="" sizes={sizes} objectPosition={photoObjectPosition(photo)} />
      </button>
    );
  };

  return (
    <section className={`${styles.section} ${styles.gallery}`}>
      <SectionHead number={number} kicker="Our Gallery" title={heading} />

      <div className={styles.galleryRows}>
        {rows.map((row, rowIndex) => (
          <Reveal key={rowIndex} y={18} className={styles.galleryRowWrap}>
            {row.kind === "feature" && (
              <div className={`${styles.galleryFeature} ${row.flip ? styles.galleryFeatureFlip : ""}`}>
                {tile(row.large, styles.galleryLarge, "(max-width: 480px) 62vw, 290px")}
                {tile(row.small[0], styles.gallerySmall, "(max-width: 480px) 34vw, 160px")}
                {tile(row.small[1], styles.gallerySmall, "(max-width: 480px) 34vw, 160px")}
              </div>
            )}
            {row.kind === "pair" && (
              <div className={styles.galleryPair}>
                {tile(row.items[0], styles.galleryPairTile, "(max-width: 480px) 48vw, 230px")}
                {tile(row.items[1], styles.galleryPairTile, "(max-width: 480px) 48vw, 230px")}
              </div>
            )}
            {row.kind === "single" && (
              <div className={styles.gallerySingle}>
                {tile(row.item, styles.gallerySingleTile, "(max-width: 480px) 100vw, 480px")}
              </div>
            )}
          </Reveal>
        ))}
      </div>
      <p className={styles.galleryHint}>Chạm vào ảnh để xem toàn màn hình</p>
    </section>
  );
}

function PhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
  reducedMotion,
}: {
  photos: AlbumPhoto[];
  index: number;
  onIndexChange: (updater: (current: number | null) => number | null) => void;
  onClose: () => void;
  reducedMotion: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipeStartX = useRef<number | null>(null);
  const count = photos.length;
  const photo = photos[index];

  const step = useCallback(
    (delta: number) => onIndexChange((current) => (current === null ? current : (current + delta + count) % count)),
    [count, onIndexChange]
  );

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, step]);

  const onPointerDown = (event: ReactPointerEvent) => {
    swipeStartX.current = event.clientX;
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    if (swipeStartX.current === null) return;
    const dx = event.clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
  };

  return (
    <motion.div
      className={styles.viewer}
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className={styles.viewerBackdrop} onClick={onClose} aria-hidden="true" />
      <div className={styles.viewerTop}>
        <span className={styles.viewerCount}>
          {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
        </span>
        <button ref={closeRef} type="button" className={styles.viewerClose} onClick={onClose} aria-label="Đóng">
          ✕
        </button>
      </div>
      <div className={styles.viewerStage} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={photo.src + index}
            className={styles.viewerImage}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Image src={photo.src} alt={photo.alt} fill sizes="100vw" style={{ objectFit: "contain" }} draggable={false} />
          </motion.div>
        </AnimatePresence>
      </div>
      {count > 1 && (
        <div className={styles.viewerNav}>
          <button type="button" className={styles.viewerArrow} onClick={() => step(-1)} aria-label="Ảnh trước">
            ‹
          </button>
          <button type="button" className={styles.viewerArrow} onClick={() => step(1)} aria-label="Ảnh sau">
            ›
          </button>
        </div>
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* 07 RSVP & Wedding Gift                                              */
/* ------------------------------------------------------------------ */

type RsvpChoice = RsvpOption["id"];

interface RsvpErrors {
  name?: string;
  choice?: string;
  partySize?: string;
  message?: string;
}

interface SimulatedRsvp {
  name: string;
  choice: RsvpChoice;
  partySize: number;
  message: string;
}

const codePoints = (value: string) => Array.from(value).length;

/**
 * Prototype RSVP form in the supported field order: name → attendance →
 * party size (attending / maybe, 1–20) → message (≤ 500). The name input
 * always starts empty. Submitting only stores a local preview state — no
 * network request, no persistence — and says so plainly.
 */
function useSimulatedRsvp() {
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<RsvpChoice | null>(null);
  const [partySize, setPartySize] = useState(1);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<RsvpErrors>({});
  const [result, setResult] = useState<SimulatedRsvp | null>(null);

  const needsPartySize = choice === "attending" || choice === "maybe";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: RsvpErrors = {};
    const trimmedName = name.trim();
    if (!trimmedName) next.name = "Vui lòng nhập tên của bạn.";
    else if (codePoints(trimmedName) > RSVP_NAME_MAX) next.name = `Tên tối đa ${RSVP_NAME_MAX} ký tự.`;
    if (!choice) next.choice = "Vui lòng chọn một lựa chọn.";
    if (needsPartySize && (!Number.isInteger(partySize) || partySize < PARTY_SIZE_MIN || partySize > PARTY_SIZE_MAX)) {
      next.partySize = `Số người từ ${PARTY_SIZE_MIN} đến ${PARTY_SIZE_MAX}.`;
    }
    if (codePoints(message.trim()) > RSVP_MESSAGE_MAX) next.message = `Lời nhắn tối đa ${RSVP_MESSAGE_MAX} ký tự.`;
    setErrors(next);
    if (Object.keys(next).length > 0 || !choice) return;
    setResult({
      name: trimmedName,
      choice,
      partySize: needsPartySize ? partySize : 0,
      message: message.trim(),
    });
  };

  return {
    name,
    setName,
    choice,
    setChoice,
    partySize,
    setPartySize,
    message,
    setMessage,
    errors,
    result,
    needsPartySize,
    submit,
    editAgain: () => setResult(null),
  };
}

function RsvpGiftSection({
  number,
  showRsvp,
  showGift,
  giftNote,
  onOpenGift,
  giftButtonRef,
}: {
  number: string;
  showRsvp: boolean;
  showGift: boolean;
  giftNote: string;
  onOpenGift: () => void;
  giftButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const rsvp = useSimulatedRsvp();
  const messageLength = codePoints(rsvp.message.trim());

  return (
    <section className={`${styles.section} ${styles.rsvp}`}>
      <SectionHead number={number} kicker={showRsvp ? "RSVP & Wedding Gift" : "Wedding Gift"} />

      {showRsvp && (
        <Reveal y={16} className={styles.rsvpCard}>
          <h3 className={styles.rsvpTitle}>Xác nhận tham dự</h3>
          <p className={styles.rsvpIntro}>Sự có mặt của bạn là niềm vui lớn của chúng mình.</p>

          {rsvp.result ? (
            <div className={styles.rsvpDone} role="status">
              <span className={styles.simBadge}>Bản xem thử</span>
              <p className={styles.rsvpDoneTitle}>Đã ghi nhận trong bản xem thử</p>
              <dl className={styles.rsvpSummary}>
                <dt>Tên</dt>
                <dd>{rsvp.result.name}</dd>
                <dt>Phản hồi</dt>
                <dd>{RSVP_OPTIONS.find((o) => o.id === rsvp.result?.choice)?.label}</dd>
                {rsvp.result.partySize > 0 && (
                  <>
                    <dt>Số người</dt>
                    <dd>{rsvp.result.partySize}</dd>
                  </>
                )}
                {rsvp.result.message && (
                  <>
                    <dt>Lời nhắn</dt>
                    <dd>{rsvp.result.message}</dd>
                  </>
                )}
              </dl>
              <p className={styles.simNote}>Mô phỏng nội bộ — không có dữ liệu nào được gửi hay lưu lại.</p>
              <button type="button" className={styles.textButton} onClick={rsvp.editAgain}>
                Chỉnh sửa phản hồi
              </button>
            </div>
          ) : (
            <form className={styles.rsvpForm} onSubmit={rsvp.submit} noValidate>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Tên của bạn</span>
                <input
                  type="text"
                  className={styles.input}
                  value={rsvp.name}
                  onChange={(e) => rsvp.setName(e.target.value)}
                  placeholder="Ví dụ: Anh Hiếu và gia đình"
                  autoComplete="name"
                  aria-invalid={Boolean(rsvp.errors.name)}
                />
                {rsvp.errors.name && <span className={styles.fieldError}>{rsvp.errors.name}</span>}
              </label>

              <fieldset className={styles.field}>
                <legend className={styles.fieldLabel}>Bạn sẽ tham dự chứ?</legend>
                <div className={styles.choiceList}>
                  {RSVP_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      className={`${styles.choice} ${rsvp.choice === option.id ? styles.choiceActive : ""}`}
                    >
                      <input
                        type="radio"
                        name="ows-rsvp-choice"
                        value={option.id}
                        checked={rsvp.choice === option.id}
                        onChange={() => rsvp.setChoice(option.id)}
                        className={styles.choiceInput}
                      />
                      <span className={styles.choiceMark} aria-hidden="true" />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                {rsvp.errors.choice && <span className={styles.fieldError}>{rsvp.errors.choice}</span>}
              </fieldset>

              {rsvp.needsPartySize && (
                <div className={styles.field}>
                  <span className={styles.fieldLabel} id="ows-party-label">
                    Số người tham dự
                  </span>
                  <div className={styles.stepper} role="group" aria-labelledby="ows-party-label">
                    <button
                      type="button"
                      className={styles.stepperButton}
                      onClick={() => rsvp.setPartySize((n) => Math.max(PARTY_SIZE_MIN, n - 1))}
                      disabled={rsvp.partySize <= PARTY_SIZE_MIN}
                      aria-label="Bớt một người"
                    >
                      −
                    </button>
                    <output className={styles.stepperValue} aria-live="polite">
                      {rsvp.partySize}
                    </output>
                    <button
                      type="button"
                      className={styles.stepperButton}
                      onClick={() => rsvp.setPartySize((n) => Math.min(PARTY_SIZE_MAX, n + 1))}
                      disabled={rsvp.partySize >= PARTY_SIZE_MAX}
                      aria-label="Thêm một người"
                    >
                      +
                    </button>
                  </div>
                  {rsvp.errors.partySize && <span className={styles.fieldError}>{rsvp.errors.partySize}</span>}
                </div>
              )}

              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  Lời nhắn <span className={styles.fieldOptional}>(không bắt buộc)</span>
                </span>
                <textarea
                  className={`${styles.input} ${styles.textarea}`}
                  value={rsvp.message}
                  onChange={(e) => rsvp.setMessage(e.target.value)}
                  rows={3}
                  placeholder="Gửi lời chúc tới cô dâu chú rể…"
                  aria-invalid={Boolean(rsvp.errors.message)}
                />
                <span className={`${styles.counter} ${messageLength > RSVP_MESSAGE_MAX ? styles.counterOver : ""}`}>
                  {messageLength}/{RSVP_MESSAGE_MAX}
                </span>
                {rsvp.errors.message && <span className={styles.fieldError}>{rsvp.errors.message}</span>}
              </label>

              <button type="submit" className={styles.submitButton}>
                Gửi xác nhận
              </button>
              <p className={styles.simNote}>Bản xem thử nội bộ — phản hồi chỉ được mô phỏng, không gửi đi đâu.</p>
            </form>
          )}
        </Reveal>
      )}

      {showGift && (
        <Reveal y={12} delay={0.08} className={styles.giftBlock}>
          <span className={styles.giftRule} aria-hidden="true" />
          <p className={styles.giftNote}>{giftNote}</p>
          <button ref={giftButtonRef} type="button" className={styles.giftButton} onClick={onOpenGift}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M2.5 6.5h11v2h-11zM3.5 8.5h9v5.5h-9zM8 6.5V14M8 6.3C6.6 3.6 4.4 3.7 4.6 5.1c.2 1.1 2.1 1.3 3.4 1.2zm0 0c1.4-2.7 3.6-2.6 3.4-1.2-.2 1.1-2.1 1.3-3.4 1.2z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
            Gửi quà mừng cưới
          </button>
        </Reveal>
      )}
    </section>
  );
}

type CopyState = { key: string; status: "copied" | "failed" } | null;

/**
 * Copy that reports success only after the browser confirms the write;
 * a missing API or a rejected write is shown as a failure, never as success.
 */
function useVerifiedCopy() {
  const [state, setState] = useState<CopyState>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  const copy = useCallback(async (key: string, value: string) => {
    let status: "copied" | "failed" = "failed";
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        status = "copied";
      }
    } catch {
      status = "failed";
    }
    setState({ key, status });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setState(null), 2200);
  }, []);

  return { state, copy };
}

function GiftSheet({
  sides,
  note,
  onClose,
  reducedMotion,
}: {
  sides: SideDetails[];
  note: string;
  onClose: () => void;
  reducedMotion: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { state, copy } = useVerifiedCopy();

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <motion.div
      className={styles.sheetLayer}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ows-gift-title"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className={styles.sheetBackdrop} onClick={onClose} aria-hidden="true" />
      <motion.div
        className={styles.sheet}
        initial={reducedMotion ? false : { y: 40 }}
        animate={{ y: 0 }}
        exit={reducedMotion ? { y: 0 } : { y: 40 }}
        transition={{ duration: 0.35, ease: EASE_EDITORIAL }}
      >
        <div className={styles.sheetHead}>
          <span className={styles.sheetKicker}>Wedding Gift</span>
          <button ref={closeRef} type="button" className={styles.sheetClose} onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <h3 id="ows-gift-title" className={styles.sheetTitle}>
          Hộp mừng cưới
        </h3>
        <p className={styles.sheetNote}>{note}</p>

        <div className={styles.sheetSides}>
          {sides.map((side) => {
            const copyKey = `${side.sideLabel}-account`;
            const copyState = state?.key === copyKey ? state.status : null;
            return (
              <div key={side.sideLabel} className={styles.bankCard}>
                <div className={styles.bankSide}>{side.sideLabel}</div>
                {side.gift.qrImageUrl && (
                  <div className={styles.bankQr}>
                    <Image src={side.gift.qrImageUrl} alt={`Mã QR chuyển khoản ${side.sideLabel}`} fill sizes="140px" />
                  </div>
                )}
                <dl className={styles.bankRows}>
                  <dt>Ngân hàng</dt>
                  <dd>{side.gift.bankName}</dd>
                  <dt>Chủ tài khoản</dt>
                  <dd>{side.gift.accountHolder}</dd>
                  <dt>Số tài khoản</dt>
                  <dd className={styles.bankNumberRow}>
                    <span className={styles.bankNumber}>{side.gift.accountNumber}</span>
                    <button
                      type="button"
                      className={styles.copyButton}
                      onClick={() => copy(copyKey, side.gift.accountNumber)}
                    >
                      {copyState === "copied" ? "Đã sao chép" : "Sao chép"}
                    </button>
                  </dd>
                </dl>
                <span className={styles.copyStatus} role="status">
                  {copyState === "failed" ? "Không sao chép được — vui lòng chép thủ công." : ""}
                </span>
              </div>
            );
          })}
        </div>
        <p className={styles.simNote}>Thông tin ngân hàng hư cấu — dùng cho bản xem thử.</p>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* 08 Thank You                                                        */
/* ------------------------------------------------------------------ */

function ThankYouSection({
  number,
  data,
  resolved,
  photoUrl,
  ceremonyDate,
}: {
  number: string;
  data: PrototypeWeddingData;
  resolved: ResolvedInvitation;
  photoUrl?: string;
  ceremonyDate: ReturnType<typeof deriveCeremonyDisplay>;
}) {
  const message = (
    <p className={styles.thanksMessage}>
      {data.closingMessage.split("\n").map((line, index, lines) => (
        <LineWithBreak key={index} last={index === lines.length - 1}>
          {line}
        </LineWithBreak>
      ))}
    </p>
  );

  return (
    <section className={`${styles.section} ${styles.thanks}`}>
      <SectionHead number={number} kicker="Thank You" />

      {photoUrl ? (
        <>
          <Reveal y={0} className={styles.thanksFigure}>
            <Photo
              src={photoUrl}
              alt={`${resolved.primary.personName} và ${resolved.secondary.personName}`}
              sizes="(max-width: 480px) 100vw, 480px"
              className={styles.thanksPhoto}
            />
            <span className={styles.thanksShade} aria-hidden="true" />
            <span className={styles.thanksScriptOnPhoto}>Thank you</span>
          </Reveal>
          <Reveal y={12} delay={0.1} className={styles.thanksText}>
            {message}
            <ThanksSignature resolved={resolved} date={ceremonyDate.fullDateLabel} />
          </Reveal>
        </>
      ) : (
        <Reveal y={14} className={styles.thanksTextOnly}>
          <span className={styles.thanksScript}>Thank you</span>
          <span className={styles.thanksTextRule} aria-hidden="true" />
          {message}
          <ThanksSignature resolved={resolved} date={ceremonyDate.fullDateLabel} />
        </Reveal>
      )}
    </section>
  );
}

function ThanksSignature({ resolved, date }: { resolved: ResolvedInvitation; date: string }) {
  return (
    <div className={styles.thanksSignature}>
      <span>
        {resolved.primary.personName} &amp; {resolved.secondary.personName}
      </span>
      <span className={styles.thanksSignatureDate}>{date}</span>
    </div>
  );
}

function LineWithBreak({ children, last }: { children: ReactNode; last: boolean }) {
  return (
    <>
      {children}
      {!last && <br />}
    </>
  );
}
