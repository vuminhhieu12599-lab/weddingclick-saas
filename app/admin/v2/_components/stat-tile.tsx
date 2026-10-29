const TONE_CLASSES = {
  neutral: { value: "text-slate-900", dot: "" },
  warning: { value: "text-amber-600", dot: "bg-amber-500" },
  danger: { value: "text-red-600", dot: "bg-red-500" },
} as const;

export type StatTileTone = keyof typeof TONE_CLASSES;

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: StatTileTone;
}) {
  // A tone only reads as an alert when there is something to act on, so a zero
  // count stays neutral instead of painting an empty queue red.
  const alerting = value > 0 && tone !== "neutral";
  const { value: valueClass, dot } = alerting ? TONE_CLASSES[tone] : TONE_CLASSES.neutral;

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">
        {alerting && <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dot}`} />}
        <span className="min-w-0">{label}</span>
      </p>
      <p className={`mt-2 text-3xl font-semibold leading-none tracking-tight tabular-nums ${valueClass}`}>{value}</p>
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{hint}</p>}
    </div>
  );
}
