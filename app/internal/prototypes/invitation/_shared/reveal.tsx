"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { useReducedMotion } from "./use-reduced-motion";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger offset in seconds — used to rhythm consecutive reveals within one section. */
  delay?: number;
  /** Slide distance in px. 0 for a pure fade (used for full-bleed photo blocks). */
  y?: number;
  /** Horizontal slide distance in px (e.g. paired columns entering from each side). Default 0. */
  x?: number;
}

/**
 * Shared scroll-reveal primitive (checkpoint V6 §3E — motion must be
 * consistent and centralized, not reimplemented per template). Each
 * template still owns its own timing/distance choices via props; only the
 * IntersectionObserver + reduced-motion wiring is centralized here.
 */
export function Reveal({ children, className, delay = 0, y = 22, x = 0 }: RevealProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
