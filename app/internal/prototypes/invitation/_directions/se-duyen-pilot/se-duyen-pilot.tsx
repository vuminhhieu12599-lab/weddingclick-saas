"use client";

import { useEffect, useRef, useState } from "react";
import { Be_Vietnam_Pro, Cormorant_Garamond } from "next/font/google";

import { deriveCeremonyDisplay } from "../../_shared/derive-ceremony";
import { resolveGuestLine } from "../../_shared/invitation-text";
import { Reveal } from "../../_shared/reveal";
import { resolveInvitation } from "../../_shared/resolve-variant";
import { useReducedMotion } from "../../_shared/use-reduced-motion";
import { DEFAULT_SECTION_VISIBILITY } from "../../_shared/sections";
import type { SectionVisibility } from "../../_shared/sections";
import type { InvitationVariant, PrototypeWeddingData } from "../../_shared/types";
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
  /** Only `mainText` and `portraitStory` exist in this pilot so far. */
  sections?: SectionVisibility;
}

export function SeDuyenPilotPrototype({
  data,
  variant,
  personalization,
  guestDisplayName,
  sections = DEFAULT_SECTION_VISIBILITY,
}: Props) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("closed");
  const timerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
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

  const primaryName = resolved.primary.personName;
  const secondaryName = resolved.secondary.personName;
  const photoAlt = `Ảnh cưới của ${primaryName} và ${secondaryName}`;

  // Same local derivation the Green Ivory direction uses: the resolver owns
  // WHO is primary, the template only labels them (CLAUDE.md §5).
  const primaryRole = variant === "BRIDE" ? BRIDE_ROLE : GROOM_ROLE;
  const secondaryRole = variant === "BRIDE" ? GROOM_ROLE : BRIDE_ROLE;

  const guestLine = resolveGuestLine(
    personalization,
    guestDisplayName,
    data.invitationWording.defaultGuestLabel,
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
                  <span className={styles.photoCard} role="img" aria-label={photoAlt} />
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

                  <p className={styles.inviteGuest}>{guestLine}</p>

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

              <Reveal y={0} delay={0.08}>
                <div className={styles.coupleFrames}>
                  <div
                    className={styles.couplePhotoMain}
                    role="img"
                    aria-label={photoAlt}
                  />
                  <div
                    className={styles.couplePhotoAside}
                    role="img"
                    aria-label={photoAlt}
                  />
                </div>
              </Reveal>

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
        </div>
      )}
    </div>
  );
}
