import { useEffect, useReducer, useRef, useSyncExternalStore, type AnimationEvent, type ReactNode } from "react";

import { SE_DUYEN_V1_COPY } from "../copy";
import styles from "../se-duyen-v1.module.css";
import { photoFrameStyle, type SeDuyenPhotoSlot } from "../sections/photo-frame";
import type { ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { INITIAL_OPENING_PHASE, openingReducer } from "./opening-state";

const COPY = SE_DUYEN_V1_COPY;
const HERO_SLOT: SeDuyenPhotoSlot = "hero";

/** Hydration marker: `false` in server markup and during hydration, `true` once in the browser. */
function subscribeNever(): () => void {
  return () => undefined;
}

interface OpeningStageProps {
  /** Resolver order: primary first in every variant (CLAUDE.md §5). */
  readonly primaryName: string;
  readonly secondaryName: string;
  /** Already derived from the one canonical ceremony instant (RF-05C). */
  readonly weekday: string;
  readonly fullDate: string;
  /** The Project's own opening photograph, or `undefined` when none resolved. */
  readonly photo: ResolvedMedia | undefined;
  readonly photoAlt: string;
  /** The invitation itself: a sibling of the opening screen, below it. */
  readonly children: ReactNode;
}

/**
 * Se Duyên v1 opening island — the approved "Hộp Cưới" sequence (SD-V1-01),
 * ported from the pilot v03 visual freeze at commit 79971e3.
 *
 * `closed` → `opening` → `hero`. A closed Vietnamese lacquer wedding box
 * with the couple's names above it and the wedding date below; the guest
 * taps the box itself — the whole box is the control, there is no separate
 * button — the lid lifts off, the photograph rises out of the silk-lined
 * basin, and that SAME element then grows out of the box to fill the screen
 * and becomes the photo-led hero. There is one photograph in the whole
 * sequence: an earlier pass kept a second full-screen copy and crossfaded
 * them, which showed ghosted faces behind the small card.
 *
 * Nothing opens on a timer, on load or on scroll, and nothing is remembered
 * across reloads. The phase advances only on the explicit tap and then on
 * the opening sequence's own `animationend` (`.openingClock`, whose two
 * durations are the approved ones and live in the stylesheet, so the motion
 * preference is honoured where the rest of the motion already is).
 *
 * The stylesheet owns every timing, easing and offset. This island owns only
 * the phase, the one layout fact CSS cannot express (below), and the
 * hydration marker that lets the interior be held back without ever hiding
 * it from a guest whose JavaScript did not run.
 */
export function OpeningStage({
  primaryName,
  secondaryName,
  weekday,
  fullDate,
  photo,
  photoAlt,
  children,
}: OpeningStageProps) {
  const [phase, dispatch] = useReducer(openingReducer, INITIAL_OPENING_PHASE);
  const interactive = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  // Synchronous duplicate guard: several taps can land before React rerenders.
  const activated = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);

  /**
   * The photo card grows from inside the box to the whole screen. Its
   * containing block is the box, so the full-screen rectangle has to be
   * expressed relative to the box — a layout fact CSS cannot name. Measured
   * and handed to the stylesheet as custom properties; the stylesheet owns
   * the timing and the easing. Cheap: it only writes custom properties.
   */
  function measureExpansion() {
    const root = rootRef.current;
    const box = boxRef.current;
    if (root === null || box === null) return;

    const rootRect = root.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();

    root.style.setProperty("--sdp-expand-left", `${String(rootRect.left - boxRect.left)}px`);
    root.style.setProperty("--sdp-expand-top", `${String(rootRect.top - boxRect.top)}px`);
    root.style.setProperty("--sdp-expand-width", `${String(rootRect.width)}px`);
    root.style.setProperty("--sdp-expand-height", `${String(rootRect.height)}px`);
  }

  /**
   * The measured rectangle has to keep following the opening screen, and
   * `ResizeObserver` is this island's one privileged observer — the same
   * least-privilege arrangement the shared section reveal has for
   * `IntersectionObserver`.
   *
   * It is not a convenience. The rectangle is the size the photograph is
   * painted at once it has grown, so a viewport change invalidates it: a
   * guest who rotates the phone, or whose mobile toolbar collapses, after
   * the invitation has opened would otherwise be left looking at a hero
   * photograph still sized to the old viewport, with bare lacquer around it
   * — a broken mobile layout (CLAUDE.md §30) that no reload-free recovery
   * could fix. Observing one element and writing four custom properties is
   * the cheapest correct answer; there is no polling and no timer. Where the
   * API is missing, the rectangle is the one measured at the tap and again
   * at the grow, which is correct for every guest who does not resize.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (root === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      measureExpansion();
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, []);

  /**
   * The approved sequence has finished rising and holding, so the card is
   * about to grow. Re-measured here, not trusted from the tap: this is the
   * instant the rectangle is actually consumed.
   */
  function handleClockEnd(event: AnimationEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
    measureExpansion();
    dispatch("RISEN");
  }

  return (
    <>
      <div
        ref={rootRef}
        className={styles.root}
        data-phase={phase}
        data-interactive={interactive ? "true" : undefined}
      >
        {/* The box stage: closed box, lid lift, the photograph rising and
            then growing. Never `aria-hidden` in the hero phase — the
            photograph lives here, so only the cover text steps out of the
            accessibility tree. */}
        <section className={styles.stage}>
          <div className={styles.background} />

          <div className={styles.coverTop} aria-hidden={phase !== "closed"}>
            <p className={styles.coverEyebrow}>{COPY.cover.eyebrow}</p>

            <h1 className={styles.coverNames}>
              <span className={styles.coverName}>{primaryName}</span>
              <span className={styles.coverAmp}>&amp;</span>
              <span className={styles.coverName}>{secondaryName}</span>
            </h1>
          </div>

          {/* The hint rides along in this row so it stays tied to the box. */}
          <div className={styles.boxArea}>
            <button
              type="button"
              className={styles.boxButton}
              onClick={() => {
                if (activated.current) return;
                activated.current = true;
                measureExpansion();
                dispatch("OPEN");
              }}
              disabled={phase !== "closed"}
              aria-label={COPY.cover.openHint}
            >
              <span className={styles.box} ref={boxRef}>
                <span className={`${styles.boxArt} ${styles.boxBase}`} />
                <span className={`${styles.boxArt} ${styles.boxLid}`} />

                {/* Clipped to the basin's front inner rim, so the card's
                    lower edge stays inside the box as it rises — then this
                    same slot grows to the full screen and becomes the hero
                    image. Omitted entirely when the Project has no
                    photograph: never filled with demo art (P7). */}
                {photo === undefined ? null : (
                  <span className={styles.photoSlot}>
                    <span
                      className={styles.photoCard}
                      style={photoFrameStyle(HERO_SLOT, photo)}
                      role="img"
                      aria-label={photoAlt}
                    />
                  </span>
                )}
              </span>
            </button>

            {/* Immediately under the box, because it is about the box. */}
            <p className={styles.coverHint} aria-hidden={phase !== "closed"}>
              {COPY.cover.openHint}
            </p>
          </div>

          <div className={styles.coverBottom} aria-hidden={phase !== "closed"}>
            <p className={styles.coverDate}>
              <span>{weekday}</span>
              <span className={styles.coverDateMain}>{fullDate}</span>
            </p>
          </div>
        </section>

        {/* Photo-led hero: scrim and text only. The picture beneath is the
            grown card, not a second copy. */}
        <section className={styles.hero} aria-hidden={phase !== "hero"}>
          <div className={styles.heroScrim} />

          <div className={styles.heroText}>
            <p className={styles.heroEyebrow}>{COPY.hero.eyebrow}</p>

            <h1 className={styles.heroNames}>
              <span className={styles.heroName}>{primaryName}</span>
              <span className={styles.heroAmp}>&amp;</span>
              <span className={styles.heroName}>{secondaryName}</span>
            </h1>

            {/* The one ornament in the hero — the tơ hồng, used sparingly. */}
            <span className={styles.heroThread} aria-hidden="true" />

            <p className={styles.heroDate}>
              <span>{weekday}</span>
              <span className={styles.heroDateMain}>{fullDate}</span>
            </p>
          </div>
        </section>

        {/* Ends the opening and nothing else; see `.openingClock`. */}
        <span className={styles.openingClock} aria-hidden="true" onAnimationEnd={handleClockEnd} />
      </div>

      <div className={styles.interior}>{children}</div>
    </>
  );
}
