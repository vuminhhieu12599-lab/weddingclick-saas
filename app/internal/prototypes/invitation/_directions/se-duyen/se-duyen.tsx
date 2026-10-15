"use client";

import { useEffect, useRef, useState } from "react";
import { Be_Vietnam_Pro, Prata } from "next/font/google";

import { deriveCeremonyDisplay } from "../../_shared/derive-ceremony";
import { resolveGuestLine } from "../../_shared/invitation-text";
import { resolveInvitation } from "../../_shared/resolve-variant";
import { useReducedMotion } from "../../_shared/use-reduced-motion";
import type { SectionVisibility } from "../../_shared/sections";
import type { InvitationVariant, PrototypeWeddingData } from "../../_shared/types";
import { FateEmblem, FateKnot, FrameCorner, SealRelief, ThreadCurve, ThreadDivider, ThreadVertical } from "./se-duyen-decor";
import styles from "./se-duyen.module.css";

/**
 * Se Duyên — "Thread of Fate" (SD-00 internal visual direction prototype).
 *
 * Deliberately only two parts: the lacquer-lid opening/cover and the couple
 * section. Nothing else is built, nothing is registered, and this is not a
 * production renderer: no manifest, no media slots, no catalog, no database.
 * It exists to answer one question on a real phone — does a pre-rendered-3D
 * lacquered-object direction read premium and poetic, or tacky?
 *
 * Differentiation target: Vietnamese Heritage is printed paper (ivory field,
 * 囍 medallion, doors parting). Se Duyên is a lacquered box (oxblood field,
 * gold relief, a lid lifting off) with one crimson silk thread — the tơ hồng
 * — as its through-line, and a bow-knot emblem instead of the 囍 glyph.
 *
 * Every ornament is vector/CSS mock geometry (see `se-duyen-decor.tsx`): the
 * approved pre-rendered 3D asset set does not exist yet and must never be
 * approximated by a stand-in that could be mistaken for it.
 */

// Distinctive display serif, tried per the SD-00 font brief. Prata is a
// single-weight high-contrast Didone-leaning serif — clearly not the
// Cormorant Garamond / Playfair Display pairing the shipped templates use.
// SIL Open Font License with a Vietnamese subset, self-hosted by next/font,
// so no font file is committed. Used only at display sizes, where its
// hairlines are an asset rather than a legibility risk.
const seDuyenDisplay = Prata({
  subsets: ["vietnamese"],
  weight: "400",
  display: "swap",
  variable: "--sd-display",
});

// Body/meta face: a Vietnamese-designed sans with first-class diacritics,
// which is exactly what the long uppercase labels in this direction need.
// SIL OFL, Vietnamese subset. Production would still have to run the
// §19 font-library verification before this becomes a contract.
const seDuyenSans = Be_Vietnam_Pro({
  subsets: ["vietnamese"],
  weight: ["300", "400", "500"],
  display: "swap",
  variable: "--sd-sans",
});

// Prototype demo photography: self-generated warm placeholder art, so the
// gilded frame treatment is judged against a tone near real Vietnamese
// wedding photography instead of the cool mood images the other prototypes
// share. Slots are POSITIONS, never persons (TE-01 slot rule).
const DEMO_SLOT_PHOTOS = [
  "/prototypes/invitation/demo/se-duyen/portrait-01.svg",
  "/prototypes/invitation/demo/se-duyen/portrait-02.svg",
] as const;

// Prototype wording. Editable copy in production (the couplet is template
// art direction, the salutation and guest label come from the Project).
const COVER_EYEBROW = "Thiệp Cưới";
const COVER_CAPTION = "Se Duyên";
const SEAL_HINT = "Chạm để mở thiệp";
const FATE_COUPLET = "Chỉ hồng một sợi, nên duyên trăm năm.";
const COUPLE_EYEBROW = "Se Duyên";
const COUPLE_HEADING = "Cô Dâu & Chú Rể";
const SCROLL_CUE = "Kéo xuống";

type OpeningPhase = "closed" | "opening" | "done";

// Seal press (0–300) → lid lifts off the box (240–1100) → card settled.
const OPENING_TOTAL_MS = 1180;
const OPENING_REDUCED_MS = 220;

/** Long Vietnamese names drop a type step instead of wrapping into the ornament. */
const LONG_NAME_CODE_POINTS = 14;

interface Props {
  data: PrototypeWeddingData;
  variant: InvitationVariant;
  personalization: boolean;
  guestDisplayName: string;
  /** Accepted for parity with the other directions; SD-00 builds no toggleable section. */
  sections?: SectionVisibility;
}

export function SeDuyenPrototype({ data, variant, personalization, guestDisplayName }: Props) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<OpeningPhase>("closed");
  // Prototype-only: proves the couple section holds up with one photo and
  // with two. In production this follows the slot's RESOLVED photo count.
  const [photoCount, setPhotoCount] = useState<1 | 2>(2);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const openInvitation = () => {
    if (phase !== "closed") return;
    setPhase("opening");
    timerRef.current = window.setTimeout(
      () => setPhase("done"),
      reducedMotion ? OPENING_REDUCED_MS : OPENING_TOTAL_MS,
    );
  };

  const resolved = resolveInvitation(data, variant);
  // One canonical instant, one derivation point (CLAUDE.md §7).
  const ceremony = deriveCeremonyDisplay(data.ceremonyDateTimeIso, data.timeZone);
  const guestLine = resolveGuestLine(personalization, guestDisplayName, data.invitationWording.defaultGuestLabel);

  const primaryName = resolved.primary.personName;
  const secondaryName = resolved.secondary.personName;
  const photoAlt = `Ảnh cưới của ${primaryName} và ${secondaryName}`;

  return (
    <div
      className={`${styles.root} ${seDuyenDisplay.variable} ${seDuyenSans.variable} ${
        phase === "done" ? "" : styles.rootClosed
      }`}
    >
      <section className={styles.stage}>
        <div className={`${styles.inner} ${phase === "closed" ? "" : styles.innerRevealing}`}>
          <div className={styles.innerPaper}>
            <ThreadVertical className={styles.innerThread} />
            <p className={styles.eyebrow}>{data.invitationWording.salutation}</p>
            <p className={styles.guestLine}>{guestLine}</p>
            <p className={styles.ceremonyTitle}>{resolved.ceremonyTitle}</p>

            <div className={styles.coupleNames}>
              <CoupleName name={primaryName} sideLabel={resolved.primary.sideLabel} />
              <FateKnot className={styles.namesKnot} />
              <CoupleName name={secondaryName} sideLabel={resolved.secondary.sideLabel} />
            </div>

            <ThreadDivider className={styles.divider} />

            <div className={styles.dateBlock}>
              <div className={styles.dateWeekday}>
                <span>{ceremony.weekdayLabel}</span>
              </div>
              <span className={styles.dateRule} aria-hidden="true" />
              <div>
                <div className={styles.dateDay}>{ceremony.dayLabel}</div>
                <div className={styles.dateMonthYear}>
                  Tháng {ceremony.monthLabel} · {ceremony.yearLabel}
                </div>
              </div>
              <span className={styles.dateRule} aria-hidden="true" />
              <div className={styles.dateTime}>
                <span>{ceremony.timeLabel}</span>
              </div>
            </div>

            <p className={styles.lunarLine}>Tức ngày {data.ceremonyLunarDateLabel}</p>
            <p className={styles.poeticLine}>{FATE_COUPLET}</p>

            <div className={styles.scrollCue}>
              <span>{SCROLL_CUE}</span>
              <span className={styles.scrollCueRule} aria-hidden="true" />
            </div>
          </div>
        </div>

        {phase !== "done" && (
          <div className={`${styles.cover} ${phase === "opening" ? styles.coverOpening : ""}`}>
            <div className={styles.lid} aria-hidden="true">
              <span className={styles.lidGrain} />
              <span className={styles.lidSheen} />
            </div>

            <div className={styles.coverFrame} aria-hidden="true" />
            <FrameCorner className={`${styles.coverCorner} ${styles.coverCornerTl}`} />
            <FrameCorner className={`${styles.coverCorner} ${styles.coverCornerTr}`} />
            <FrameCorner className={`${styles.coverCorner} ${styles.coverCornerBl}`} />
            <FrameCorner className={`${styles.coverCorner} ${styles.coverCornerBr}`} />

            <div className={styles.coverContent}>
              <div className={styles.coverTop}>
                <p className={styles.coverEyebrow}>{COVER_EYEBROW}</p>
                <ThreadVertical className={`${styles.coverThread} ${styles.threadDraw}`} />
              </div>

              <div className={styles.coverMiddle}>
                <div className={styles.emblemDisc}>
                  <FateEmblem className={styles.emblemRings} />
                  <FateKnot className={styles.emblemKnot} />
                </div>
                <p className={styles.coverCaption}>{COVER_CAPTION}</p>
                <p className={styles.coverNames}>
                  <span className={styles.coverNameLine}>{primaryName}</span>
                  <span className={styles.coverNamesAmp}>&amp;</span>
                  <span className={styles.coverNameLine}>{secondaryName}</span>
                </p>
                <p className={styles.coverDate}>{ceremony.fullDateLabel}</p>
              </div>

              <div className={styles.coverBottom}>
                <button type="button" className={styles.sealButton} onClick={openInvitation}>
                  <span className={styles.seal}>
                    <SealRelief className={styles.sealRelief} />
                  </span>
                  <span className={styles.sealHint}>{SEAL_HINT}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className={styles.couple}>
        <div className={styles.coupleCard}>
          <p className={styles.eyebrow}>{COUPLE_EYEBROW}</p>
          <h2 className={styles.coupleHeading}>{COUPLE_HEADING}</h2>
          <ThreadDivider className={styles.divider} />

          <div className={styles.frames}>
            {photoCount === 2 ? (
              <div className={styles.framesPair}>
                <GildedFrame className={styles.frameSlotFirst} src={DEMO_SLOT_PHOTOS[0]} alt={photoAlt} />
                <ThreadCurve className={styles.threadCurve} />
                <GildedFrame className={styles.frameSlotSecond} src={DEMO_SLOT_PHOTOS[1]} alt={photoAlt} />
              </div>
            ) : (
              <div className={styles.framesSingle}>
                <ThreadVertical className={styles.singleThread} />
                <GildedFrame className={styles.frameSlotSingle} src={DEMO_SLOT_PHOTOS[0]} alt={photoAlt} />
              </div>
            )}
          </div>

          <div className={styles.coupleNamesRow}>
            <CoupleName name={primaryName} sideLabel={resolved.primary.sideLabel} />
            <FateKnot className={styles.namesKnot} />
            <CoupleName name={secondaryName} sideLabel={resolved.secondary.sideLabel} />
          </div>

          <p className={styles.coupleCaption}>{data.loveStoryShort ?? data.loveStory}</p>
        </div>

        {/* Prototype chrome only — not part of the design under review. */}
        <div className={styles.protoControls}>
          <span className={styles.protoLabel}>Prototype · số ảnh</span>
          {([1, 2] as const).map((count) => (
            <button
              key={count}
              type="button"
              className={`${styles.protoButton} ${photoCount === count ? styles.protoButtonActive : ""}`}
              onClick={() => setPhotoCount(count)}
            >
              {count} ảnh
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function CoupleName({ name, sideLabel }: { name: string; sideLabel: string }) {
  const isLong = [...name].length > LONG_NAME_CODE_POINTS;
  return (
    <>
      <span className={styles.sideLabel}>{sideLabel}</span>
      <span className={`${styles.coupleName} ${isLong ? styles.coupleNameLong : ""}`}>{name}</span>
    </>
  );
}

/**
 * Gilded frame: a gold-leaf mat with a dark rabbet shadow and four corner
 * reliefs. The photo is a CSS background (the prototype's demo photos are
 * SVG, which `next/image` will not optimize) — same approach as the other
 * directions.
 */
function GildedFrame({ className, src, alt }: { className: string; src: string; alt: string }) {
  return (
    <figure className={`${styles.frame} ${className}`}>
      <div className={styles.frameInner}>
        <div className={styles.framePhoto} role="img" aria-label={alt} style={{ backgroundImage: `url(${src})` }} />
      </div>
      <FrameCorner className={`${styles.frameCorner} ${styles.frameCornerTl}`} />
      <FrameCorner className={`${styles.frameCorner} ${styles.frameCornerTr}`} />
      <FrameCorner className={`${styles.frameCorner} ${styles.frameCornerBl}`} />
      <FrameCorner className={`${styles.frameCorner} ${styles.frameCornerBr}`} />
    </figure>
  );
}
