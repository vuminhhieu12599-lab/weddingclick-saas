"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Allura, Cormorant_Garamond, Great_Vibes } from "next/font/google";
import { AnimatePresence, motion } from "framer-motion";

import { deriveCalendarMonth, deriveCeremonyDisplay } from "../../_shared/derive-ceremony";
import { useCountdown } from "../../_shared/use-countdown";
import { useReducedMotion } from "../../_shared/use-reduced-motion";
import { useClipboard } from "../../_shared/use-clipboard";
import { useRsvpForm } from "../../_shared/use-rsvp-form";
import { useMusicControl } from "../../_shared/use-music-control";
import { useLightbox } from "../../_shared/use-lightbox";
import type { LightboxImage } from "../../_shared/use-lightbox";
import { assignPhotosToSlots, photoObjectPosition } from "../../_shared/album-assignment";
import type { AlbumSlotPreference } from "../../_shared/album-assignment";
import { resolveInvitation, resolveReceptionTitle } from "../../_shared/resolve-variant";
import { resolveGuestLine } from "../../_shared/invitation-text";
import { RSVP_OPTIONS } from "../../_shared/rsvp-options";
import { Reveal } from "../../_shared/reveal";
import type { AlbumPhoto, InvitationVariant, PrototypeWeddingData, SideDetails } from "../../_shared/types";
import type { SectionVisibility } from "../../_shared/sections";
import styles from "./romantic-minimal.module.css";

// Romantic Minimal opening-cover typography. Both faces are SIL Open Font
// License (web + commercial use) with a Vietnamese subset; next/font
// self-hosts them and only this template loads them.
const romanticSerif = Cormorant_Garamond({
  subsets: ["vietnamese"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--rm-serif",
});

const romanticScript = Great_Vibes({
  subsets: ["vietnamese"],
  weight: "400",
  display: "swap",
  variable: "--rm-script",
});

// Fine hairline script for the Just Married lettering (lighter than Great
// Vibes). SIL Open Font License, Vietnamese subset, self-hosted by next/font.
const romanticFineScript = Allura({
  subsets: ["vietnamese"],
  weight: "400",
  display: "swap",
  variable: "--rm-fine-script",
});

// Product-Owner-supplied Romantic Minimal decor (Task 029). The envelope
// assets are reserved for the inner Save The Date section, not the cover.
const ROMANTIC_DECOR_BASE = "/prototypes/invitation/decor/romantic-minimal/";
const ROMANTIC_ASSETS = {
  floralTopLeft: `${ROMANTIC_DECOR_BASE}romantic-floral-top-left.png`,
  floralBottomRight: `${ROMANTIC_DECOR_BASE}romantic-floral-bottom-right.png`,
  seal: `${ROMANTIC_DECOR_BASE}romantic-envelope-seal.png`,
  heartBurst: `${ROMANTIC_DECOR_BASE}romantic-heart-burst.png`,
  architecture: `${ROMANTIC_DECOR_BASE}romantic-architecture-sketch.svg`,
  divider: `${ROMANTIC_DECOR_BASE}romantic-divider.png`,
  envelopeBack: `${ROMANTIC_DECOR_BASE}romantic-envelope-back.png`,
  envelopePocket: `${ROMANTIC_DECOR_BASE}romantic-envelope-pocket.png`,
};

// Save The Date hero photo. Prototype stand-in for the Project hero media
// (same demo placeholder the Vietnamese Heritage direction uses).
const DEMO_HERO_PHOTO = "/prototypes/invitation/demo/hero.svg";
// Just Married landscape photo — prototype stand-in for one horizontal
// Project photo; the warm-toned demo placeholder suits the blush palette.
const DEMO_JUST_MARRIED_PHOTO = DEMO_HERO_PHOTO;

// Non-personalized guest line for this template's split invitation intro.
// Prototype constant; production wording comes from the Project's editable
// invitation wording, like `invitationWording.salutation`.
const ROMANTIC_DEFAULT_GUEST_LABEL = "Quý Khách";

type OpeningPhase = "closed" | "opening" | "done";

// Calendar weekday header, Sunday-first to match the derived grid.
const CALENDAR_WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// Our Love: three near-portrait slots, portrait photos preferred.
const OUR_LOVE_SLOTS: AlbumSlotPreference[] = Array.from({ length: 3 }, () => ({
  preferred: ["portrait", "square", "landscape"] as const,
}));

interface Props {
  data: PrototypeWeddingData;
  variant: InvitationVariant;
  personalization: boolean;
  guestDisplayName: string;
  sections: SectionVisibility;
}

export function RomanticMinimalPrototype({ data, variant, personalization, guestDisplayName, sections }: Props) {
  const [openingPhase, setOpeningPhase] = useState<OpeningPhase>("closed");
  const [giftOpen, setGiftOpen] = useState(false);
  const giftButtonRef = useRef<HTMLButtonElement>(null);
  // Hand focus back to the gift button without scrolling the invitation.
  const closeGift = useCallback(() => {
    setGiftOpen(false);
    giftButtonRef.current?.focus({ preventScroll: true });
  }, []);
  const reducedMotion = useReducedMotion();
  // RSVP name prefill only for a personalized guest link (same rule as Heritage).
  const rsvpPrefill = personalization ? guestDisplayName.trim() : "";
  const music = useMusicControl();
  const lightbox = useLightbox();
  // Album viewer lives at the root (like the other overlays) so its fixed
  // overlay is never inside an animated/transformed ancestor.
  const [albumIndex, setAlbumIndex] = useState<number | null>(null);
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
  const albumCount = data.album.length;
  const stepAlbum = useCallback(
    (step: number) =>
      setAlbumIndex((current) => (current === null ? current : (current + step + albumCount) % albumCount)),
    [albumCount]
  );

  const resolved = resolveInvitation(data, variant);
  const ceremony = deriveCeremonyDisplay(data.ceremonyDateTimeIso, data.timeZone);
  const calendar = deriveCalendarMonth(data.ceremonyDateTimeIso, data.timeZone);
  const countdown = useCountdown(data.ceremonyDateTimeIso);
  // Personalized display name (free-form, e.g. "Anh Hiếu") when on,
  // otherwise this template's formal default guest wording.
  const guestLine = resolveGuestLine(personalization, guestDisplayName, ROMANTIC_DEFAULT_GUEST_LABEL);
  const multiSide = resolved.operationalSides.length > 1;
  const ourLovePhotos =
    data.album.length >= OUR_LOVE_SLOTS.length
      ? assignPhotosToSlots(data.album, OUR_LOVE_SLOTS).map((photoIndex) => data.album[photoIndex])
      : data.album;
  const isOpening = openingPhase === "opening";
  const isRevealed = openingPhase !== "closed";
  const saveTheDateLabel = `${ceremony.dayLabel} . ${ceremony.monthLabel} . ${ceremony.yearLabel}`;

  // Reduced motion: no heart burst / slide — the cover is simply removed.
  const openInvitation = () => setOpeningPhase(reducedMotion ? "done" : "opening");


  const showLogistics =
    sections.ceremony || sections.receptionTime || sections.venue || sections.directions || sections.countdown;

  return (
    <div
      className={`${styles.root} ${romanticSerif.variable} ${romanticScript.variable} ${romanticFineScript.variable} ${
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
        <div className={styles.cover}>
          <motion.div
            className={styles.coverBackdrop}
            initial={false}
            animate={{ opacity: isOpening ? 0 : 1 }}
            transition={{ duration: 0.55, delay: isOpening ? 0.5 : 0, ease: "easeInOut" }}
            onAnimationComplete={() => {
              if (isOpening) setOpeningPhase("done");
            }}
          />

          <motion.div
            className={styles.coverCard}
            initial={reducedMotion ? false : { opacity: 0, y: 14 }}
            animate={isOpening ? { y: "-135%", opacity: 0 } : { y: 0, opacity: 1 }}
            transition={
              isOpening
                ? {
                    y: { duration: 0.8, delay: 0.25, ease: [0.65, 0, 0.35, 1] },
                    opacity: { duration: 0.35, delay: 0.7, ease: "easeIn" },
                  }
                : { duration: reducedMotion ? 0 : 0.6, ease: "easeOut" }
            }
          >
            <div className={`${styles.coverFloral} ${styles.coverFloralLeft}`}>
              <Image src={ROMANTIC_ASSETS.floralTopLeft} alt="" fill sizes="160px" loading="eager" style={{ objectFit: "contain" }} />
            </div>
            <div className={`${styles.coverFloral} ${styles.coverFloralRight}`}>
              <Image src={ROMANTIC_ASSETS.floralBottomRight} alt="" fill sizes="160px" loading="eager" style={{ objectFit: "contain" }} />
            </div>

            <div className={styles.coverContent}>
              <div className={styles.coverSeal}>
                <motion.div
                  className={styles.coverSealImage}
                  animate={isOpening ? { scale: [1, 1.16, 1.04] } : { scale: 1 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                >
                  <Image src={ROMANTIC_ASSETS.seal} alt="" fill sizes="64px" priority style={{ objectFit: "contain" }} />
                </motion.div>
                {/* Mounted (invisible) from first paint so the burst image is */}
                {/* already loaded when "Mở thiệp" is tapped. */}
                <motion.div
                  className={styles.coverBurst}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={isOpening ? { opacity: [0, 0.95, 0], scale: [0.5, 1.1, 1.3] } : { opacity: 0, scale: 0.5 }}
                  transition={{ duration: isOpening ? 0.85 : 0, ease: "easeOut", times: [0, 0.35, 1] }}
                >
                  <Image src={ROMANTIC_ASSETS.heartBurst} alt="" fill sizes="200px" loading="eager" style={{ objectFit: "contain" }} />
                </motion.div>
              </div>

              <h1 className={styles.coverNames}>
                <span>{resolved.primary.personName}</span>
                <span className={styles.coverAmpersand}>&amp;</span>
                <span>{resolved.secondary.personName}</span>
              </h1>

              <div className={styles.coverDate}>{ceremony.fullDateLabel}</div>
              <span className={styles.coverRule} aria-hidden="true" />
              <div className={styles.coverInvite}>Thân Mời</div>

              <button type="button" className={styles.openButton} onClick={openInvitation} disabled={isOpening}>
                Mở thiệp
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: openingPhase === "closed" ? 0 : 1 }}
        transition={{ duration: reducedMotion ? 0 : 0.6, delay: reducedMotion ? 0 : 0.45 }}
      >
        {/* Save The Date — first inner screen (PO "Mẫu 3" mockup): title,  */}
        {/* date, names, then a large photo rising out of an open envelope. */}
        {/* Slides up from below once the opening cover has lifted away.   */}
        <motion.section
          className={styles.saveTheDate}
          initial={reducedMotion ? false : { y: 90, opacity: 0 }}
          animate={isRevealed ? { y: 0, opacity: 1 } : undefined}
          transition={{ duration: reducedMotion ? 0 : 0.9, delay: reducedMotion ? 0 : 0.85, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={styles.stdArchitecture} aria-hidden="true">
            <Image src={ROMANTIC_ASSETS.architecture} alt="" fill sizes="430px" style={{ objectFit: "contain" }} />
          </div>

          <div className={styles.stdHeading}>
            <div className={styles.stdKicker}>Save the date</div>
            <div className={styles.stdDate}>{saveTheDateLabel}</div>
            <h2 className={styles.stdNames}>
              <span>{resolved.primary.personName}</span>
              <span className={styles.stdAmpersand}>&amp;</span>
              <span>{resolved.secondary.personName}</span>
            </h2>
          </div>

          <div className={styles.stdStage}>
            <div className={styles.stdEnvelope}>
              <div className={`${styles.stdLayer} ${styles.stdEnvelopeBack}`}>
                <Image src={ROMANTIC_ASSETS.envelopeBack} alt="" fill sizes="480px" style={{ objectFit: "fill" }} />
              </div>

              {/* Photo well: clips the photo at the envelope floor so it can */}
              {/* start deep inside the pocket without showing below it.      */}
              <div className={styles.stdPhotoWell}>
                <motion.div
                  className={styles.stdPhoto}
                  // Starts ~60% hidden behind the pocket, then is drawn up to
                  // the approved resting position (~19% still tucked inside).
                  initial={reducedMotion ? false : { y: "40%", scale: 0.98 }}
                  animate={isRevealed ? { y: 0, scale: 1 } : undefined}
                  transition={{ duration: reducedMotion ? 0 : 1.15, delay: reducedMotion ? 0 : 1.35, ease: [0.3, 0.55, 0.25, 1] }}
                >
                  <div className={styles.stdPhotoInner}>
                    <Image
                      src={DEMO_HERO_PHOTO}
                      alt={`${resolved.primary.personName} và ${resolved.secondary.personName}`}
                      fill
                      sizes="360px"
                      style={{ objectFit: "cover" }}
                    />
                  </div>
                </motion.div>
              </div>

              <div className={`${styles.stdLayer} ${styles.stdEnvelopePocket}`}>
                <Image src={ROMANTIC_ASSETS.envelopePocket} alt="" fill sizes="520px" style={{ objectFit: "fill" }} />
              </div>

              <div className={styles.stdSeal}>
                <Image src={ROMANTIC_ASSETS.seal} alt="" fill sizes="72px" style={{ objectFit: "contain" }} />
              </div>

              <div className={styles.stdFloral} aria-hidden="true">
                <Image src={ROMANTIC_ASSETS.floralBottomRight} alt="" fill sizes="200px" style={{ objectFit: "contain" }} />
              </div>
            </div>
          </div>
        </motion.section>

        {/* Couple + family identity (PO "Mẫu 3" screen 3): vertical rite   */}
        {/* accent, couple names, then both families in staggered columns.  */}
        {/* Name/family order and rite wording come from the resolver (§5). */}
        {sections.family && (
          <section className={styles.identity}>
            {/* Faint embossed floral watermark in the paper — decor only. */}
            <div className={`${styles.identityWatermark} ${styles.identityWatermarkTop}`} aria-hidden="true">
              <Image src={ROMANTIC_ASSETS.floralTopLeft} alt="" fill sizes="220px" style={{ objectFit: "contain" }} />
            </div>
            <div className={`${styles.identityWatermark} ${styles.identityWatermarkBottom}`} aria-hidden="true">
              <Image src={ROMANTIC_ASSETS.floralBottomRight} alt="" fill sizes="300px" style={{ objectFit: "contain" }} />
            </div>

            {/* Connector from Save The Date: hairline — tiny heart — hairline. */}
            <Reveal y={0} className={styles.identityConnector}>
              <svg viewBox="0 0 220 20" width="220" height="20" aria-hidden="true">
                <defs>
                  <linearGradient id="rm-connector-left" gradientUnits="userSpaceOnUse" x1="4" y1="0" x2="90" y2="0">
                    <stop offset="0" stopColor="#c5a06a" stopOpacity="0" />
                    <stop offset="1" stopColor="#c5a06a" stopOpacity="0.9" />
                  </linearGradient>
                  <linearGradient id="rm-connector-right" gradientUnits="userSpaceOnUse" x1="216" y1="0" x2="130" y2="0">
                    <stop offset="0" stopColor="#c5a06a" stopOpacity="0" />
                    <stop offset="1" stopColor="#c5a06a" stopOpacity="0.9" />
                  </linearGradient>
                </defs>
                <line x1="4" y1="10" x2="90" y2="10" stroke="url(#rm-connector-left)" strokeWidth="1" />
                <line x1="130" y1="10" x2="216" y2="10" stroke="url(#rm-connector-right)" strokeWidth="1" />
                <circle cx="95" cy="10" r="1.4" fill="#c5a06a" opacity="0.8" />
                <circle cx="125" cy="10" r="1.4" fill="#c5a06a" opacity="0.8" />
                <path
                  d="M110 16.2 C104.6 12.4 102.4 10 102.4 7.3 C102.4 5.1 104.1 3.5 106.1 3.5 C107.8 3.5 109.2 4.5 110 6 C110.8 4.5 112.2 3.5 113.9 3.5 C115.9 3.5 117.6 5.1 117.6 7.3 C117.6 10 115.4 12.4 110 16.2 Z"
                  fill="rgba(243, 221, 225, 0.6)"
                  stroke="#c88491"
                  strokeWidth="1"
                />
              </svg>
            </Reveal>

            <div className={styles.identityTop}>
              <Reveal y={0} className={styles.identityAccent}>
                <span className={styles.identityAccentLine} aria-hidden="true" />
                <span className={styles.identityAccentText}>
                  {resolved.ceremonyTitle.split(" ").map((word) => (
                    <span key={word}>{word}</span>
                  ))}
                </span>
                <span className={styles.identityAccentLine} aria-hidden="true" />
              </Reveal>

              <Reveal delay={0.1} className={styles.identityNamesWrap}>
                <h2 className={styles.identityNames}>
                  <span>{resolved.primary.personName}</span>
                  <span className={styles.identityAmpersand}>&amp;</span>
                  <span>{resolved.secondary.personName}</span>
                </h2>
              </Reveal>
            </div>

            <Reveal y={0} delay={0.2}>
              <div className={styles.identityDivider} aria-hidden="true">
                <Image src={ROMANTIC_ASSETS.divider} alt="" fill sizes="220px" style={{ objectFit: "contain" }} />
              </div>
            </Reveal>

            <div className={styles.identityFamilies}>
              <Reveal y={0} x={-16} delay={0.25} className={styles.identityFamily}>
                <FamilyColumn side={resolved.primary} />
              </Reveal>
              <Reveal y={0} x={16} delay={0.4} className={styles.identityFamily}>
                <FamilyColumn side={resolved.secondary} />
              </Reveal>
            </div>
          </section>
        )}

        {/* Just Married — one full-bleed landscape photo (PO "Mẫu 3" screen */}
        {/* 4) with a fine script + serif lettering overlay.                */}
        {/* Single horizontal slot for the customer's landscape photo.      */}
        <section className={styles.justMarried}>
          <Reveal y={20} className={styles.jmFrame}>
            <div className={styles.jmPhoto}>
              <motion.div
                className={styles.jmPhotoMedia}
                initial={reducedMotion ? false : { scale: 1.04 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: reducedMotion ? 0 : 1.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <Image
                  src={DEMO_JUST_MARRIED_PHOTO}
                  alt={`${resolved.primary.personName} và ${resolved.secondary.personName}`}
                  fill
                  sizes="420px"
                  style={{ objectFit: "cover" }}
                />
              </motion.div>
              <span className={styles.jmScrim} aria-hidden="true" />
              <Reveal y={8} delay={0.3} className={styles.jmCaption}>
                <span className={styles.jmTitle}>
                  <span className={styles.jmTitleScript}>Just</span>
                  <span className={styles.jmTitleSerif}>Married</span>
                </span>
              </Reveal>
            </div>
          </Reveal>
        </section>

        {sections.mainText && (
          // Invitation intro (PO "Mẫu 3"): script salutation, then the guest
          // line — first content after the Just Married photo.
          <section className={styles.invite}>
            <Reveal y={12}>
              <p className={styles.inviteSalutation}>{data.invitationWording.salutation}</p>
            </Reveal>
            <Reveal y={12} delay={0.12}>
              <p className={styles.inviteGuest}>{guestLine}</p>
            </Reveal>
            <Reveal y={0} delay={0.24}>
              <span className={styles.inviteRule} aria-hidden="true">
                <span />
                <span className={styles.inviteRuleDot} />
                <span />
              </span>
            </Reveal>
          </section>
        )}

        {showLogistics && (
          <section className={styles.ceremonySection}>
            {sections.ceremony && (
              // Typeset rite date (PO "Mẫu 3"): every value derives from the
              // one canonical ceremony instant (CLAUDE.md §7).
              <div className={styles.rite}>
                <Reveal y={10}>
                  <h2 className={styles.riteTitle}>{resolved.ceremonyTitle}</h2>
                  <span className={styles.inviteRule} aria-hidden="true">
                    <span />
                    <span className={styles.inviteRuleDot} />
                    <span />
                  </span>
                  <div className={styles.riteWeekday}>{ceremony.weekdayLabel}</div>
                </Reveal>

                <Reveal y={10} delay={0.12} className={styles.riteDate}>
                  <span className={styles.riteTime}>{ceremony.timeLabel}</span>
                  <span className={styles.riteDay}>{ceremony.dayLabel}</span>
                  <span className={styles.riteYear}>{ceremony.yearLabel}</span>
                  <span className={styles.riteMonth}>Tháng {ceremony.monthLabel}</span>
                </Reveal>

                <Reveal y={0} delay={0.22}>
                  <div className={styles.riteLunar}>(Tức ngày {data.ceremonyLunarDateLabel})</div>
                </Reveal>
              </div>
            )}

            {/* Countdown to the same canonical ceremony instant the rite    */}
            {/* date above renders (CLAUDE.md §7) — bridges into reception. */}
            {sections.countdown && !countdown.hasPassed && (
              <Reveal y={8} delay={0.1} className={styles.countdown}>
                <div className={styles.countdownHeading}>Đếm ngược tới ngày chung đôi</div>
                <div className={styles.countdownRow}>
                  {[
                    { value: countdown.days, label: "Ngày" },
                    { value: countdown.hours, label: "Giờ" },
                    { value: countdown.minutes, label: "Phút" },
                    { value: countdown.seconds, label: "Giây" },
                  ].map((unit) => (
                    <div key={unit.label} className={styles.countdownUnit}>
                      <span className={styles.countdownValue}>{String(unit.value).padStart(2, "0")}</span>
                      <span className={styles.countdownLabel}>{unit.label}</span>
                    </div>
                  ))}
                </div>
              </Reveal>
            )}

            {/* Reception — one soft invitation block per operational side     */}
            {/* (COMMON: both families; GROOM/BRIDE: that side only, from the */}
            {/* resolver). Subtitle wording also comes from the resolver.     */}
            {(sections.receptionTime || sections.venue || sections.directions) && (
              <div className={styles.reception}>
                {resolved.operationalSides.map((side, index) => {
                  const receptionDisplay = deriveCeremonyDisplay(side.receptionDateTimeIso, data.timeZone);
                  return (
                    <Reveal key={side.sideLabel} y={12} delay={0.08 + index * 0.1} className={styles.receptionSide}>
                      <div className={styles.receptionSideLabel}>{side.sideLabel}</div>
                      <div className={styles.receptionSubtitle}>{resolveReceptionTitle(data, side)}</div>
                      {sections.receptionTime && (
                        <div className={styles.receptionTime}>
                          {receptionDisplay.timeLabel} · {receptionDisplay.weekdayLabel} · {receptionDisplay.fullDateLabel}
                        </div>
                      )}
                      {sections.venue && (
                        <>
                          <div className={styles.receptionVenue}>{side.venueName}</div>
                          <div className={styles.receptionAddress}>{side.venueAddress}</div>
                        </>
                      )}
                      {sections.directions && (
                        <a
                          className={styles.receptionDirections}
                          href={side.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={multiSide ? `Xem chỉ đường · ${side.sideLabel}` : undefined}
                        >
                          Xem chỉ đường
                        </a>
                      )}
                    </Reveal>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Timeline — kept as-is here pending its own polish checkpoint. */}
        {sections.timeline && (
          <section className={styles.sectionDetails}>
            <Reveal>
              <div className={styles.divider}>
                <span className={styles.dividerLine} />
                <span className={styles.dividerDot} />
                <span className={styles.dividerLine} />
              </div>
              <div className={styles.timelineList}>
                {data.timeline.map((item) => {
                  const display = deriveCeremonyDisplay(item.dateTimeIso, data.timeZone);
                  return (
                    <div key={item.label} className={styles.timelineRow}>
                      <span className={styles.timelineTime}>{display.timeLabel}</span>
                      <span className={styles.timelineLabel}>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </Reveal>
          </section>
        )}

        {/* Our Love (PO "Mẫu 3"): title, three portrait photos in one row, */}
        {/* then the couple's story text. Photos come from Project media,  */}
        {/* placed portrait-first with each photo's focal point.          */}
        {sections.loveStory && (
          <section className={styles.ourLove}>
            <Reveal y={14}>
              <h2 className={styles.ourLoveTitle}>Our Love</h2>
            </Reveal>
            <div className={styles.ourLovePhotos}>
              {ourLovePhotos.map((photo, index) => (
                <Reveal key={photo.src} y={14} delay={0.1 + index * 0.1} className={styles.ourLovePhotoWrap}>
                  <button
                    type="button"
                    className={styles.ourLovePhoto}
                    onClick={() => lightbox.open({ src: photo.src, alt: photo.alt })}
                    aria-label={`Xem ảnh: ${photo.alt}`}
                  >
                    <Image
                      src={photo.src}
                      alt={photo.alt}
                      fill
                      sizes="140px"
                      style={{ objectFit: "cover", objectPosition: photoObjectPosition(photo) }}
                    />
                  </button>
                </Reveal>
              ))}
            </div>
            <Reveal y={0} delay={0.45}>
              <p className={styles.ourLoveText}>{data.loveStoryShort ?? data.loveStory}</p>
            </Reveal>
          </section>
        )}

        {/* Wedding calendar (PO "Mẫu 3", adapted to the pink palette): one */}
        {/* rose card, script month title, derived month grid with a heart */}
        {/* on the wedding day. Shown with the ceremony information.       */}
        {sections.ceremony && (
          <section className={styles.calendarSection}>
            <Reveal y={18} className={styles.calendarCard}>
              <Reveal y={0} delay={0.3} className={`${styles.calendarFloral} ${styles.calendarFloralTop}`}>
                <Image src={ROMANTIC_ASSETS.floralTopLeft} alt="" fill sizes="110px" style={{ objectFit: "contain" }} />
              </Reveal>
              <Reveal y={0} delay={0.4} className={`${styles.calendarFloral} ${styles.calendarFloralBottom}`}>
                <Image src={ROMANTIC_ASSETS.floralBottomRight} alt="" fill sizes="110px" style={{ objectFit: "contain" }} />
              </Reveal>

              <span className={styles.calendarOrnament} aria-hidden="true">
                <span />
                <span className={styles.calendarOrnamentDot} />
                <span />
              </span>
              <p className={styles.calendarIntro}>
                Đám cưới của chúng mình
                <br />
                sẽ diễn ra vào
              </p>
              <Reveal y={0} delay={0.2}>
                <div className={styles.calendarMonth}>Tháng {calendar.month}</div>
              </Reveal>

              <div className={styles.calendarGrid} role="group" aria-label={`Tháng ${calendar.month} năm ${calendar.year}`}>
                {CALENDAR_WEEKDAYS.map((weekday) => (
                  <span key={weekday} className={styles.calendarWeekday}>
                    {weekday}
                  </span>
                ))}
                {calendar.cells.map((d, index) =>
                  d === calendar.day ? (
                    <span key={index} className={styles.calendarCell} aria-label={`Ngày cưới ${d}`}>
                      <motion.span
                        className={styles.calendarHeart}
                        aria-hidden="true"
                        initial={reducedMotion ? false : { scale: 0.6, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: reducedMotion ? 0 : 0.7, delay: reducedMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <svg viewBox="0 0 32 29" className={styles.calendarHeartShape}>
                          <path d="M16 28.2C6.6 21.6 1 16.2 1 9.6 1 4.8 4.7 1 9.3 1c2.9 0 5.3 1.5 6.7 3.8C17.4 2.5 19.8 1 22.7 1 27.3 1 31 4.8 31 9.6c0 6.6-5.6 12-15 18.6z" />
                        </svg>
                      </motion.span>
                      <span className={styles.calendarHeartDay}>{d}</span>
                    </span>
                  ) : (
                    <span key={index} className={styles.calendarCell}>
                      {d}
                    </span>
                  )
                )}
              </div>
            </Reveal>
          </section>
        )}

        {/* RSVP + wishes (PO "Mẫu 3"): shared RSVP form behavior; the  */}
        {/* key remounts it when the personalized guest changes.        */}
        {sections.rsvp && (
          <RomanticRsvp key={rsvpPrefill} prefillGuestName={rsvpPrefill} reducedMotion={reducedMotion} />
        )}

        {/* Wedding gift (PO "Mẫu 3"): note + one CTA; bank/QR details   */}
        {/* only inside the modal, per the resolver's operational sides. */}
        {sections.gift && (
          <section className={styles.giftSection}>
            <Reveal y={14}>
              <span className={styles.giftOrnament} aria-hidden="true">
                <span />
                <span className={styles.giftOrnamentDot} />
                <span />
              </span>
              <p className={styles.giftNote}>{data.giftIntroNoteExtended ?? data.giftIntroNote}</p>
              <button ref={giftButtonRef} type="button" className={styles.giftButton} onClick={() => setGiftOpen(true)}>
                Gửi mừng cưới
              </button>
            </Reveal>
          </section>
        )}

        {/* Wedding Album (PO "Mẫu 3"): script title over a two-column grid */}
        {/* of uniform tiles, in album order; tiles crop to each photo's   */}
        {/* focal point and the viewer shows the full, uncropped photo.    */}
        {sections.gallery && data.album.length > 0 && (
          <section className={styles.albumSection}>
            <Reveal y={14}>
              <h2 className={styles.albumTitle}>Wedding Album</h2>
              <span className={styles.albumOrnament} aria-hidden="true">
                <span />
                <span className={styles.albumOrnamentDot} />
                <span />
              </span>
            </Reveal>
            <div className={styles.albumGrid}>
              {data.album.map((photo, index) => (
                <Reveal key={photo.src} y={16} delay={(index % 2) * 0.08} className={styles.albumTileWrap}>
                  <button
                    type="button"
                    className={styles.albumTile}
                    onClick={(event) => openAlbum(index, event.currentTarget)}
                    aria-label={`Xem ảnh ${index + 1}/${data.album.length}: ${photo.alt}`}
                  >
                    <Image
                      src={photo.src}
                      alt={photo.alt}
                      fill
                      sizes="(max-width: 480px) 50vw, 220px"
                      style={{ objectFit: "cover", objectPosition: photoObjectPosition(photo) }}
                    />
                  </button>
                </Reveal>
              ))}
            </div>
          </section>
        )}

        {/* Thank-you footer: the invitation's compact final block — one   */}
        {/* full-bleed landscape photo (Project media) with "Thank you",  */}
        {/* the couple (resolver order) and the date as HTML overlay.     */}
        {sections.closing && (
          <section className={styles.thankYou}>
            <motion.div
              className={styles.thankYouPhoto}
              initial={reducedMotion ? false : { scale: 1.02, opacity: 0.6 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: reducedMotion ? 0 : 1.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <Image
                src={data.closingPhotoUrl}
                alt={`${resolved.primary.personName} và ${resolved.secondary.personName}`}
                fill
                sizes="(max-width: 480px) 100vw, 430px"
                style={{ objectFit: "cover" }}
              />
            </motion.div>
            <span className={styles.thankYouScrim} aria-hidden="true" />
            <div className={styles.thankYouContent}>
              <Reveal y={0} delay={0.25}>
                <h2 className={styles.thankYouTitle}>Thank you</h2>
              </Reveal>
              <Reveal y={8} delay={0.4}>
                <p className={styles.thankYouNames}>
                  {resolved.primary.personName} &amp; {resolved.secondary.personName}
                </p>
                <p className={styles.thankYouDate}>{ceremony.fullDateLabel}</p>
              </Reveal>
            </div>
          </section>
        )}

      </motion.div>

      {lightbox.image && <RomanticLightbox image={lightbox.image} onClose={lightbox.close} />}

      <AnimatePresence>
        {sections.gallery && albumIndex !== null && data.album[albumIndex] && (
          <RomanticAlbumViewer
            photos={data.album}
            index={albumIndex}
            reducedMotion={reducedMotion}
            onStep={stepAlbum}
            onClose={closeAlbum}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sections.gift && giftOpen && (
          <RomanticGiftModal sides={resolved.operationalSides} reducedMotion={reducedMotion} onClose={closeGift} />
        )}
      </AnimatePresence>
    </div>
  );
}

function FamilyColumn({ side }: { side: SideDetails }) {
  return (
    <>
      <div className={styles.familyLabel}>{side.sideLabel}</div>
      <div className={styles.familyParent}>{side.fatherName}</div>
      <div className={styles.familyParent}>{side.motherName}</div>
      {side.familyLocationLabel && <div className={styles.familyLocation}>{side.familyLocationLabel}</div>}
    </>
  );
}

function RomanticLightbox({ image, onClose }: { image: LightboxImage; onClose: () => void }) {
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

const ALBUM_EASE = [0.22, 1, 0.36, 1] as const;

interface RomanticAlbumViewerProps {
  photos: AlbumPhoto[];
  index: number;
  reducedMotion: boolean;
  /** Moves by ±1, wrapping; applied to the latest index. */
  onStep: (step: number) => void;
  onClose: () => void;
}

/**
 * Full-screen album viewer: the tapped photo whole (contain) on a deep rose
 * backdrop, with previous/next (buttons, swipe, arrow keys), a counter, and
 * close (X, backdrop, Escape). The invitation behind cannot scroll while it
 * is open; the parent returns focus to the tapped photo on close.
 */
function RomanticAlbumViewer({ photos, index, reducedMotion, onStep, onClose }: RomanticAlbumViewerProps) {
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
            aria-label="Ảnh sau"
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

const RSVP_EASE = [0.22, 1, 0.36, 1] as const;

interface RomanticRsvpProps {
  /** Personalized guest name, or "" when personalization is off. */
  prefillGuestName: string;
  reducedMotion: boolean;
}

/**
 * RSVP + wishes: script-accented title over one soft blush panel — name,
 * attendance select (default "Sẽ tham dự"), wish, send. Shared RSVP form
 * behavior (CLAUDE.md §11); prototype local state only, nothing persisted.
 */
function RomanticRsvp({ prefillGuestName, reducedMotion }: RomanticRsvpProps) {
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
    <section className={styles.rsvpSection}>
      <Reveal y={12} className={styles.rsvpHeader}>
        <div className={styles.rsvpOrnament} aria-hidden="true">
          <Image src={ROMANTIC_ASSETS.divider} alt="" fill sizes="150px" style={{ objectFit: "contain" }} />
        </div>
        <h2 className={styles.rsvpTitle}>
          <span>Xác Nhận Tham Dự</span>
          <span>
            <span className={styles.rsvpTitleAmp}>&amp;</span> Gửi Lời Chúc
          </span>
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

const GIFT_EASE = [0.22, 1, 0.36, 1] as const;

interface RomanticGiftModalProps {
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
function RomanticGiftModal({ sides, reducedMotion, onClose }: RomanticGiftModalProps) {
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
    <div ref={overlayRef} className={styles.giftOverlay} role="dialog" aria-modal="true" aria-labelledby="romantic-gift-title">
      <motion.button type="button" className={styles.giftScrim} aria-label="Đóng" onClick={onClose} {...fade({}, 0.3)} />
      <motion.div className={styles.giftPanel} {...fade({ scale: 0.97, y: 12 }, 0.4)}>
        <button type="button" className={styles.giftClose} onClick={onClose} aria-label="Đóng" autoFocus>
          ✕
        </button>

        <span className={styles.giftOrnament} aria-hidden="true">
          <span />
          <span className={styles.giftOrnamentDot} />
          <span />
        </span>
        <h2 id="romantic-gift-title" className={styles.giftTitle}>
          Gửi Mừng Cưới
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
          <motion.div key={side.sideLabel} {...fade({}, 0.25)}>
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
                <dd className={styles.giftAccountNumber}>{side.gift.accountNumber}</dd>
              </div>
            </dl>

            <button
              type="button"
              className={`${styles.giftCopy} ${copiedKey === side.sideLabel ? styles.giftCopyDone : ""}`}
              onClick={() => copy(side.sideLabel, side.gift.accountNumber)}
              aria-live="polite"
            >
              {copiedKey === side.sideLabel ? "Đã sao chép" : "Sao chép"}
            </button>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
