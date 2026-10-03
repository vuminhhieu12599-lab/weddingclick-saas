import { useEffect, useRef } from "react";

import styles from "../elegant-editorial-v1.module.css";

/**
 * Elegant Editorial motion vocabulary (PO-approved motion pass, strengthened
 * by the PO motion correction). A small closed set; the CSS owns each
 * variant's hidden state, duration and easing (see "Section reveal" in the
 * CSS module). Every variant moves only opacity and the individual
 * `translate` / `scale` / `rotate` / `clip-path` properties, so start and end
 * states share one layout footprint.
 *
 * - `rise`: fade up (text lines);
 * - `headline`: a longer, slower rise with a small scale settle (headings);
 * - `card`: a strong rise with a scale settle (cards and panels);
 * - `fade`: opacity only;
 * - `left` / `right`: a clear horizontal entrance towards centre with a
 *   scale settle (portraits, side-anchored tiles);
 * - `scale`: scale-and-fade (ornaments, countdown units);
 * - `pop`: a short scale-up from small, without overshoot (markers, swatches);
 * - `image`: an inset clip opening with a fade (framed tiles);
 * - `zoom`: a soft zoom settle, only for images inside an `overflow: hidden`
 *   frame;
 * - `bloom-start` / `bloom-end`: a floral ornament drifting in from its own
 *   outside corner (upper-left / lower-right) with a slight turn.
 */
export const REVEAL_VARIANTS = [
  "rise",
  "headline",
  "card",
  "fade",
  "left",
  "right",
  "scale",
  "pop",
  "image",
  "zoom",
  "bloom-start",
  "bloom-end",
] as const;

export type RevealVariant = (typeof REVEAL_VARIANTS)[number];

/** Couple plates settle towards the centre from their own side (`data-align`). */
function towardsCentre(element: RevealElement): RevealVariant {
  return element.getAttribute("data-align") === "end" ? "right" : "left";
}

/** A portrait enters from its block's side: groom (`start`) from the left, bride (`end`) from the right. */
function portraitSide(element: RevealElement): RevealVariant {
  return element.parentElement === null ? "left" : towardsCentre(element.parentElement);
}

/** Position among element siblings (0-based), for deterministic per-position motion. */
function siblingIndex(element: RevealElement): number {
  let index = 0;
  for (let node = element.previousElementSibling; node !== null; node = node.previousElementSibling) index += 1;
  return index;
}

/**
 * Photo Story tiles follow their row placement (`data-placement`): a pair's
 * left/right tile from its own side, a lone centred tile rises with a scale
 * settle, a full-width landscape row opens like a cinematic frame.
 */
function photoStoryPlacement(element: RevealElement): RevealVariant {
  switch (element.getAttribute("data-placement")) {
    case "right":
      return "right";
    case "center":
      return "card";
    case "wide":
      return "image";
    default:
      return "left";
  }
}

/** Gallery tiles enter from their own column: left column from the left, right column from the right. */
function columnSide(element: RevealElement): RevealVariant {
  return siblingIndex(element) % 2 === 0 ? "left" : "right";
}

/**
 * Every reveal target by CSS-module class, in no particular order (document
 * order decides the stagger). Section backgrounds never move; only content.
 * The Hero is not here: it is choreographed in CSS when the opening opens.
 * Containers that hold overhanging decoration (e.g. the calendar stage with
 * its corner bouquets) are deliberately not targets.
 */
const REVEAL_TARGETS: readonly (readonly [string, RevealVariant | ((element: RevealElement) => RevealVariant)])[] = [
  // Couple: portraits from their own side, then the plates
  ["coupleQuote", "headline"],
  ["couplePlate", towardsCentre],
  ["couplePortrait", portraitSide],
  ["couplePortraitPlate", "rise"],
  ["coupleDivider", "scale"],
  // Invitation + families
  ["guestKicker", "rise"],
  ["guestLine", "headline"],
  ["familyOrnament", "scale"],
  ["familySide", "headline"],
  ["familyName", "rise"],
  ["familyDivider", "fade"],
  // Ceremony
  ["ceremonyTitle", "headline"],
  ["ceremonyDate", "card"],
  ["ceremonyMeta", "rise"],
  ["lunar", "rise"],
  // Countdown: intro, each unit, its label
  ["countdownKicker", "headline"],
  ["countdownCell", "card"],
  ["countdownLabel", "fade"],
  // Calendar: card, bouquets from their corners, intro, month, weekdays, the day
  ["calendarCard", "card"],
  ["calendarBotanicalStart", "bloom-start"],
  ["calendarBotanicalEnd", "bloom-end"],
  ["calendarIntro", "rise"],
  ["calendarMonth", "headline"],
  ["calendarWeekday", "rise"],
  ["calendarCeremonyDay", "pop"],
  // Ceremony cards: each card, then its lines
  ["eventCard", "card"],
  ["eventTag", "rise"],
  ["eventTitle", "rise"],
  ["eventWhen", "rise"],
  ["eventVenue", "rise"],
  ["eventAddress", "rise"],
  ["ornamentPause", "scale"],
  // Timeline: rows build one by one; time from the left, label from the right, the marker pops
  ["timelineRow", "rise"],
  ["timelineTime", "left"],
  ["timelineDot", "pop"],
  ["timelineLabel", "right"],
  // Photo Story: orientation-aware rows, each tile by its placement
  ["photoStoryTile", photoStoryPlacement],
  // Love Story
  ["storyPhoto", "zoom"],
  ["storyCard", "card"],
  ["storyQuoteMark", "pop"],
  ["storyText", "rise"],
  // RSVP: the card, then its heading, hint, fields and submit control
  ["rsvpCard", "card"],
  ["rsvpHeading", "headline"],
  ["rsvpHint", "rise"],
  ["rsvpField", "rise"],
  ["rsvpSubmit", "rise"],
  // Gift
  ["giftIntro", "rise"],
  ["giftOpen", "card"],
  // Dress Code + Gallery headings, Dress Code content
  ["sectionKicker", "headline"],
  ["dressCodeText", "rise"],
  ["dressCodeSwatch", "pop"],
  // Gallery: every item, at any count, from its own column's side; its image settles inside the frame
  ["galleryItem", columnSide],
  ["galleryImage", "zoom"],
  // Closing (slower tempo in CSS)
  ["closingOrnament", "scale"],
  ["closingLine", "headline"],
  ["closingNames", "headline"],
  ["closingDate", "rise"],
];

/** The CSS-module class names that receive a reveal (for tests and audits). */
export const REVEAL_TARGET_CLASSES: readonly string[] = REVEAL_TARGETS.map(([name]) => name);

/** Stagger between targets revealed together, and its cap (no long cumulative waits). */
export const REVEAL_STAGGER_MS = 110;
export const REVEAL_STAGGER_MAX_STEPS = 6;

/**
 * Delays for one batch of targets entering together, already in document
 * order. Each batch restarts at 0, so content far down the page (e.g. the
 * 40th gallery image) never waits on earlier images' delays.
 */
export function revealDelaysMs(count: number): number[] {
  return Array.from({ length: count }, (_, index) => Math.min(index, REVEAL_STAGGER_MAX_STEPS) * REVEAL_STAGGER_MS);
}

/**
 * `data-ee-reveal` states the CSS keys on: the variant while pending, then
 * `<variant> shown`, once. The variant stays so each one's settled state is
 * exact (only `image` keeps a clip, and only on itself).
 */
const REVEAL_ATTRIBUTE = "data-ee-reveal";
const DELAY_PROPERTY = "--ee-reveal-delay";

/** The DOM surface the controller needs (a real `Element` satisfies it). */
export interface RevealElement {
  readonly parentElement: RevealElement | null;
  readonly previousElementSibling: RevealElement | null;
  readonly style: { setProperty(name: string, value: string): void; removeProperty(name: string): void };
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelectorAll(selectors: string): Iterable<RevealElement>;
  matches(selectors: string): boolean;
  compareDocumentPosition(other: RevealElement): number;
}

/** The one browser API the controller needs; absent means "no reveal at all". */
export interface RevealEnvironment {
  readonly IntersectionObserver?: new (
    callback: (
      entries: readonly { target: RevealElement; isIntersecting: boolean; boundingClientRect: { bottom: number } }[],
    ) => void,
    options: { rootMargin: string },
  ) => { observe(target: RevealElement): void; unobserve(target: RevealElement): void; disconnect(): void };
}

export interface RevealController {
  /** Marks targets mounted after start (e.g. the countdown), except inside an already-handled target. */
  rescan(): void;
  /** Disconnects and removes every mark and delay, so nothing can stay hidden. */
  stop(): void;
}

const DOCUMENT_POSITION_FOLLOWING = 4;

function className(name: string): string {
  return styles[name] ?? name;
}

/**
 * Starts the one-shot reveal for one invitation column. Progressive
 * enhancement only: without `IntersectionObserver` nothing is ever marked,
 * so nothing is ever hidden; under `prefers-reduced-motion: reduce` the CSS
 * keeps every mark visible and still. One shared observer serves every
 * target; there is no scroll listener and no per-frame script.
 */
export function startSectionReveal(column: RevealElement, environment: RevealEnvironment): RevealController {
  const Observer = environment.IntersectionObserver;
  if (Observer === undefined) return { rescan: () => {}, stop: () => {} };

  const resolved = REVEAL_TARGETS.map(([name, variant]) => [`.${className(name)}`, variant] as const);
  const selector = resolved.map(([classSelector]) => classSelector).join(", ");
  const marked = new Set<RevealElement>();

  const observer = new Observer(
    (entries) => {
      // Entering targets animate; a target already scrolled past (fast scroll or a jump) is revealed too, never left hidden.
      const entering = entries
        .filter((entry) => (entry.isIntersecting || entry.boundingClientRect.bottom <= 0) && marked.has(entry.target))
        .map((entry) => entry.target)
        .sort((a, b) => (a.compareDocumentPosition(b) & DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const delays = revealDelaysMs(entering.length);
      entering.forEach((target, index) => {
        target.style.setProperty(DELAY_PROPERTY, `${delays[index]}ms`);
        target.setAttribute(REVEAL_ATTRIBUTE, `${target.getAttribute(REVEAL_ATTRIBUTE)} shown`);
        observer.unobserve(target);
      });
    },
    { rootMargin: "0px 0px -40px 0px" },
  );

  function variantOf(element: RevealElement): RevealVariant | null {
    for (const [classSelector, variant] of resolved) {
      if (element.matches(classSelector)) return typeof variant === "function" ? variant(element) : variant;
    }
    return null;
  }

  function insideHandledTarget(element: RevealElement): boolean {
    for (let node = element.parentElement; node !== null && node !== column; node = node.parentElement) {
      if (node.getAttribute(REVEAL_ATTRIBUTE) !== null) return true;
    }
    return false;
  }

  function mark(element: RevealElement) {
    if (marked.has(element) || element.getAttribute(REVEAL_ATTRIBUTE) !== null) return;
    const variant = variantOf(element);
    if (variant === null) return;
    marked.add(element);
    element.setAttribute(REVEAL_ATTRIBUTE, variant);
    observer.observe(element);
  }

  for (const element of column.querySelectorAll(selector)) mark(element);

  return {
    rescan() {
      for (const element of column.querySelectorAll(selector)) {
        if (!insideHandledTarget(element)) mark(element);
      }
    },
    stop() {
      observer.disconnect();
      for (const element of marked) {
        element.removeAttribute(REVEAL_ATTRIBUTE);
        element.style.removeProperty(DELAY_PROPERTY);
      }
      marked.clear();
    },
  };
}

/**
 * RF-06D section reveal, extended by the PO-approved final motion pass.
 *
 * Server markup never carries a hidden state, so every block is visible
 * without JavaScript and before hydration. After mount, blocks are marked
 * pending and each is revealed the first time it enters this document's own
 * viewport (inside the Staff Preview iframe, or a standalone page), then
 * left alone. Under `prefers-reduced-motion: reduce` the CSS keeps every
 * block visible and still. No network, no storage,
 * no timer. On unmount every mark is removed, so nothing can stay hidden.
 *
 * Renders only an inert, hidden anchor used to find its own invitation
 * column; it reads nothing outside it.
 */
export function SectionReveal({ hasCountdown = false }: { readonly hasCountdown?: boolean }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const controllerRef = useRef<RevealController | null>(null);

  useEffect(() => {
    const column = anchorRef.current?.parentElement;
    if (column === null || column === undefined) return;
    // A real Element is structurally a RevealElement; DOM lib parameter types are wider (Node), hence the cast.
    const controller = startSectionReveal(column as unknown as RevealElement, {
      IntersectionObserver: typeof IntersectionObserver === "undefined" ? undefined : IntersectionObserver,
    } as RevealEnvironment);
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.stop();
    };
  }, []);

  // The countdown mounts once the clock exists (after first render): mark it then.
  useEffect(() => {
    if (hasCountdown) controllerRef.current?.rescan();
  }, [hasCountdown]);

  return <span ref={anchorRef} hidden />;
}
