/**
 * One heading style for every block on an admin page: a small bold title with
 * an optional right-aligned hint, marked with the brand accent.
 */
export function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
        {/* WeddingClick burgundy — same value as the public showroom's --sr-burgundy. */}
        <span aria-hidden="true" className="h-3.5 w-[3px] shrink-0 rounded-full bg-[#74202f]" />
        {title}
      </h2>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
