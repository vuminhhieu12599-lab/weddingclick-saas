"use client";

import { useId } from "react";

/**
 * Se Duyên (Thread of Fate) — prototype decor, drawn as inline vector
 * geometry and CSS only.
 *
 * SD-00 asset strategy: no raster artwork is invented here. The approved
 * pre-rendered 3D asset set does not exist yet, and prototype placeholders
 * must never be mistaken for it (the 2026-10-01 Product Owner rule: ship the
 * exact approved asset, never a redrawn stand-in). So every ornament below
 * is temporary vector/CSS mock geometry whose only job is to answer the
 * SD-00 question — does this direction read premium and poetic on a phone?
 *
 * Depth trick used throughout: each gold stroke is drawn twice — a dark
 * copy offset downward, then the gold copy on top. That reads as relief
 * (light from the top-left) without a filter, a blur or a second layer.
 *
 * Gradient ids are instance-scoped with `useId()`, so several emblems on one
 * page never collide.
 */

/** Shared gold-leaf ramp: highlight → leaf → shadow, lit from the top-left. */
function GoldRamp({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="12%" y1="0%" x2="88%" y2="100%">
      <stop offset="0%" stopColor="#f4e2b0" />
      <stop offset="34%" stopColor="#d8b875" />
      <stop offset="62%" stopColor="#b8914c" />
      <stop offset="100%" stopColor="#8a6a33" />
    </linearGradient>
  );
}

/**
 * The "nút tơ hồng" — a silk bow-knot, deliberately NOT a pair of rings
 * and not the 囍 glyph Vietnamese Heritage already owns. One continuous
 * thread, two loops, two tails: the se duyên idea in a single mark.
 */
export function FateKnot({ className, strokeWidth = 2.6 }: { className?: string; strokeWidth?: number }) {
  const uid = useId().replace(/:/g, "");
  const gold = `sd-knot-gold-${uid}`;

  const loops = [
    // Left loop, right loop, then the two falling tails.
    "M60 59C41 41 19 47 23 63c4 15 25 10 37 -4",
    "M60 59C79 41 101 47 97 63c-4 15-25 10-37 -4",
    "M58 61c-5 13-10 24-18 34",
    "M62 61c5 13 10 24 18 34",
  ];

  return (
    <svg className={className} viewBox="0 0 120 108" fill="none" aria-hidden="true">
      <defs>
        <GoldRamp id={gold} />
      </defs>
      {/* Relief shadow pass. */}
      <g stroke="#3d0f12" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.5" transform="translate(0 1.6)">
        {loops.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {/* Gold pass. */}
      <g stroke={`url(#${gold})`} strokeWidth={strokeWidth} strokeLinecap="round">
        {loops.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {/* The knot itself, slightly raised. */}
      <ellipse cx="60" cy="59.5" rx="5.6" ry="7" fill="#3d0f12" opacity="0.45" transform="translate(0 1.6)" />
      <ellipse cx="60" cy="59.5" rx="5.6" ry="7" fill={`url(#${gold})`} />
    </svg>
  );
}

/**
 * The cover emblem: two concentric gold rules around the knot. The lacquer
 * disc, its rim bevel and its cast shadow are CSS (see `.emblemDisc`), so
 * this file stays geometry only.
 */
export function FateEmblem({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const gold = `sd-emblem-gold-${uid}`;

  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <defs>
        <GoldRamp id={gold} />
      </defs>
      <circle cx="60" cy="61.4" r="54" stroke="#3d0f12" strokeWidth="1.6" opacity="0.5" />
      <circle cx="60" cy="60" r="54" stroke={`url(#${gold})`} strokeWidth="1.6" />
      <circle cx="60" cy="60" r="48.5" stroke={`url(#${gold})`} strokeWidth="0.7" opacity="0.72" />
    </svg>
  );
}

/**
 * The wax seal's relief. Embossed in the wax itself (light rim + dark
 * valley), not printed in gold — that is what makes it read as pressed wax
 * rather than a sticker.
 */
export function SealRelief({ className }: { className?: string }) {
  const loops = [
    "M30 29C21 21 11 24 13 31c2 7 11 5 17 -2",
    "M30 29C39 21 49 24 47 31c-2 7-11 5-17 -2",
    "M29 30c-2 6-5 11-9 16",
    "M31 30c2 6 5 11 9 16",
  ];

  return (
    <svg className={className} viewBox="0 0 60 56" fill="none" aria-hidden="true">
      <g stroke="#4a0b0b" strokeWidth="3" strokeLinecap="round" opacity="0.85">
        {loops.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g stroke="#eab6ae" strokeWidth="1.7" strokeLinecap="round" opacity="0.62" transform="translate(0 -1.3)">
        {loops.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <ellipse cx="30" cy="29" rx="4.8" ry="5.8" fill="#4a0b0b" opacity="0.75" />
      <ellipse cx="30" cy="27.7" rx="4.2" ry="5.2" fill="#eab6ae" opacity="0.5" />
    </svg>
  );
}

/**
 * The tơ hồng itself: a twisted silk thread, two strokes (crimson core,
 * gold filament offset by a hair). `pathLength="1"` lets the draw-on
 * animation be written once in CSS, independent of the rendered size.
 */
export function ThreadVertical({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 150" fill="none" preserveAspectRatio="none" aria-hidden="true">
      <path
        className="sdThreadCore"
        pathLength="1"
        d="M14 0c0 26-8 36-8 56s8 30 8 50 -4 30-4 44"
        stroke="#8e1b20"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        className="sdThreadGlint"
        pathLength="1"
        d="M15.2 0c0 26-8 36-8 56s8 30 8 50 -4 30-4 44"
        stroke="#d8b875"
        strokeWidth="0.7"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

/** The same thread, curving between two staggered portrait frames. */
export function ThreadCurve({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 120" fill="none" aria-hidden="true">
      <path
        className="sdThreadCore"
        pathLength="1"
        d="M26 6c0 34 28 44 94 50 58 5 86 20 94 58"
        stroke="#8e1b20"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        className="sdThreadGlint"
        pathLength="1"
        d="M26 7.4c0 34 28 44 94 50 58 5 86 20 94 58"
        stroke="#d8b875"
        strokeWidth="0.7"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

/** Horizontal rule with the knot at its centre — the section divider. */
export function ThreadDivider({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const fade = `sd-divider-fade-${uid}`;

  return (
    <svg className={className} viewBox="0 0 200 28" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={fade} x1="0%" x2="100%">
          <stop offset="0%" stopColor="#b8914c" stopOpacity="0" />
          <stop offset="50%" stopColor="#d8b875" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#b8914c" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M4 14h74" stroke={`url(#${fade})`} strokeWidth="1" />
      <path d="M122 14h74" stroke={`url(#${fade})`} strokeWidth="1" />
      <g transform="translate(84 3) scale(0.26)">
        <g stroke="#b8914c" strokeWidth="9" strokeLinecap="round" fill="none">
          <path d="M60 59C41 41 19 47 23 63c4 15 25 10 37 -4" />
          <path d="M60 59C79 41 101 47 97 63c-4 15-25 10-37 -4" />
        </g>
        <ellipse cx="60" cy="59.5" rx="12" ry="15" fill="#b8914c" />
      </g>
    </svg>
  );
}

/** Frame corner relief — one shape, mirrored four ways by CSS. */
export function FrameCorner({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const gold = `sd-corner-gold-${uid}`;

  return (
    <svg className={className} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <defs>
        <GoldRamp id={gold} />
      </defs>
      <path d="M1 33V9C1 4.6 4.6 1 9 1h24" stroke="#3d0f12" strokeWidth="2" opacity="0.45" transform="translate(0 1.2)" />
      <path d="M1 33V9C1 4.6 4.6 1 9 1h24" stroke={`url(#${gold})`} strokeWidth="2" />
      <path d="M6 33V12c0-3.3 2.7-6 6-6h21" stroke={`url(#${gold})`} strokeWidth="0.7" opacity="0.6" />
      <circle cx="10.5" cy="10.5" r="2.4" fill={`url(#${gold})`} />
    </svg>
  );
}
