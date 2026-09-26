"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Great_Vibes } from "next/font/google";
import { AnimatePresence, motion } from "framer-motion";

import { deriveCeremonyDisplay } from "../../_shared/derive-ceremony";
import { useCountdown } from "../../_shared/use-countdown";
import { useReducedMotion } from "../../_shared/use-reduced-motion";
import { useClipboard } from "../../_shared/use-clipboard";
import { useRsvpForm } from "../../_shared/use-rsvp-form";
import { useMusicControl } from "../../_shared/use-music-control";
import { resolveInvitation, resolveReceptionTitle } from "../../_shared/resolve-variant";
import { buildInvitationMessage } from "../../_shared/invitation-text";
import { RSVP_OPTIONS } from "../../_shared/rsvp-options";
import { Reveal } from "../../_shared/reveal";
import type { InvitationVariant, PrototypeWeddingData, SideDetails } from "../../_shared/types";
import type { SectionVisibility } from "../../_shared/sections";
import styles from "./green-ivory-editorial.module.css";

// Calligraphic face for the portrait-story quote and the calendar month title. Great Vibes is SIL
// Open Font License (free for web + commercial use) and ships a Vietnamese
// subset; next/font self-hosts it, so no font file is committed.
const quoteScript = Great_Vibes({
  subsets: ["vietnamese"],
  weight: "400",
  display: "swap",
  variable: "--gi-quote-script",
});

// Internal-prototype demo photography (Task 029 patch 2) — self-generated
// botanical-toned placeholder art, not stock photography, so the layout can
// be reviewed with real image content while sidestepping any third-party
// licensing question. Swap for actual project photos once the template is
// promoted past internal review.
const DEMO_PHOTO_BASE = "/prototypes/invitation/demo/";

// Layered opening envelope. Body and flap share one 1536x1024 canvas; the
// flap layer is scaled/offset in CSS so its fold line sits exactly on the
// body's top edge. The seal sits over the flap tip.
const ENVELOPE_ASSETS = {
  body: "/prototypes/invitation/decor/envelope-body.png",
  flap: "/prototypes/invitation/decor/envelope-flap.png",
  seal: "/prototypes/invitation/decor/envelope-seal.png",
} as const;

type OpeningPhase = "closed" | "opening" | "emerging" | "done";

const OPENING_TIMING = {
  // Flap has swung past vertical — it can drop behind the rising card.
  flapBehindMs: 560,
  // Card has mostly risen — the cover starts dissolving into the Hero.
  cardRiseMs: 1700,
} as const;

function photoStyle(filename: string) {
  return {
    backgroundImage: `url(${DEMO_PHOTO_BASE}${filename})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  } as const;
}

/**
 * Explicit media-role map (checkpoint V7 §18) — every photo slot this
 * template needs is named here, not produced by an auto-incrementing
 * counter. Swapping which demo photo a role uses (or adding/removing a
 * role) is a one-line change; no assumption that every template shares one
 * universal "hero + 3 photos + gallery" media shape.
 */
const MEDIA_ROLES = {
  openingReveal: "opening.svg",
  hero: "hero.svg",
  groomPortrait: "groom-portrait.svg",
  bridePortrait: "bride-portrait.svg",
  // Editorial photo cluster — exactly five slots: anchor, even pair,
  // offset pair (wide + narrow).
  editorialCluster1: "tall-portrait.svg",
  editorialCluster2: "pair-left.svg",
  editorialCluster3: "pair-right.svg",
  editorialCluster4: "tri-center.svg",
  editorialCluster5: "tri-left.svg",
  loveStoryBackground: "love-story.svg",
} as const;

// Editorial rhythm, never a rigid equal-square grid — one larger lead tile,
// a balanced pair, a tall portrait beat, then medium images repeating in a
// pleasing rhythm. Column spans stay at half (2) or full (4) width only —
// no quarter-width (1) tiles — so every tile stays comfortably viewable at
// 360/390/430px (Task 029 patch 2 review feedback: prior quarter-width
// tiles were too small to appreciate on mobile). One continuous flow, 10
// photos total, no inserted quote/text interruption (checkpoint V10 §C).
const GALLERY_LAYOUT: Array<{ col: number; row: number; photo: string }> = [
  { col: 4, row: 7, photo: "gallery-01.svg" },
  { col: 2, row: 5, photo: "gallery-02.svg" },
  { col: 2, row: 5, photo: "gallery-03.svg" },
  { col: 2, row: 8, photo: "gallery-04.svg" },
  { col: 2, row: 4, photo: "gallery-05.svg" },
  { col: 2, row: 4, photo: "gallery-06.svg" },
  { col: 4, row: 4, photo: "gallery-07.svg" },
  { col: 2, row: 6, photo: "gallery-08.svg" },
  { col: 2, row: 6, photo: "gallery-09.svg" },
  { col: 4, row: 5, photo: "gallery-10.svg" },
];

// Vietnamese weekday header, Sunday-first to match JS Date.getDay() order.
const CALENDAR_WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/**
 * Calendar-grid cell math derived from the canonical ceremony instant — the
 * weekday-of-first and days-in-month are computed, never hard-coded
 * (CLAUDE.md §7). Only used to lay out the decorative calendar card below.
 */
function buildCalendarGrid(isoDateTime: string, timeZone: string) {
  const date = new Date(isoDateTime);
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone,
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return { day, cells };
}

interface Props {
  data: PrototypeWeddingData;
  variant: InvitationVariant;
  personalization: boolean;
  guestDisplayName: string;
  sections: SectionVisibility;
}

export function GreenIvoryEditorialPrototype({
  data,
  variant,
  personalization,
  guestDisplayName,
  sections,
}: Props) {
  // Opening sequence: closed -> opening (seal lifts away, flap swings up on
  // its hinge) -> emerging (flap is behind; portrait card rises out of the
  // envelope) -> done (cover dissolves into the Hero).
  const [openingPhase, setOpeningPhase] = useState<OpeningPhase>("closed");
  const opened = openingPhase === "done";
  const [giftOpen, setGiftOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  // Only a personalized link may pre-fill the guest name; the generic
  // (non-personalized) invitation starts with an empty field.
  const rsvpPrefill = personalization ? guestDisplayName.trim() : "";
  const music = useMusicControl();

  const resolved = resolveInvitation(data, variant);
  const ceremony = deriveCeremonyDisplay(data.ceremonyDateTimeIso, data.timeZone);
  const countdown = useCountdown(data.ceremonyDateTimeIso);
  const message = buildInvitationMessage(
    data.invitationWording.template,
    resolved.ceremonyTitle,
    personalization,
    guestDisplayName
  );
  const multiSide = resolved.operationalSides.length > 1;

  // Timed hand-offs between opening phases. Reduced motion skips straight
  // to the invitation with no choreography.
  useEffect(() => {
    if (openingPhase === "opening") {
      const t = window.setTimeout(() => setOpeningPhase("emerging"), OPENING_TIMING.flapBehindMs);
      return () => window.clearTimeout(t);
    }
    if (openingPhase === "emerging") {
      const t = window.setTimeout(() => setOpeningPhase("done"), OPENING_TIMING.cardRiseMs);
      return () => window.clearTimeout(t);
    }
  }, [openingPhase]);

  const startOpening = () => {
    if (openingPhase !== "closed") return;
    setOpeningPhase(reducedMotion ? "done" : "opening");
  };

  const envelopeOpening = openingPhase !== "closed";
  const flapTransition = { duration: 0.85, ease: [0.45, 0, 0.2, 1] as const };
  const sealTransition = { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const };
  const cardTransition = {
    y: { duration: 1.2, ease: [0.22, 1, 0.36, 1] as const },
    opacity: { duration: 0.35, ease: "easeOut" as const },
  };
  const coverExitTransition = { duration: reducedMotion ? 0 : 0.6, ease: [0.4, 0, 0.2, 1] as const };

  // Groom is primary (left/first) for COMMON and GROOM, bride is primary for
  // BRIDE — the same centralized priority every section on the page follows.
  const primaryStoryLabel = variant === "BRIDE" ? "Cô Dâu" : "Chú Rể";
  const secondaryStoryLabel = variant === "BRIDE" ? "Chú Rể" : "Cô Dâu";
  const primaryStoryPhoto = variant === "BRIDE" ? MEDIA_ROLES.bridePortrait : MEDIA_ROLES.groomPortrait;
  const secondaryStoryPhoto = variant === "BRIDE" ? MEDIA_ROLES.groomPortrait : MEDIA_ROLES.bridePortrait;

  // Countdown now renders in its own standalone section, after Timeline
  // (Task 029 patch 2 reorder) — no longer part of the logistics gate below.
  const showLogistics = sections.ceremony || sections.receptionTime || sections.venue || sections.directions;
  const showPhotoStory = sections.threePhoto;

  return (
    <div className={styles.root}>
      {opened && (
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
      )}

      {/* Opening — layered envelope from real PNG assets: body (base),    */}
      {/* flap (hinged at its top edge), wax seal over the flap tip. On tap */}
      {/* the seal lifts away, the flap swings up behind, a portrait card   */}
      {/* rises out of the pocket, then the cover dissolves into the Hero.  */}
      <AnimatePresence>
        {!opened && (
          <motion.div
            className={styles.cover}
            exit={{ opacity: 0, scale: reducedMotion ? 1 : 1.03 }}
            transition={coverExitTransition}
          >
            <div className={styles.coverOuterFrame} />

            <motion.div
              className={styles.coverEntrance}
              initial={reducedMotion ? false : "hidden"}
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.14, delayChildren: 0.1 } },
              }}
            >
              <motion.span
                className={styles.coverLabel}
                variants={{ hidden: { opacity: 0, y: -6 }, visible: { opacity: 1, y: 0 } }}
                animate={envelopeOpening ? { opacity: 0 } : undefined}
              >
                Thiệp Mời Cưới
              </motion.span>

              {/* Reading order: title -> names -> date -> envelope -> hint. */}
              <motion.div
                className={styles.coverMeta}
                variants={{ hidden: { opacity: 0, y: -4 }, visible: { opacity: 1, y: 0 } }}
                animate={envelopeOpening ? { opacity: 0 } : undefined}
              >
                <span className={styles.envelopeNames}>
                  {resolved.primary.personName} &amp; {resolved.secondary.personName}
                </span>
                <span className={styles.envelopeDate}>{ceremony.fullDateLabel}</span>
              </motion.div>

              <motion.div
                className={styles.envelopeFloat}
                variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
              >
                <button
                  type="button"
                  className={`${styles.envelope} ${envelopeOpening ? styles.envelopeOpening : ""}`}
                  aria-label="Mở thiệp mời"
                  onClick={startOpening}
                  disabled={envelopeOpening}
                >
                  {/* Portrait insert card — behind the body and clipped at */}
                  {/* the envelope's bottom edge, so it is only ever seen   */}
                  {/* above the pocket opening. It stops with its lower     */}
                  {/* quarter still tucked inside the envelope.             */}
                  <span className={styles.envelopeCardClip}>
                    <motion.span
                      className={styles.envelopeCard}
                      initial={false}
                      animate={
                        openingPhase === "emerging" ? { y: "-77.5%", opacity: 1 } : { y: "0%", opacity: 0 }
                      }
                      transition={cardTransition}
                    >
                      <span className={styles.envelopeCardPhoto} style={photoStyle(MEDIA_ROLES.openingReveal)} />
                    </motion.span>
                  </span>

                  <span className={styles.envelopeLayer} style={{ zIndex: 2 }}>
                    <Image src={ENVELOPE_ASSETS.body} alt="" fill sizes="320px" preload />
                  </span>

                  {/* Flap sits above the body until it passes vertical,  */}
                  {/* then drops behind the rising card.                  */}
                  <motion.span
                    className={styles.envelopeFlap}
                    style={{ zIndex: openingPhase === "emerging" ? 0 : 3 }}
                    initial={false}
                    animate={{ rotateX: envelopeOpening ? -180 : 0 }}
                    transition={flapTransition}
                  >
                    <Image src={ENVELOPE_ASSETS.flap} alt="" fill sizes="320px" preload />
                  </motion.span>

                  <motion.span
                    className={styles.envelopeSeal}
                    initial={false}
                    animate={envelopeOpening ? { opacity: 0, scale: 1.18 } : { opacity: 1, scale: 1 }}
                    transition={sealTransition}
                  >
                    <Image src={ENVELOPE_ASSETS.seal} alt="" fill sizes="80px" preload />
                    <span className={styles.envelopeSealMark} aria-hidden="true">
                      囍
                    </span>
                  </motion.span>
                </button>
              </motion.div>

              <motion.span
                className={styles.coverHint}
                variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
                animate={envelopeOpening ? { opacity: 0 } : undefined}
              >
                Chạm vào thiệp để mở
              </motion.span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: opened ? 1 : 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.6, delay: reducedMotion ? 0 : 0.1 }}
      >
        {/* Hero — one dominant photo, text integrated over it (never a      */}
        {/* separate card below). */}
        <div className={styles.heroZone}>
          <div className={styles.heroPhoto} style={photoStyle(MEDIA_ROLES.hero)} />
          <div className={styles.heroScrim} />
          <div className={styles.heroContent}>
            <span className={styles.heroKicker}>Save the date</span>
            <div className={styles.heroNames}>
              {resolved.primary.personName}
              <span className={styles.heroAmp}>&amp;</span>
              {resolved.secondary.personName}
            </div>
            <span className={styles.heroDate}>{ceremony.fullDateLabel} · Đà Nẵng</span>
          </div>
        </div>

        {/* Groom/Bride portrait story — alternating asymmetric editorial   */}
        {/* blocks, never two identical cards. Sequence: two-line quote ->   */}
        {/* primary portrait -> real floral-strip PNG -> secondary portrait. */}
        {sections.portraitStory && (
          <section className={styles.sectionPortraitStory}>
            <Reveal y={0}>
              <p className={`${quoteScript.variable} ${styles.portraitQuote}`}>
                <span>Hôn nhân là chuyện cả đời.</span>
                <span>Yêu người vừa ý, cưới người mình thương.</span>
              </p>
            </Reveal>
            <Reveal delay={0.04}>
              <PortraitStoryBlock
                label={primaryStoryLabel}
                name={resolved.primary.personName}
                photo={primaryStoryPhoto}
                align="left"
              />
            </Reveal>
            <Reveal delay={0.06} y={0}>
              <div className={styles.portraitDivider} aria-hidden="true">
                <Image
                  src="/prototypes/invitation/decor/portrait-divider-floral-strip.png"
                  alt=""
                  fill
                  sizes="(max-width: 430px) 88vw, 380px"
                  style={{ objectFit: "contain" }}
                />
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <PortraitStoryBlock
                label={secondaryStoryLabel}
                name={resolved.secondary.personName}
                photo={secondaryStoryPhoto}
                align="right"
              />
            </Reveal>
          </section>
        )}

        {sections.mainText && (
          <section className={styles.sectionMessage}>
            <Reveal>
              <p className={styles.message}>{message}</p>
            </Reveal>
          </section>
        )}

        {/* Family — ceremonial two-column presentation on ivory paper      */}
        {/* texture, ordered by variant priority (CLAUDE.md §5). */}
        {sections.family && (
          <section className={styles.sectionFamily}>
            <Reveal>
              <div className={styles.familyOrnament}>
                <span className={styles.familyOrnamentLine} />
                <span className={styles.familyOrnamentMark} aria-hidden="true">
                  ❧
                </span>
                <span className={styles.familyOrnamentLine} />
              </div>
            </Reveal>
            <div className={styles.familyColumns}>
              <Reveal delay={0.05}>
                <FamilyColumn side={resolved.primary} />
              </Reveal>
              <span className={styles.familyDivider} />
              <Reveal delay={0.12}>
                <FamilyColumn side={resolved.secondary} />
              </Reveal>
            </div>
          </section>
        )}

        {showLogistics && (
          <section className={styles.sectionCeremony}>
            {sections.ceremony && (
              <Reveal>
                <div className={styles.ceremonyCard}>
                  <span className={styles.ceremonyLabel}>{resolved.ceremonyTitle}</span>
                  <div className={styles.dateComposition}>
                    <span className={styles.dateDay}>{ceremony.dayLabel}</span>
                    <div className={styles.dateMonthYear}>
                      <span>Tháng {ceremony.monthLabel}</span>
                      <span>{ceremony.yearLabel}</span>
                    </div>
                  </div>
                  <div className={styles.lunarLine}>Tức ngày {data.ceremonyLunarDateLabel}</div>
                  <div className={styles.ceremonyMeta}>
                    {ceremony.weekdayLabel.toUpperCase()} · {ceremony.timeLabel}
                  </div>
                </div>
              </Reveal>
            )}

            {sections.ceremony && (
              <Reveal delay={0.08} y={0}>
                <CalendarCard
                  isoDateTime={data.ceremonyDateTimeIso}
                  timeZone={data.timeZone}
                  monthLabel={ceremony.monthLabel}
                />
              </Reveal>
            )}

            {/* One clearly separated event card per operational side       */}
            {/* (checkpoint V9 §5) — COMMON shows both, GROOM/BRIDE one.     */}
            {(sections.receptionTime || sections.venue || sections.directions) && (
              <div className={styles.eventCardStack}>
                {resolved.operationalSides.map((side, index) => {
                  const receptionDisplay = deriveCeremonyDisplay(side.receptionDateTimeIso, data.timeZone);
                  // The only lunar label in the data belongs to the ceremony
                  // date, so it is shown only when this reception falls on
                  // that same calendar day — never on a different date.
                  const showLunar = receptionDisplay.fullDateLabel === ceremony.fullDateLabel;
                  return (
                    <Reveal key={side.sideLabel} delay={index * 0.08}>
                      <div className={styles.eventCard}>
                        {multiSide && <span className={styles.eventCardTag}>{side.sideLabel}</span>}
                        <div className={styles.eventCardHeading}>{resolveReceptionTitle(data, side)}</div>

                        {sections.receptionTime && (
                          <div className={styles.eventCardWhen}>
                            <div className={styles.eventCardTime}>
                              {receptionDisplay.timeLabel} - {receptionDisplay.weekdayLabel}
                            </div>
                            <div className={styles.eventCardDate}>{receptionDisplay.fullDateLabel}</div>
                            {showLunar && (
                              <div className={styles.eventCardLunar}>(Tức ngày {data.ceremonyLunarDateLabel})</div>
                            )}
                          </div>
                        )}

                        {sections.venue && (
                          <div className={styles.eventCardVenue}>
                            <div className={styles.eventCardVenueName}>{side.venueName}</div>
                            <div className={styles.eventCardVenueAddress}>{side.venueAddress}</div>
                          </div>
                        )}

                        {sections.directions && (
                          <a
                            className={styles.directionsButton}
                            href={side.mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Xem chỉ đường
                          </a>
                        )}
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            )}

            {/* Decorative pause — a small ornament beat before the next    */}
            {/* content section, never large or distracting. */}
            <div className={styles.ornamentPause} aria-hidden="true">
              <span className={styles.ornamentGlyph}>✦</span>
            </div>
          </section>
        )}

        {sections.timeline && (
          <section className={styles.sectionTimeline}>
            <Reveal>
              <div className={styles.timelineList}>
                {data.timeline.map((item) => {
                  const display = deriveCeremonyDisplay(item.dateTimeIso, data.timeZone);
                  return (
                    <div key={item.label} className={styles.timelineRow}>
                      <span className={styles.timelineTime}>{display.timeLabel}</span>
                      <span className={styles.timelineDot} />
                      <span className={styles.timelineLabel}>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </Reveal>
          </section>
        )}

        {/* Countdown — now its own standalone section, after Timeline       */}
        {/* (Task 029 patch 2 reorder: Timeline before Countdown). The        */}
        {/* calendar/ceremony/event-card content above is unchanged. */}
        {sections.countdown && !countdown.hasPassed && (
          <>
            <div className={`${styles.ornamentPause} ${styles.ornamentPauseTight}`} aria-hidden="true">
              <span className={styles.ornamentGlyph}>✦</span>
            </div>
            <section className={styles.sectionCountdown}>
              <Reveal>
                <div className={styles.sectionKicker}>Đếm ngược</div>
                <div className={styles.countdownRow}>
                  <div className={styles.countdownCell}>
                    <span className={styles.countdownValue}>{countdown.days}</span>
                    <span className={styles.countdownLabel}>Ngày</span>
                  </div>
                  <div className={styles.countdownCell}>
                    <span className={styles.countdownValue}>{countdown.hours}</span>
                    <span className={styles.countdownLabel}>Giờ</span>
                  </div>
                  <div className={styles.countdownCell}>
                    <span className={styles.countdownValue}>{countdown.minutes}</span>
                    <span className={styles.countdownLabel}>Phút</span>
                  </div>
                  <div className={styles.countdownCell}>
                    <span className={styles.countdownValue}>{countdown.seconds}</span>
                    <span className={styles.countdownLabel}>Giây</span>
                  </div>
                </div>
              </Reveal>
            </section>
          </>
        )}

        {/* Photo story — five-photo editorial cluster: one anchor image,  */}
        {/* an even pair, then a wide + narrow offset pair. Each photo      */}
        {/* reveals in turn (shared Reveal handles reduced motion).         */}
        {showPhotoStory && (
          <section className={styles.sectionPhotoStory}>
            <div className={styles.clusterGrid}>
              <Reveal y={14} className={styles.clusterAnchor}>
                <div className={styles.clusterPhoto} style={photoStyle(MEDIA_ROLES.editorialCluster1)} />
              </Reveal>
              <Reveal y={14} delay={0.08} className={styles.clusterPairItem}>
                <div className={styles.clusterPhoto} style={photoStyle(MEDIA_ROLES.editorialCluster2)} />
              </Reveal>
              <Reveal y={14} delay={0.16} className={styles.clusterPairItem}>
                <div className={styles.clusterPhoto} style={photoStyle(MEDIA_ROLES.editorialCluster3)} />
              </Reveal>
              <div className={styles.clusterOffsetRow}>
                <Reveal y={14} delay={0.08} className={styles.clusterOffsetWide}>
                  <div className={styles.clusterPhoto} style={photoStyle(MEDIA_ROLES.editorialCluster4)} />
                </Reveal>
                <Reveal y={14} delay={0.16} className={styles.clusterOffsetNarrow}>
                  <div className={styles.clusterPhoto} style={photoStyle(MEDIA_ROLES.editorialCluster5)} />
                </Reveal>
              </div>
            </div>
          </section>
        )}

        {/* Love story — full-bleed photo, floating quote card overlapping  */}
        {/* its lower edge (text-over-image). */}
        {sections.loveStory && (
          <section className={styles.sectionStory}>
            <div className={styles.storyPhoto} style={photoStyle(MEDIA_ROLES.loveStoryBackground)} />
            <div className={styles.storyScrim} />
            <Reveal className={styles.storyCardWrap}>
              <div className={styles.storyCard}>
                <span className={styles.storyQuoteMark}>&ldquo;</span>
                <p className={styles.storyText}>{data.loveStory}</p>
              </div>
            </Reveal>
          </section>
        )}

        {(sections.rsvp || sections.gift) && (
          <section className={styles.sectionDetails}>
            {sections.rsvp && (
              <Reveal>
                {/* Keyed by the prefill so switching the previewed guest (or turning
                    personalization on/off) starts a fresh RSVP state instead of
                    keeping a stale name from the previous guest. */}
                <EditorialRsvp key={rsvpPrefill} prefillGuestName={rsvpPrefill} />
              </Reveal>
            )}

            {sections.gift && (
              <Reveal delay={0.08} className={styles.giftBlock}>
                <p className={styles.giftNote}>{data.giftIntroNote}</p>
                <button type="button" className={styles.giftButton} onClick={() => setGiftOpen(true)}>
                  Gửi quà cưới
                </button>
              </Reveal>
            )}
          </section>
        )}

        {sections.dressCode && (
          <section className={styles.sectionDressCode}>
            <Reveal>
              <div className={styles.sectionKicker}>Dress code</div>
              <p className={styles.dressCodeText}>{data.dressCode.description}</p>
              <div className={styles.dressCodeSwatches}>
                {data.dressCode.palette.map((color) => (
                  <span key={color} className={styles.dressCodeSwatch} style={{ background: color }} />
                ))}
              </div>
            </Reveal>
          </section>
        )}

        {sections.gallery && (
          <section className={styles.sectionGallery}>
            <Reveal>
              <div className={styles.sectionKicker}>Album ảnh cưới</div>
            </Reveal>
            <div className={styles.galleryGrid}>
              {GALLERY_LAYOUT.map((item, index) => (
                <div
                  key={index}
                  className={styles.galleryItem}
                  style={{
                    gridColumn: `span ${item.col}`,
                    gridRow: `span ${item.row}`,
                    ...photoStyle(item.photo),
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {sections.closing && (
          <section className={styles.sectionClosing}>
            <Reveal y={0}>
              <span className={styles.closingOrnament}>❧</span>
              <p className={styles.closingLine}>{data.closingMessage}</p>
              <div className={styles.closingNames}>
                {resolved.primary.personName} &amp; {resolved.secondary.personName}
              </div>
              <span className={styles.closingDate}>{ceremony.fullDateLabel}</span>
            </Reveal>
          </section>
        )}

      </motion.div>

      {sections.gift && giftOpen && (
        <GiftModal sides={resolved.operationalSides} multiSide={multiSide} onClose={() => setGiftOpen(false)} />
      )}
    </div>
  );
}

function EditorialRsvp({ prefillGuestName }: { prefillGuestName: string }) {
  // Dropdown default (checkpoint V9 §6) — "Sẽ tham dự" pre-selected rather
  // than starting unset, matching a native select's natural affordance.
  const rsvpForm = useRsvpForm(prefillGuestName, "attending");

  return (
    <div className={styles.rsvpCard}>
      <h3 className={styles.rsvpHeading}>
        <span className={styles.rsvpHeadingLine}>Xác nhận tham dự</span>
        <span className={styles.rsvpHeadingLine}>
          <span className={styles.rsvpHeadingAmp}>&amp;</span>
          Gửi lời chúc
        </span>
      </h3>

      {rsvpForm.submission ? (
        <div className={styles.rsvpConfirm}>
          <p className={styles.rsvpFeedback}>
            Cảm ơn {rsvpForm.submission.guestName} đã phản hồi
            {rsvpForm.submission.choice === "attending" ? " — rất mong được đón tiếp!" : "!"}
          </p>
          {rsvpForm.submission.message && (
            <p className={styles.rsvpMessageRecap}>&ldquo;{rsvpForm.submission.message}&rdquo;</p>
          )}
          <button type="button" className={styles.rsvpEditButton} onClick={rsvpForm.editAgain}>
            Sửa lại
          </button>
        </div>
      ) : (
        <form className={styles.rsvpForm} onSubmit={rsvpForm.submit}>
          <input
            type="text"
            className={styles.rsvpNameInput}
            value={rsvpForm.guestName}
            onChange={(e) => rsvpForm.setGuestName(e.target.value)}
            placeholder="Nhập tên của bạn"
            required
          />
          <label className={styles.rsvpSelectLabel}>
            Bạn có thể tham dự không?
            <select
              className={styles.rsvpSelect}
              value={rsvpForm.choice ?? "attending"}
              onChange={(e) => rsvpForm.setChoice(e.target.value as (typeof RSVP_OPTIONS)[number]["id"])}
            >
              {RSVP_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <textarea
            className={styles.rsvpMessageInput}
            value={rsvpForm.message}
            onChange={(e) => rsvpForm.setMessage(e.target.value)}
            placeholder="Gửi lời chúc đến cô dâu & chú rể…"
            rows={3}
          />
          <button type="submit" className={styles.rsvpSubmitButton} disabled={!rsvpForm.canSubmit}>
            Gửi lời chúc
          </button>
        </form>
      )}
    </div>
  );
}

function PortraitStoryBlock({
  label,
  name,
  photo,
  align,
}: {
  label: string;
  name: string;
  photo: string;
  align: "left" | "right";
}) {
  return (
    <div className={`${styles.portraitBlock} ${align === "right" ? styles.portraitBlockRight : ""}`}>
      <div className={styles.portraitPhoto} style={photoStyle(photo)} />
      <div className={styles.portraitTextPlate}>
        <span className={styles.portraitLabel}>{label}</span>
        <span className={styles.portraitName}>{name}</span>
      </div>
    </div>
  );
}

/**
 * Decorative calendar card (checkpoint V11) — rounded moss card with a
 * corner bouquet pair, an intro line, a script-styled month title, and the
 * wedding day highlighted by a soft pulsing heart sitting BEHIND its still-
 * legible white day number. Grid cells are computed via buildCalendarGrid()
 * from the actual configured ceremony date, never a hard-coded day.
 * Deliberately no top-center hanging ornament — only the two corner
 * bouquets, per explicit product direction.
 */
function CalendarCard({
  isoDateTime,
  timeZone,
  monthLabel,
}: {
  isoDateTime: string;
  timeZone: string;
  monthLabel: string;
}) {
  const { day, cells } = buildCalendarGrid(isoDateTime, timeZone);

  return (
    <div className={styles.calendarCard}>
      <div className={`${styles.calendarFlower} ${styles.calendarFlowerTopLeft}`}>
        <Image
          src="/prototypes/invitation/decor/calendar-flower-top-left.png"
          alt=""
          aria-hidden="true"
          fill
          sizes="150px"
          style={{ objectFit: "contain" }}
        />
      </div>
      <div className={`${styles.calendarFlower} ${styles.calendarFlowerBottomRight}`}>
        <Image
          src="/prototypes/invitation/decor/calendar-flower-bottom-right.png"
          alt=""
          aria-hidden="true"
          fill
          sizes="150px"
          style={{ objectFit: "contain" }}
        />
      </div>

      <div className={styles.calendarIntro}>
        <span>Đám cưới của chúng mình</span>
        <span>Sẽ diễn ra vào</span>
      </div>

      <span className={`${quoteScript.variable} ${styles.calendarMonthLabel}`}>Tháng {monthLabel}</span>

      <div className={styles.calendarWeekRow}>
        {CALENDAR_WEEKDAYS.map((w) => (
          <span key={w} className={styles.calendarWeekday}>
            {w}
          </span>
        ))}
      </div>
      <div className={styles.calendarGrid}>
        {cells.map((d, index) => (
          <span key={index} className={styles.calendarCell}>
            {d === day ? (
              <span className={styles.calendarHeartCell} aria-label={`Ngày ${d}`}>
                <span className={styles.calendarHeartShape} aria-hidden="true">
                  ♥
                </span>
                <span className={styles.calendarHeartDay}>{d}</span>
              </span>
            ) : (
              d
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function FamilyColumn({ side }: { side: SideDetails }) {
  return (
    <div className={styles.familyColumn}>
      <div className={styles.familySideLabel}>{side.sideLabel}</div>
      <div className={styles.familyParentRow}>{side.fatherName}</div>
      <div className={styles.familyParentRow}>{side.motherName}</div>
    </div>
  );
}

function GiftModal({
  sides,
  multiSide,
  onClose,
}: {
  sides: SideDetails[];
  multiSide: boolean;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const { copiedKey, copy } = useClipboard();
  const side = sides[activeIndex] ?? sides[0];

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Gửi quà cưới">
      <button type="button" className={styles.modalScrim} aria-label="Đóng" onClick={onClose} />
      <div className={styles.modalPanel}>
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Đóng">
          ✕
        </button>

        {multiSide && (
          <div className={styles.modalTabs}>
            {sides.map((s, index) => (
              <button
                key={s.sideLabel}
                type="button"
                className={`${styles.modalTab} ${index === activeIndex ? styles.modalTabActive : ""}`}
                onClick={() => setActiveIndex(index)}
              >
                {s.sideLabel}
              </button>
            ))}
          </div>
        )}

        <div className={styles.modalQr} aria-hidden="true" />

        <div className={styles.modalRow}>
          <span className={styles.modalRowLabel}>Ngân hàng</span>
          <span className={styles.modalRowValue}>{side.gift.bankName}</span>
        </div>
        <div className={styles.modalRow}>
          <span className={styles.modalRowLabel}>Chủ tài khoản</span>
          <span className={styles.modalRowValue}>{side.gift.accountHolder}</span>
        </div>
        <div className={styles.modalRow}>
          <span className={styles.modalRowLabel}>Số tài khoản</span>
          <span className={styles.modalRowValue}>{side.gift.accountNumber}</span>
          <button
            type="button"
            className={styles.modalCopyButton}
            onClick={() => copy(side.sideLabel, side.gift.accountNumber)}
          >
            {copiedKey === side.sideLabel ? "Đã sao chép" : "Sao chép"}
          </button>
        </div>
      </div>
    </div>
  );
}
