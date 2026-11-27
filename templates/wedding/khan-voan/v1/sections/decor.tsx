/**
 * Khăn Voan v1 — every decorative drawing, as inline vector art authored for
 * this template (no external asset files). Gradient ids carry a `kv-` prefix
 * so they never collide with another drawing on the page.
 */

const GOLD_STOPS = (
  <>
    <stop offset="0" stopColor="#8a6634" />
    <stop offset="0.35" stopColor="#d9bb83" />
    <stop offset="0.5" stopColor="#f3e2bb" />
    <stop offset="0.65" stopColor="#c9a468" />
    <stop offset="1" stopColor="#8a6634" />
  </>
);

const LEAF = "M0 0C3-5 9-7 14-6 11-1 5 2 0 0Z";

/** Leaf placements of the two branches rising around the monogram ring (pure, precomputed once). */
const WREATH_LEAVES: readonly string[] = (() => {
  const leaves: string[] = [];
  const radius = 100;
  const point = (angle: number) => [120 + radius * Math.cos((angle * Math.PI) / 180), 120 + radius * Math.sin((angle * Math.PI) / 180)] as const;
  for (const side of [-1, 1] as const) {
    const start = side < 0 ? 98 : 82;
    const end = side < 0 ? 228 : -48;
    const count = 17;
    for (let index = 0; index < count; index += 1) {
      const angle = start + (end - start) * (index / (count - 1));
      const [x, y] = point(angle);
      const tangent = angle + (side < 0 ? 90 : -90);
      const scale = 1.25 - (index / count) * 0.55;
      for (const flip of [1, -1] as const) {
        const rotation = tangent + flip * 38 * side;
        leaves.push(`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rotation.toFixed(1)}) scale(${scale.toFixed(2)} ${(scale * flip).toFixed(2)})`);
      }
    }
  }
  return leaves;
})();

const STEMS: readonly string[] = (() => {
  const radius = 100;
  const point = (angle: number) => `${(120 + radius * Math.cos((angle * Math.PI) / 180)).toFixed(1)} ${(120 + radius * Math.sin((angle * Math.PI) / 180)).toFixed(1)}`;
  return [`M${point(98)}A${radius} ${radius} 0 0 1 ${point(228)}`, `M${point(82)}A${radius} ${radius} 0 0 0 ${point(-48)}`];
})();

/** The gold olive wreath with the couple's initials and the dotted date. */
export function Monogram({ first, second, date, className }: { first: string; second: string; date: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="kv-mono-gold" x1="0" y1="0" x2="1" y2="1">
          {GOLD_STOPS}
        </linearGradient>
      </defs>
      <circle cx="120" cy="120" r="104" fill="none" stroke="url(#kv-mono-gold)" strokeWidth="0.8" opacity="0.7" />
      {STEMS.map((d) => (
        <path key={d} d={d} fill="none" stroke="url(#kv-mono-gold)" strokeWidth="0.9" />
      ))}
      <g fill="url(#kv-mono-gold)">
        {WREATH_LEAVES.map((transform) => (
          <path key={transform} d={LEAF} transform={transform} />
        ))}
      </g>
      <text x="86" y="138" textAnchor="middle" fontSize="58" fill="url(#kv-mono-gold)" style={{ fontFamily: "var(--kv-serif)" }}>
        {first}
      </text>
      <text x="154" y="146" textAnchor="middle" fontSize="58" fill="url(#kv-mono-gold)" style={{ fontFamily: "var(--kv-serif)" }}>
        {second}
      </text>
      <text x="121" y="134" textAnchor="middle" fontSize="34" fill="url(#kv-mono-gold)" style={{ fontFamily: "var(--kv-script)" }}>
        &amp;
      </text>
      <text x="120" y="182" textAnchor="middle" fontSize="9.5" letterSpacing="3.2" fill="#8a6634" style={{ fontFamily: "var(--kv-sans)" }}>
        {date}
      </text>
    </svg>
  );
}

/** The embroidered lace row along the bottom edge of the veil. */
export function LaceRow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 30" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="kv-lace" width="26" height="30" patternUnits="userSpaceOnUse">
          <path d="M0 22Q6.5 12 13 22T26 22" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="0.9" />
          <circle cx="13" cy="14" r="2.1" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="0.8" />
          <circle cx="13" cy="14" r="0.7" fill="#fff" />
          <circle cx="0" cy="26" r="0.9" fill="#fff" fillOpacity="0.9" />
          <circle cx="26" cy="26" r="0.9" fill="#fff" fillOpacity="0.9" />
          <path d="M13 11.5C11.6 8.8 12 6.6 13 5.4 14 6.6 14.4 8.8 13 11.5Z" fill="#fff" fillOpacity="0.8" />
        </pattern>
      </defs>
      <rect width="400" height="30" fill="url(#kv-lace)" />
    </svg>
  );
}

function GoldDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" x2="1">
        <stop offset="0" stopColor="#a47b44" />
        <stop offset="0.5" stopColor="#e2c690" />
        <stop offset="1" stopColor="#a47b44" />
      </linearGradient>
    </defs>
  );
}

/** A short gold vine used as a section divider. */
export function Vine({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 180 24" aria-hidden="true" focusable="false">
      <GoldDefs id="kv-vine-gold" />
      <g fill="url(#kv-vine-gold)">
        <path d="M8 12H76M104 12H172" stroke="url(#kv-vine-gold)" strokeWidth="0.8" fill="none" />
        <path d="M90 4C94 8 94 16 90 20 86 16 86 8 90 4Z" />
        <path d="M80 12C83 8 87 8 88 12 87 16 83 16 80 12ZM100 12C97 8 93 8 92 12 93 16 97 16 100 12Z" opacity="0.75" />
      </g>
    </svg>
  );
}

/** Two interlocked wedding rings. */
export function Rings({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <GoldDefs id="kv-rings-gold" />
      <g fill="none" stroke="url(#kv-rings-gold)" strokeWidth="1.6">
        <circle cx="15" cy="23" r="9" />
        <circle cx="25" cy="23" r="9" />
        <path d="M22 10l3-4 3 4-3 3z" fill="url(#kv-rings-gold)" strokeWidth="0.6" />
      </g>
    </svg>
  );
}

/** The gold heart that marks the wedding day on the calendar. */
export function Heart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <GoldDefs id="kv-heart-gold" />
      <path
        d="M20 35C8 26 3 19 3 12.5 3 7 7.5 3.5 12 3.5c3.6 0 6.3 2 8 5 1.7-3 4.4-5 8-5 4.5 0 9 3.5 9 9 0 6.5-5 13.5-17 22.5Z"
        fill="url(#kv-heart-gold)"
      />
    </svg>
  );
}

/** The ivory satin bow on top of the gift card. */
export function Bow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 70" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="kv-satin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf9" />
          <stop offset="0.45" stopColor="#f4e3d7" />
          <stop offset="1" stopColor="#d9b9a3" />
        </linearGradient>
      </defs>
      <path d="M57 32C40 10 14 6 8 16s8 30 49 18Z" fill="url(#kv-satin)" stroke="#caa385" strokeWidth="0.8" />
      <path d="M63 32C80 10 106 6 112 16s-8 30-49 18Z" fill="url(#kv-satin)" stroke="#caa385" strokeWidth="0.8" />
      <path d="M20 16c10-2 24 4 33 14M100 16c-10-2-24 4-33 14" fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M55 36C48 46 40 58 32 68l10-2 4 4c5-10 10-22 13-32ZM65 36c7 10 15 22 23 32l-10-2-4 4c-5-10-10-22-13-32Z" fill="url(#kv-satin)" stroke="#caa385" strokeWidth="0.8" />
      <rect x="53" y="26" width="14" height="13" rx="5" fill="url(#kv-satin)" stroke="#caa385" strokeWidth="0.8" />
    </svg>
  );
}

/** The ivory gift box with a gold ribbon; `lidClassName` lets the lid lift on press. */
export function GiftBox({ className, lidClassName, sparkClassName }: { className?: string; lidClassName?: string; sparkClassName?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 112" aria-hidden="true" focusable="false">
      <GoldDefs id="kv-box-ribbon" />
      <defs>
        <linearGradient id="kv-box-paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="0.55" stopColor="#f3e7d6" />
          <stop offset="1" stopColor="#e4d0b4" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="106" rx="40" ry="4" fill="#8a6634" opacity="0.14" />
      <rect x="18" y="48" width="84" height="56" rx="3" fill="url(#kv-box-paper)" stroke="#b48c55" strokeWidth="1" />
      <rect x="53" y="48" width="14" height="56" fill="url(#kv-box-ribbon)" />
      <path d="M18 60h84" stroke="#b48c55" strokeOpacity="0.35" />
      <g className={lidClassName}>
        <rect x="12" y="34" width="96" height="16" rx="3" fill="url(#kv-box-paper)" stroke="#b48c55" strokeWidth="1" />
        <rect x="52" y="34" width="16" height="16" fill="url(#kv-box-ribbon)" />
        <path d="M60 34C50 18 30 14 28 24s14 12 32 10Z" fill="url(#kv-box-ribbon)" />
        <path d="M60 34C70 18 90 14 92 24s-14 12-32 10Z" fill="url(#kv-box-ribbon)" />
        <path d="M60 34c-6-8-17-12-23-9M60 34c6-8 17-12 23-9" fill="none" stroke="#fff6df" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
        <circle cx="60" cy="33" r="5" fill="#c9a468" stroke="#8a6634" strokeWidth="0.6" />
      </g>
      <g className={sparkClassName} fill="#e6c98f">
        <path d="M22 18l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" />
        <path d="M98 10l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" />
        <path d="M104 40l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" />
      </g>
    </svg>
  );
}
