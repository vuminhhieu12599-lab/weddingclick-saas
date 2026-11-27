# WeddingClick — Working Rules (lean)

**Effective:** 2026-11-27. Replaces the 900-line rulebook (kept in git history).
**Stage:** pre-revenue. Goal now: sell during wedding season, grow to 10–12 templates fast.
Optimize for **speed and low token cost**, but never break the "hard rules" below.

## Product in one paragraph

WeddingClick is an online wedding-invitation service. Staff (the owner) create a
Project per customer, fill in wedding data, pick a template, send a review link,
then publish. Guests open the published invitation, often via a personal link,
and can RSVP. Customers use secure token links (intake / review / portal), not accounts.
Stack: Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Supabase, Vercel.

## How to work

- Read only what the task needs. `docs/` is **reference, not required reading**.
  Open a doc only when the task touches that area (e.g. `docs/SECURITY.md` for
  tokens/RLS, `docs/DATABASE.md` for schema, `docs/TEMPLATE_SYSTEM.md` for the
  renderer pipeline). `docs/DECISIONS.md` is history; search it, don't read it whole.
- Keep changes focused on the task. Small, obvious improvements nearby are fine;
  big refactors need the owner's OK.
- When something is ambiguous **and** it touches money, customer data, security,
  publish behavior or wedding correctness: ask. Otherwise pick the simplest option
  and mention it.
- End each task with a short report in **Vietnamese**: what changed, how to try it,
  anything risky or unverified. No long templates.

## Hard rules (never break)

1. **Wedding correctness.** Date, weekday, time, lunar text and countdown all come
   from the same canonical event value (timezone `Asia/Ho_Chi_Minh` by default).
   Never hard-code dates or weekdays.
2. **Variants.** COMMON / GROOM / BRIDE are views of one Project's data; never copy
   couple/family/event data per variant. GROOM → groom first, "Lễ Thành Hôn";
   BRIDE → bride first, "Lễ Vu Quy". Variant logic lives in the shared resolver,
   never inside a template.
3. **Templates are presentation only.** They receive `{ viewModel, sections, capabilities }`
   and must not query Supabase, write RSVP, check permissions, or compute dates.
4. **Save ≠ Publish.** Public pages render from the published snapshot, never from
   draft data.
5. **Don't change what a paying customer already published.** Once a real customer
   has published on a template version, visual changes go into a new version
   (`...v2`). Before the first customer, editing a version in place is fine.
6. **Security.** No secrets in code, logs or docs; service-role key server-only;
   no anonymous write access to internal tables; customer/guest links use opaque
   tokens, never names or IDs. RSVP success is shown only after the server confirms.
7. **Database.** Schema changes only via a new file in `supabase/migrations/`.
   No destructive migration without the owner's explicit OK.
8. **Git.** Never commit directly to `weddingclick-v2` (it auto-deploys to Production).
   Work on a branch, open a PR. No `reset --hard`, `clean -fd` or force-push.
   Don't overwrite the owner's uncommitted work.

## Checks (keep them proportional)

| Change touches | Run |
|---|---|
| Only a template's look (CSS, layout, decor, copy) | `npm run typecheck` + look at it at 390 px wide |
| Shared logic (`lib/domain`, `lib/invitation-rendering`, `lib/server`, `templates/core`) | `npm run typecheck` + `npm test` |
| Before merging into `weddingclick-v2` | `npm run build` must pass |

Write new tests only for logic (dates, variants, RSVP, tokens, money), not for visuals.
Don't spend effort on screenshots/visual-review artifacts unless asked.

## Templates

- Templates live in `templates/wedding/<code>/`; registry in `templates/core/`.
- Fonts must render Vietnamese diacritics correctly and be licensed for commercial web use.
- Mobile first (check 390 px). Respect `prefers-reduced-motion` for heavy motion.
- Showroom: when a template goes public, add/update its entry in
  `lib/showroom/showroom-catalog.ts` with two real 780×1688 WebP screenshots
  (`public/showroom/templates/<code>-cover.webp`, `-inside.webp`).
  Public site: `weddingclick.vercel.app`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
