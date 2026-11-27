import { useEffect, useRef } from "react";

import {
  startSectionReveal,
  type RevealController,
  type RevealElement,
  type RevealEnvironment,
  type RevealTarget,
} from "../../../../../lib/invitation-rendering/section-reveal-controller";
import styles from "../khan-voan-v1.module.css";

type KvRevealVariant = "rise" | "wipe" | "zoom";

export const KV_REVEAL_ATTRIBUTE = "data-kv-reveal";

const TARGETS: readonly RevealTarget<KvRevealVariant>[] = [
  { selector: `.${styles.reveal ?? "reveal"}`, variant: "rise" },
  { selector: `.${styles.wipe ?? "wipe"}`, variant: "wipe" },
  { selector: `.${styles.thanks ?? "thanks"}`, variant: "zoom" },
];

/**
 * Progressive reveal through the shared controller: every marked element
 * rises, unveils or settles once as it enters. Without IntersectionObserver
 * nothing is marked, so nothing is ever hidden.
 */
export function SectionReveal({ hasCountdown }: { readonly hasCountdown: boolean }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const controllerRef = useRef<RevealController | null>(null);

  useEffect(() => {
    const content = anchorRef.current?.parentElement;
    if (content === null || content === undefined) return;
    const controller = startSectionReveal(
      content as unknown as RevealElement,
      { IntersectionObserver: typeof IntersectionObserver === "undefined" ? undefined : IntersectionObserver } as RevealEnvironment,
      TARGETS,
      { attribute: KV_REVEAL_ATTRIBUTE, delayProperty: "--kv-reveal-delay", staggerMs: 120, maxStaggerSteps: 4, rootMargin: "0px 0px -60px 0px" },
    );
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.stop();
    };
  }, []);

  useEffect(() => {
    if (hasCountdown) controllerRef.current?.rescan();
  }, [hasCountdown]);

  return <span ref={anchorRef} hidden />;
}
