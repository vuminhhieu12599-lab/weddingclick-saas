/**
 * Shared renderer section-reveal controller (docs/DECISIONS.md "VH-02B-M2").
 *
 * Framework-free progressive enhancement over an injected DOM surface and an
 * injected `IntersectionObserver` constructor (no browser global is read
 * here). One shared observer serves every target of one invitation column;
 * there is no scroll listener, no timer and no per-frame script:
 *
 * 1. `start` marks every current target "pending" with its variant;
 * 2. the first time a target enters (or has already been scrolled past) it is
 *    marked shown with a small stagger among the targets entering together,
 *    then unobserved: it reveals once and is never replayed;
 * 3. `rescan` marks targets mounted later (e.g. a capability-backed
 *    countdown), skipping anything inside an already-handled target;
 * 4. `stop` disconnects and removes every mark and delay.
 *
 * Without an observer nothing is ever marked, so nothing is ever hidden;
 * renderer CSS keeps marked targets visible and still under reduced motion.
 * The stagger restarts at 0 for every observer batch and is capped, so
 * content far down the page never waits on earlier delays.
 *
 * Elegant Editorial v1 keeps its own equivalent controller in
 * `interactive/section-reveal.tsx` (recorded technical debt).
 */

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

export interface RevealObserverEntry {
  readonly target: RevealElement;
  readonly isIntersecting: boolean;
  readonly boundingClientRect: { readonly bottom: number };
}

export interface RevealObserver {
  observe(target: RevealElement): void;
  unobserve(target: RevealElement): void;
  disconnect(): void;
}

/** The one browser API the controller needs; absent means "no reveal at all". */
export interface RevealEnvironment {
  readonly IntersectionObserver?: new (
    callback: (entries: readonly RevealObserverEntry[]) => void,
    options: { rootMargin: string },
  ) => RevealObserver;
}

/** One target kind: a CSS selector and its fixed or element-derived variant. */
export interface RevealTarget<TVariant extends string> {
  readonly selector: string;
  readonly variant: TVariant | ((element: RevealElement) => TVariant);
}

export interface RevealOptions {
  /** Attribute carrying `<variant>` while pending and `<variant> shown` once revealed. */
  readonly attribute: string;
  /** Custom property carrying the stagger delay. */
  readonly delayProperty: string;
  readonly staggerMs: number;
  readonly maxStaggerSteps: number;
  readonly rootMargin: string;
}

export interface RevealController {
  rescan(): void;
  stop(): void;
}

const DOCUMENT_POSITION_FOLLOWING = 4;

/** Delays for one batch already in document order: restarts at 0 per batch, capped at `maxSteps`. */
export function revealDelaysMs(count: number, staggerMs: number, maxSteps: number): number[] {
  return Array.from({ length: count }, (_, index) => Math.min(index, maxSteps) * staggerMs);
}

/** Position among element siblings (0-based), for deterministic per-position variants. */
export function revealSiblingIndex(element: RevealElement): number {
  let index = 0;
  for (let node = element.previousElementSibling; node !== null; node = node.previousElementSibling) index += 1;
  return index;
}

export function startSectionReveal<TVariant extends string>(
  root: RevealElement,
  environment: RevealEnvironment,
  targets: readonly RevealTarget<TVariant>[],
  options: RevealOptions,
): RevealController {
  const Observer = environment.IntersectionObserver;
  if (Observer === undefined || targets.length === 0) return { rescan: () => undefined, stop: () => undefined };

  const selector = targets.map((target) => target.selector).join(", ");
  const marked = new Set<RevealElement>();
  // Marked and not yet shown: a duplicate or late entry for a shown target is ignored (reveal exactly once).
  const pending = new Set<RevealElement>();

  const observer = new Observer(
    (entries) => {
      // Entering targets reveal; a target already scrolled past (fast scroll or a jump) is revealed too, never left hidden.
      const entering = entries
        .filter((entry) => (entry.isIntersecting || entry.boundingClientRect.bottom <= 0) && pending.has(entry.target))
        .map((entry) => entry.target)
        .sort((a, b) => (a.compareDocumentPosition(b) & DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const delays = revealDelaysMs(entering.length, options.staggerMs, options.maxStaggerSteps);
      entering.forEach((target, index) => {
        target.style.setProperty(options.delayProperty, `${String(delays[index] ?? 0)}ms`);
        target.setAttribute(options.attribute, `${target.getAttribute(options.attribute) ?? ""} shown`);
        pending.delete(target);
        observer.unobserve(target);
      });
    },
    { rootMargin: options.rootMargin },
  );

  function variantOf(element: RevealElement): TVariant | null {
    for (const target of targets) {
      if (element.matches(target.selector)) return typeof target.variant === "function" ? target.variant(element) : target.variant;
    }
    return null;
  }

  function insideHandledTarget(element: RevealElement): boolean {
    for (let node = element.parentElement; node !== null && node !== root; node = node.parentElement) {
      if (node.getAttribute(options.attribute) !== null) return true;
    }
    return false;
  }

  function mark(element: RevealElement) {
    if (marked.has(element) || element.getAttribute(options.attribute) !== null) return;
    const variant = variantOf(element);
    if (variant === null) return;
    marked.add(element);
    pending.add(element);
    element.setAttribute(options.attribute, variant);
    observer.observe(element);
  }

  for (const element of root.querySelectorAll(selector)) mark(element);

  return {
    rescan() {
      for (const element of root.querySelectorAll(selector)) {
        if (!insideHandledTarget(element)) mark(element);
      }
    },
    stop() {
      observer.disconnect();
      for (const element of marked) {
        element.removeAttribute(options.attribute);
        element.style.removeProperty(options.delayProperty);
      }
      marked.clear();
      pending.clear();
    },
  };
}
