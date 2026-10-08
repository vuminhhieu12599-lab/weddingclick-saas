# WeddingClick V2 — Six-Week Delivery Roadmap

**Planning start:** 2026-09-10  
**Goal:** Commercial soft launch during October 2026, subject to quality gates  
**Status:** Approved planning baseline

## Delivery Philosophy

The roadmap is milestone-driven, not feature-rush-driven.

Three release gates matter more than calendar dates:

1. **Foundation Ready** — core architecture/security/Project model works.
2. **Product Complete** — a Project can flow end-to-end through publish and RSVP.
3. **Production Ready** — UI, templates, security, mobile and QA meet launch criteria.

No milestone is complete while release blockers remain.

---

## Week 1 — Foundation

**Target window:** 10–16 September 2026

### Goals

- Lock repository rules/docs.
- Establish V2 branch/workflow.
- Produce approved physical database plan.
- Add V2 migration foundation without deleting V1.
- Establish role/profile model.
- Build Customer + Project core.
- Establish package/add-on price snapshot model.
- Establish baseline test/typecheck tooling as approved.

### End-of-week user capability

```text
Admin/Staff login
   ↓
Create Customer
   ↓
Create Project
   ↓
Choose package/add-on
   ↓
Assign staff
   ↓
Set deadline/status
```

### Gate

Do not move into full invitation/template implementation until Project domain and security direction pass review.

---

## Week 2 — Project Core & Intake

**Target window:** 17–23 September 2026

### Goals

- Wedding Details.
- Project Events with canonical date/time.
- Project Media model/storage flow.
- Project Design shell.
- Intake access link.
- Customer intake form.
- Intake submission review/apply workflow.
- Payment status/manual record.
- Lightweight Project timeline/tasks as needed.

### End-of-week user capability

```text
Staff creates Project
   ↓
Creates Intake Link
   ↓
Customer submits wedding information
   ↓
Staff reviews/applies submission
   ↓
Project has canonical wedding data
```

### Quality focus

- no duplicate wedding data per invitation;
- date/time typed correctly;
- customer submission cannot silently overwrite final data;
- customer token scoped and revocable.

---

## Week 3 — Invitation Engine & First Template

**Target window:** 24–30 September 2026

### Goals

- Central domain types.
- Variant Resolver.
- InvitationViewModel builder.
- Template registry/manifest.
- Template code versioning convention.
- Project Design editor controls.
- Preview surface.
- Review/publish validation framework.
- Build one flagship template to full architecture compliance.

### First template target

**Elegant Editorial V1** as the architecture proving template.

Must support:

- COMMON;
- GROOM;
- BRIDE;
- guest personalization;
- gallery;
- music;
- countdown/calendar;
- map/venue;
- RSVP UI;
- gift section;
- mobile + desktop;
- font/effect presets.

### Gate

Template #2 and #3 should not proceed until Template #1 proves the shared architecture works without template-specific business hacks.

---

## Week 4 — Review, Publish, Customer Portal, Guests, RSVP

**Target window:** 1–7 October 2026

### Goals

- Review snapshots/versioning.
- Review Link.
- Customer feedback/approval.
- Published snapshot lifecycle.
- Stable public invitation URL.
- Customer Portal.
- Guest Tool entitlement.
- Manual guest creation.
- Excel import/export workflow. *(Out of pilot scope — owner decision D8, `docs/DECISIONS.md` "Launch Hardening 01".)*
- Secure guest token resolution.
- RSVP server flow.
- RSVP dashboard/reporting.

### End-of-week end-to-end flow

```text
Create Project
→ Intake
→ Design
→ Preview
→ Review
→ Customer revision/approval
→ Mark paid
→ Publish
→ Public invitation
→ Customer Portal
→ Personalized guest (if purchased)
→ Guest RSVP
→ Customer sees RSVP result
```

### Gate

This is **Product Complete** only if the end-to-end flow works with realistic fictional test data and draft edits do not mutate published output.

---

## Week 5 — UI Polish, Operations & Template Portfolio

**Target window:** 8–14 October 2026

### Goals

- Internal Dashboard UX.
- Project list filters/search.
- Deadline/overdue visibility.
- Statistics useful for operations.
- Staff/Admin surfaces as required.
- Customer Portal polish.
- Complete 3 launch templates:
  - Elegant Editorial;
  - Vietnamese Heritage;
  - Romantic Minimal.
- Curated Vietnamese font library initial set.
- Curated effect/motion presets.
- Security hardening review.

### UI priorities

- Admin: efficient, clear, professional.
- Customer Portal: extremely simple mobile UX.
- Invitation: differentiated, premium, emotional.

---

## Week 6 — Feature Freeze, QA & Soft Launch

**Target window:** 15–21 October 2026

### Feature Freeze

No new non-critical feature work.

Allowed work:

- bug fixes;
- QA fixes;
- security fixes;
- performance improvements;
- visual polish required to meet approved template quality;
- deployment/release configuration.

### Mandatory QA

- all critical end-to-end flows;
- all three invitation variants;
- all active templates;
- long/free-form Vietnamese guest names;
- RSVP update behavior;
- access-link revocation;
- unauthorized access tests;
- draft/published isolation;
- mobile widths;
- real browser checks;
- production build;
- console/network review;
- storage permissions;
- secret/client-bundle review.

### Soft Launch

Start with a small controlled number of real customers after Production Ready gate.

*Amended 2026-10-06 (Launch Hardening 01):* the first real customer is a single closely-supported **pilot** admitted at the **Pilot Ready** gate below, before full Production Ready. See "Pilot Launch Hardening".

Observe real-world issues before high-volume sales.

---

## Pilot Launch Hardening

**Recorded:** 2026-10-06 (Launch Hardening 01). Owner decisions D1–D8: `docs/DECISIONS.md` "Launch Hardening 01 — Pilot Launch Strategy and Owner Decisions".

**Strategy.** The first real pilot customer uses **Elegant Editorial only**. It does not wait for Vietnamese Heritage or Romantic Minimal productionization. WeddingClick stays a staff-operated service workflow (not self-service), with manual/offline payment.

### P0 — must complete before the first pilot customer

| ID | Item |
|---|---|
| P0-1 | Staff active access-link list + revoke — **COMPLETE / FROZEN** at `29bcc141ad56e59f4b96d334fdd422e29901c95b` (Launch Hardening 02, `docs/API_CONTRACT.md` §33) |
| P0-2 | Republish after `PUBLISHED` — **COMPLETE / FROZEN** at `69915dec1ae294554e969e605669e923a77d105b`; migration 0044 applied and DEV-verified (Launch Hardening 04, `docs/API_CONTRACT.md` §35) |
| P0-3 | Staff Customer + Project creation UI — **COMPLETE / FROZEN** at `01a4155494836650068f45788d8730f0d63078c7` (Launch Hardening 03, `docs/API_CONTRACT.md` §34) |
| P0-4 | Separate Production Supabase — **COMPLETE**. `WeddingClick Production` is a separate Singapore project on the Free plan for the no-charge pilot; clean Production has the canonical 46 migrations through 0044 and its initial active ADMIN profile. The paid-tier part of D4 is superseded for this pilot by Launch Hardening 05. |
| P0-5 | Production host/environment — **COMPLETE for the lean-free pilot**. Vercel Hobby serves Production from `weddingclick-v2`; Production env is complete; `weddingclick-saas.vercel.app` is the temporary Production origin. Preview and Production temporarily share the same KV/Upstash store but use separate HMAC secrets; a dedicated store, paid tiers and a custom domain are deferred until commercial use / quota need / owner request (Launch Hardening 05). |
| P0-6 | Minimum operations/recovery runbook — **COMPLETE**: `docs/PILOT_OPERATIONS_RUNBOOK.md`. |
| P0-7 | Docs status synchronization — **COMPLETE** (Launch Hardening 05, 2026-10-07). |
| P0-8 | Facebook/Zalo crawler validation on Production HTTPS — **PASS 2026-10-07** on the temporary Vercel Production origin. Both crawlers reached the public GROOM invitation and read the expected title/description. The smoke fixture had no configured `SOCIAL_SHARE_COVER`; inferred-image warnings/preview are not a blocker. |
| P0-9 | Final Production release smoke — **PASS 2026-10-07**: staff login → Customer/Project → required data → Elegant Editorial v1 → Review/approval → payment → publish → both public invitations → generic RSVP → Portal → Guest Tool → personalized link → personalized RSVP; no runtime error observed during the gate. |

### Accepted debt

**P1 — pilot follow-up:**
- real-device music check;
- Vietnamese glyph spot-check;
- staff Auth hardening / MFA consideration;
- verify Production PostgREST `max_rows` = 1000;
- personalized OG enhancement (deferred by owner decision D7);
- replace the temporary shared Preview/Production KV store with a dedicated Production store before commercial/high-volume use;
- move from Supabase Free / Vercel Hobby only when the owner requests commercial launch or quota/reliability needs justify it;
- attach and validate the owner's new custom domain when purchased, then rerun Facebook/Zalo crawler validation on that canonical origin.

**P2 — after the pilot:**
- Guest Excel import;
- Intake UI;
- 100-row Admin Project list cap;
- Admin mobile shell;
- RSVP pagination;
- Vietnamese Heritage productionization;
- Romantic Minimal productionization;
- statistics/reporting;
- QR/messaging;
- add-on-revocation policy;
- pre-existing V1 theme lint defects.

### Pilot Ready Definition

WeddingClick is **Pilot Ready** for **one closely-supported customer using Elegant Editorial only** when:

- all P0 items are complete/frozen or explicitly satisfied by the owner-approved lean-free exception;
- Production Supabase is a separate project from DEV/STAGING;
- the Production Vercel environment is complete and tracks `weddingclick-v2`;
- the temporary shared Preview/Production KV store is explicitly accepted for the no-charge pilot and the environments use different HMAC secrets;
- the final Production smoke passes;
- Facebook/Zalo crawler/share validation passes;
- the operations/recovery runbook exists;
- the known P1/P2 debts are explicitly accepted;
- Staff use desktop from the current Production origin (`weddingclick-saas.vercel.app`) until the owner buys the replacement custom domain.

**Status 2026-10-07: PASSED — WEDDINGCLICK V2 IS PILOT READY** for the tightly supported, no-charge Elegant Editorial pilot described above.

**Pilot Ready is not Production Ready.** It makes no claim of three-template commercial completeness, paid-infrastructure SLAs, high-volume readiness or a final custom domain; the Production Ready Definition below is unchanged.

---

## Template-first Editor Track

**Recorded:** 2026-10-08 (TE-01, docs-only contract closure). Contract: `docs/DECISIONS.md` "TE-01 — Template-first Editor, Template Media Slots and Staff Approval-on-Behalf". VH-02A was paused until TE-04 and resumed and completed afterwards (2026-10-08). Nothing in this track changes an approved invitation design; any implementation that would requires a Product Owner decision first.

| Checkpoint | Purpose | Schema / migration | Production impact | Likely files | Risk | Acceptance gate |
|---|---|---|---|---|---|---|
| **TE-01** | Contract closure (this record) | None | None | `docs/DECISIONS.md`, `docs/TEMPLATE_SYSTEM.md`, `docs/ROADMAP.md` | Low | Docs reviewed; no runtime/VH-02A file touched |
| **TE-02** — COMPLETE (2026-10-08) | `TemplateEditorManifestV1` type + validator; Elegant Editorial v1 (`LEGACY_ROLES`) and Vietnamese Heritage v1 (`TEMPLATE_SLOTS`) editor manifests; fail-closed production editor registry + lookup. No API surface (the Staff catalog projection moves to TE-05A) | None | None at runtime (code only, merged later) | `templates/core/editor-manifest.ts`, `templates/core/production-editor-manifests.ts`, `templates/editor/wedding/*.ts` (outside renderer-version directories), tests | Low–Medium (manifest drift) | Key-set equality with production manifests; fail-closed validator tests; EE output unchanged |
| **TE-03A** — COMPLETE (2026-10-08) | Remove unapplied `PORTRAIT_COUPLE` / 0045 and its propagation; supersede VH-M01; record T9 (shared slots) and T12 (`staff_note`) decisions | Deletes the unapplied 0045 file only, after verifying DEV + Production migration history lacks it | None | 0045 file, `lib/domain/media-type.ts`, `lib/admin/optional-content-editor.ts`, snapshot/ViewModel types + builder + media refs, `portrait-couple.test.tsx`, six migration-head guards, docs | Low (never applied) | Typecheck/tests green; migration list ends at 0044; no environment lists 0045 |
| **TE-03B** — COMPLETE (2026-10-08; 0046 applied/verified on DEV only, Production at 0044) | Project media library (`PHOTO`) + `project_template_media_slot_items` + `set_project_template_media_slot` RPC + staff gateway/use cases (no HTTP route until TE-05A) | **Yes**: one new migration numbered 0046 or later (0045 is retired); DEV first, owner-applied | None until applied to Production with a release | migration, `lib/server/template-media/*`, internal API route, `docs/PHYSICAL_DATABASE_PLAN.md`, `docs/API_CONTRACT.md`, `docs/DATABASE.md`, tests | Medium (RLS, FK delete semantics) | Disposable replay: RLS denies anon/customer, same-Project FK, cascade vs direct delete (T4), atomic replace/reorder, R15 untouched |
| **TE-04** — COMPLETE (2026-10-08) | Snapshot `media.templateSlots` + builder branching + media-ref pinning + read-side validation + ViewModel `media.templateSlots` | None | Shared rendering pipeline (EE must be byte-identical) | `lib/invitation-rendering/*`, `lib/server/invitation-snapshot/*`, review/public read paths, tests | **High** (shared pipeline, pinning) | EE payloads byte-identical; slot ids pinned; historical snapshots render unchanged; COMMON/GROOM/BRIDE tested with one shared slot set |
| **TE-05A** — COMPLETE (2026-10-08) | Template-first editor in the current tabs: catalog `editorManifest`, slot/photo-library/readiness Staff routes, photo library + slot picker, template-filtered optional content, readiness panel | None | Staff UI + 3 Staff read/write routes | `app/admin/v2/projects/[projectId]/_components/*`, `lib/admin/*`, `lib/server/template-editor/*`, `lib/server/routes/template-editor.ts` | Medium (UX regression of the pilot editor) | EE legacy roles still editable; VH slots assignable; readiness states per T10; 360/390/430 + desktop |
| **TE-05B** | Workspace restructure: Tổng quan + stage model (T11, T13) | None | Staff UI only | `workspace-tabs.tsx`, new overview component, presentation labels | Low–Medium | Every existing action still reachable; stage table matches T13; no backend change |
| **TE-06** | Staff approval on behalf (T12) | **Yes**: additive `review_feedback` columns + `staff_confirm_review_approval` RPC | Production on release (may be pulled forward for the EE pilot, F11) | migration, `lib/server/invitation-review/*`, internal route, Duyệt tab, `docs/API_CONTRACT.md` | Medium (approval correctness) | Exact current REVIEW only; CAS 409; STAFF/ADMIN only; customer path unchanged; outcome recompute; activity actor STAFF |
| **VH-02A** — COMPLETE (2026-10-08) | VH media reads re-pointed to `templateSlots` (hero / three-photo `portraitCluster` / Love Story photo / gallery, no legacy fallback); approved static visuals finished; eight authorized WebP decor derivatives; vector Song Hỷ; rulings D1, D3–D5 (`docs/DECISIONS.md` "VH-02A") | None | None (VH not in Production; no catalog seed) | VH renderer files, decor, tests, docs | Medium | Real-pipeline slot fixtures; 3/2/1/0 portrait matrix; static asset/boundary guards; DEV visual QA still pending |
| **VH-02A-QA1 + VH-02B-E1** — COMPLETE (2026-10-08) | PO preview fixes: long-name typography, uncropped album prints, Directions CTA pinned to canonical `mapUrl`; essential islands: RSVP (`capabilities.rsvp`) and Gửi Quà Cưới dialog with clipboard copy; shared pure RSVP/copy models | None | None (VH DEV-only) | VH renderer, `lib/invitation-rendering/*-model`, tests, docs | Medium | Browser QA 360/390/430/1280; capability-gated tests |
| **VH-02B (remaining)** | Split-door opening, countdown, music, gallery lightbox, reveal motion | None | None | VH renderer | Medium | RF-05 capability rules; reduced motion |
| **RS-01** | `rendererKey`-based lazy renderer loading (T14) | None | Shared client host for all invitations | `templates/core/production-renderer-bindings.ts`, host core, tests | Medium–High | EE pages ship no VH chunk/CSS/font; fail-closed unknown key; all render paths regression-tested |
| **VH catalog / QA** | Catalog seeding (data-only migration) + certification matrix | **Yes** (seed) | Production only after certification and RS-01 | seed migration, docs | Medium | TEMPLATE_SYSTEM §25 matrix passed |

**TE-05A-H1 — COMPLETE (2026-10-08):** unsupported-renderer versions are never newly selectable (catalog, Design tab, server save). No schema change.

**Approved order after TE-05A:** VH-02A (COMPLETE) → VH-02A-QA1 + VH-02B-E1 (COMPLETE) → VH-02B (remaining) → TE-05B → TE-06 → RS-01 → Vietnamese Heritage DEV catalog seed + full Preview QA.

Ordering rules: TE-03A precedes any DEV migration run; TE-04 needs TE-02 + TE-03B; VH-02A resumes only after TE-04; RS-01 precedes any merge of Vietnamese Heritage into the Production branch. TE-06 is independent of the template track and may be scheduled earlier by the Product Owner.

---

## Production Ready Definition

WeddingClick should not be considered Production Ready merely because deployment succeeds.

Must have:

- no known release blockers;
- secure Project/customer/guest isolation;
- stable publish behavior;
- correct date/variant logic;
- RSVP reliability;
- 3 strong production templates minimum target;
- mobile usability;
- documented recovery/known limitations;
- successful build/tests;
- approved production Supabase security;
- basic abuse/rate-limiting controls on public RSVP submission and customer-token verification endpoints (`docs/SECURITY.md` §11) — implementation may be deferred during Weeks 1–4, but this is a mandatory gate, not optional, and Production Ready is not met without it. Tracked as the explicit pre-production security gate task in `docs/API_CONTRACT.md` §8 (Task 035). Status (2026-10-06): **COMPLETE.** **Task 035A** (V2 distributed abuse controls, `docs/API_CONTRACT.md` §31) is FROZEN at `cabb2010d62fb9ba9237434186a0d08fcecd7ef2`, and its controlled Preview smoke passed. **Task 035B** (Legacy V1 exposure containment, `docs/API_CONTRACT.md` §32) is FROZEN at `70ab2bf5ee2bf19b2202cce158d61555558701ae`, with migration 0043 applied and live-verified. This closes only this security criterion; the other Production Ready criteria above remain.

---

## Scope Control

Do not add these during the six-week core plan unless explicitly reprioritized:

- payment gateway;
- subscriptions;
- Canva drag/drop editor;
- customer accounts;
- birthday/thôi nôi implementation;
- mobile app;
- AI invitation generator;
- SMS/Zalo automation;
- template marketplace.

New ideas go to backlog rather than interrupting current milestone.

---

## Working Across Two Machines

GitHub is the source of truth.

Normal sequence:

```text
Machine A
→ pull latest
→ work
→ verify
→ commit
→ push

Machine B
→ pull latest
→ work
```

Do not sync the project by manually copying folders between Ubuntu and Windows.

Do not commit `.env`, secrets, `node_modules`, or `.next`.
