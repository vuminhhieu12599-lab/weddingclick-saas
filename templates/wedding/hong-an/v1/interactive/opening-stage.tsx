"use client";

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { HONG_AN_V1_COPY } from "../copy";
import styles from "../hong-an-v1.module.css";
import { LAYER_SRC, OPENING_CSS_VARS } from "./opening-geometry";

const COPY = HONG_AN_V1_COPY;

/**
 * Hồng Ân v1 opening — the Product-Owner-approved V4 cathedral doors with
 * the HA-OPEN-03 eyebrow (frozen; HA-TEMPLATE-01 integrates it unchanged).
 *
 * Three beats on one screen, exactly as approved:
 *   closed   the full-bleed cathedral, live text on its quiet panel
 *   opening  both leaves swing out on their hinges, warm light in the seam
 *   open     the stonework dissolves off the photograph behind it
 *
 * The photograph sits at the BACK of the stack from the first frame, so the
 * doors reveal it by uncovering it. That is why the hero is seamless and
 * why there is no second copy of the picture and no arch-shaped mask.
 *
 * THERE IS ONLY ONE HERO. This stage's open state IS section 02: it is the
 * first screen of the scrolling invitation, not an overlay that hands over
 * to a second hero below it, so the opening never replays and the couple is
 * never introduced twice. The interior is the stage's sibling in normal
 * document flow; while the doors are shut the page cannot be scrolled past
 * them and the interior is `inert`, so nothing below is reachable early.
 *
 * The photograph is Project media. It arrives already RESOLVED from the
 * template's own `openingPhoto` slot — never a prototype image, never a
 * demo file, never another slot's photograph. With no photograph assigned
 * the doors still open, onto the template's own warm light rather than a
 * substitute picture.
 *
 * No audio is started here and nothing autoplays; music is the guest's own
 * explicit choice through its control.
 */

/** Where the sequence is. `opening` covers the swing; `open` is the hero. */
type Phase = "closed" | "opening" | "open";

/**
 * Must outlast the leaves: 1250ms of swing plus a little settle before the
 * stonework dissolves. It lives here rather than in the stylesheet because
 * the component is what decides when the invitation may take focus.
 */
const TRAVEL_MS = 1300;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const readReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;

/** On the server nothing is known about the reader; assume full motion. */
const readReducedMotionOnServer = () => false;

export interface OpeningStageProps {
  readonly brand: string;
  readonly eyebrow: string;
  readonly primaryName: string;
  readonly secondaryName: string;
  /** `DD · MM · YYYY`, derived upstream from the one canonical instant. */
  readonly dateLine: string;
  /** ISO form of that same instant, for `<time dateTime>`. */
  readonly dateTime: string;
  readonly verse: string;
  readonly verseReference: string;
  /** The Project's own opening photograph, or `undefined` when none is assigned. */
  readonly photo: ResolvedMedia | undefined;
  readonly photoAlt: string;
  /** Floated above the stage once it opens (the music control). */
  readonly floatingControl?: ReactNode;
  /** The scrolling invitation: sections 03–14. */
  readonly children: ReactNode;
}

export function OpeningStage({
  brand,
  eyebrow,
  primaryName,
  secondaryName,
  dateLine,
  dateTime,
  verse,
  verseReference,
  photo,
  photoAlt,
  floatingControl,
  children,
}: OpeningStageProps) {
  const [phase, setPhase] = useState<Phase>("closed");
  const heroRef = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotion,
    readReducedMotionOnServer,
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const open = useCallback(() => {
    if (phase !== "closed") return;
    if (timer.current) clearTimeout(timer.current);

    // Reduced motion: skip the swing and show the invitation. No travel,
    // and no interval to sit through.
    if (reduced) {
      setPhase("open");
      return;
    }

    setPhase("opening");
    timer.current = setTimeout(() => setPhase("open"), TRAVEL_MS);
  }, [phase, reduced]);

  // Once the invitation has arrived, send the reader to it rather than
  // leaving focus on a button that is no longer there.
  useEffect(() => {
    if (phase === "open") heroRef.current?.focus({ preventScroll: true });
  }, [phase]);

  return (
    <div className={styles.shell} data-phase={phase} data-motion={reduced ? "reduced" : "full"}>
      <div className={styles.stage} style={OPENING_CSS_VARS as CSSProperties}>
        {/*
          The photograph is the one thing on this screen that is not
          decoration, so it is the only layer with alternative text. With no
          photograph assigned the slot is simply absent and the warm ivory
          behind the doors stands in — never a substitute picture.
        */}
        {photo === undefined ? (
          <div className={styles.photoAbsent} aria-hidden="true" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- opaque runtime MediaResolver URL, not a build-known asset
          <img
            className={styles.photo}
            src={photo.url}
            alt={photoAlt}
            width={photo.width ?? undefined}
            height={photo.height ?? undefined}
            decoding="async"
            draggable={false}
          />
        )}
        <div className={styles.photoVeil} aria-hidden="true" />

        {/*
          The facade. Every layer shares one 1440×3120 registration, so the
          scene box keeps that ratio and is sized to COVER the stage; the
          hinge percentages then land on the same pixels at every width,
          which they would not if each image were covered on its own.
        */}
        <div className={styles.scene} aria-hidden="true">
          {/* eslint-disable @next/next/no-img-element -- the approved artwork, served as-is so the optimizer cannot re-encode its alpha */}
          <img className={`${styles.layer} ${styles.reveal}`} src={LAYER_SRC.reveal} alt="" draggable={false} />
          <div className={styles.light} />
          <img className={`${styles.layer} ${styles.frame}`} src={LAYER_SRC.frame} alt="" draggable={false} />
          <img
            className={`${styles.layer} ${styles.leaf} ${styles.leafLeft}`}
            src={LAYER_SRC.leafLeft}
            alt=""
            draggable={false}
          />
          <img
            className={`${styles.layer} ${styles.leaf} ${styles.leafRight}`}
            src={LAYER_SRC.leafRight}
            alt=""
            draggable={false}
          />
          {/* In front of the leaves, so the lilies stay planted as the doors swing. */}
          <img className={`${styles.layer} ${styles.flowers}`} src={LAYER_SRC.flowers} alt="" draggable={false} />
          {/* eslint-enable @next/next/no-img-element */}
        </div>

        {/*
          Cover — live text over the quiet panel of the artwork. No opaque
          card: the glow behind the copy is a feathered radial wash, so the
          stonework still reads through it.
        */}
        <section className={styles.cover} aria-label="Bìa thiệp" inert={phase !== "closed"}>
          <span className={styles.crossRule} aria-hidden="true" />
          <p className={styles.coverEyebrow}>{eyebrow}</p>
          <p className={styles.coverBrand}>{brand}</p>
          <span className={styles.coverRule} aria-hidden="true" />
          <p className={styles.coverCouple}>
            <span>{primaryName}</span>
            <span className={styles.coverAmp} aria-hidden="true">
              &amp;
            </span>
            <span>{secondaryName}</span>
          </p>
          <p className={styles.coverVerse}>
            “{verse}”<span className={styles.coverVerseRef}>— {verseReference} —</span>
          </p>
          <p className={styles.coverDate}>
            <time dateTime={dateTime}>{dateLine}</time>
          </p>
        </section>

        <button className={styles.cta} type="button" onClick={open} inert={phase !== "closed"}>
          {COPY.opening.openLabel} <span aria-hidden="true">›</span>
        </button>

        {/*
          Section 02 — the wedding-photo hero. It is this stage's open
          state, so the photograph the doors revealed simply stays and the
          type settles onto it. There is no second hero below.
        */}
        <section
          className={styles.hero}
          ref={heroRef}
          tabIndex={-1}
          aria-label="Thiệp cưới"
          inert={phase !== "open"}
        >
          <div className={styles.heroTop}>
            <p className={styles.heroEyebrow}>{eyebrow}</p>
            <h1 className={styles.heroNames}>
              {primaryName} &amp; {secondaryName}
            </h1>
            <p className={styles.heroDate}>
              <time dateTime={dateTime}>{dateLine}</time>
            </p>
          </div>
          <p className={styles.heroVerse}>
            “{verse}”<span className={styles.coverVerseRef}>— {verseReference} —</span>
          </p>
        </section>

        <span className={styles.scrollHint} aria-hidden="true">
          ⌄
        </span>
        {floatingControl === undefined ? null : <div className={styles.floatingControl}>{floatingControl}</div>}
      </div>

      {/* Sections 03–14. Unreachable until the doors have opened. */}
      <div className={styles.interior} inert={phase !== "open"}>
        {children}
      </div>
    </div>
  );
}
