"use client";

import Image from "next/image";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  ceremonyDateParts,
  type HongAnOpeningCopy,
  HONG_AN_DEMO_COPY,
} from "./hong-an-copy";
import { LAYER_SRC, SCENE_CSS_VARS } from "./layer-geometry";
import styles from "./hong-an-opening.module.css";

/**
 * HA-OPEN-02 — the approved Hồng Ân V4 opening.
 *
 * Presentation only: static demo copy in, pixels out. No Supabase, no
 * Project, no RSVP, no publication state, no audio. It proves the
 * movement for Product Owner review; nothing in the production template
 * graph imports it.
 *
 * The V4 choreography is deliberately simpler than the V1 prototype's.
 * The wedding photograph sits behind the whole facade rather than being
 * clipped into the doorway, so the doors reveal it by uncovering it and
 * the hero needs no second copy of the photo and no arch-shaped mask: the
 * stonework simply dissolves off the picture that was always there.
 */

/** Where the sequence is. `opening` covers the swing; `open` is the hero. */
type Phase = "closed" | "opening" | "open";

/**
 * Must outlast the leaves: 1250ms of swing plus a little settle before
 * the stonework starts to dissolve. Kept here rather than in the
 * stylesheet because the component is what decides when the invitation
 * may take focus.
 */
const TRAVEL_MS = 1300;

/** The stage is never wider than the phone it is previewed in. */
const LAYER_SIZES = "(max-width: 460px) 100vw, 440px";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const readReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;

/** On the server nothing is known about the reader; assume full motion. */
const readReducedMotionOnServer = () => false;

export type HongAnOpeningProps = {
  readonly copy?: HongAnOpeningCopy;
  /** The wedding photograph behind the doors, and the hero once they open. */
  readonly photoSrc?: string;
  /** Reviewer override: force the reduced-motion path on any machine. */
  readonly forceReducedMotion?: boolean;
  readonly className?: string;
};

export function HongAnOpening({
  copy = HONG_AN_DEMO_COPY,
  photoSrc = LAYER_SRC.demoPhoto,
  forceReducedMotion = false,
  className,
}: HongAnOpeningProps) {
  const [phase, setPhase] = useState<Phase>("closed");
  const heroRef = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefersReduced = useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotion,
    readReducedMotionOnServer,
  );
  const reduced = prefersReduced || forceReducedMotion;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const open = useCallback(() => {
    if (phase !== "closed") return;
    if (timer.current) clearTimeout(timer.current);

    // Reduced motion: skip the swing entirely and show the hero. No
    // travel, and no blank interval to sit through.
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

  const date = ceremonyDateParts(copy.ceremonyAt);
  const dateLine = `${date.day} · ${date.month} · ${date.year}`;

  return (
    <div
      className={className ? `${styles.stage} ${className}` : styles.stage}
      data-phase={phase}
      data-motion={reduced ? "reduced" : "full"}
      style={SCENE_CSS_VARS as CSSProperties}
    >
      {/*
        The photograph is the one thing on this screen that is not
        decoration, so it is the only layer with alternative text. It sits
        at the back of the stack the whole time: the doors reveal it by
        uncovering it, which is why the hero is seamless.
      */}
      <Image
        className={styles.photo}
        src={photoSrc}
        alt={copy.heroPhotoAlt}
        fill
        sizes={LAYER_SIZES}
        preload
      />
      <div className={styles.photoVeil} aria-hidden="true" />

      {/*
        The facade. Every layer shares one 1440×3120 registration, so the
        scene box is canvas-shaped and sized to cover the stage; that way
        the hinge percentages land on the same pixels at every width.

        `unoptimized` is deliberate: these are the approved pixels and
        their alpha edges, and re-encoding them through the optimizer
        would put a second-generation copy in front of the Product Owner.
        A production Hồng Ân renderer should ship pre-sized layers and
        drop this. The photograph is ordinary Project media, so it is
        optimized as usual.
      */}
      <div className={styles.scene} aria-hidden="true">
        <Image
          className={`${styles.layer} ${styles.reveal}`}
          src={LAYER_SRC.reveal}
          alt=""
          fill
          sizes={LAYER_SIZES}
          preload
          unoptimized
          draggable={false}
        />
        <div className={styles.light} />
        <Image
          className={`${styles.layer} ${styles.frame}`}
          src={LAYER_SRC.frame}
          alt=""
          fill
          sizes={LAYER_SIZES}
          preload
          unoptimized
          draggable={false}
        />
        <Image
          className={`${styles.layer} ${styles.leaf} ${styles.leafLeft}`}
          src={LAYER_SRC.leafLeft}
          alt=""
          fill
          sizes={LAYER_SIZES}
          preload
          unoptimized
          draggable={false}
        />
        <Image
          className={`${styles.layer} ${styles.leaf} ${styles.leafRight}`}
          src={LAYER_SRC.leafRight}
          alt=""
          fill
          sizes={LAYER_SIZES}
          preload
          unoptimized
          draggable={false}
        />
        {/* In front of the leaves, so the lilies stay put as the doors swing. */}
        <Image
          className={`${styles.layer} ${styles.flowers}`}
          src={LAYER_SRC.flowers}
          alt=""
          fill
          sizes={LAYER_SIZES}
          preload
          unoptimized
          draggable={false}
        />
      </div>

      {/*
        Cover — live text over the quiet panel of the artwork. No opaque
        card: the glow behind the copy is a feathered radial wash, so the
        stonework still reads through it.
      */}
      <section
        className={styles.cover}
        aria-label="Bìa thiệp"
        inert={phase !== "closed"}
      >
        <span className={styles.crossRule} aria-hidden="true" />
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <p className={styles.brand}>{copy.templateName}</p>
        <span className={styles.rule} aria-hidden="true" />
        <p className={styles.couple}>
          <span>{copy.groom.short}</span>
          <span className={styles.ampersand} aria-hidden="true">
            &amp;
          </span>
          <span>{copy.bride.short}</span>
        </p>
        <p className={styles.verse}>
          “{copy.verse.text}”
          <span className={styles.verseRef}>— {copy.verse.reference} —</span>
        </p>
        {/* CLAUDE.md §7 — every part comes from the one canonical instant. */}
        <p className={styles.coverDate}>
          <time dateTime={date.iso}>{dateLine}</time>
        </p>
      </section>

      <button
        className={styles.cta}
        type="button"
        onClick={open}
        inert={phase !== "closed"}
      >
        {copy.openLabel} <span aria-hidden="true">›</span>
      </button>

      {/* The invitation itself, read over the photograph it opened onto. */}
      <section
        className={styles.hero}
        ref={heroRef}
        tabIndex={-1}
        aria-label="Thiệp cưới"
        inert={phase !== "open"}
      >
        <div className={styles.heroTop}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <p className={styles.heroNames}>
            {copy.groom.short} &amp; {copy.bride.short}
          </p>
          <p className={styles.heroDate}>
            <time dateTime={date.iso}>{dateLine}</time>
          </p>
        </div>
        <p className={styles.heroVerse}>
          “{copy.verse.text}”
          <span className={styles.verseRef}>— {copy.verse.reference} —</span>
        </p>
      </section>

      <span className={styles.scrollHint} aria-hidden="true">
        ⌄
      </span>
    </div>
  );
}
