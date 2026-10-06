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
| P0-1 | Staff active access-link list + revoke — **implemented and verified** (Launch Hardening 02, `docs/API_CONTRACT.md` §33; pending freeze) |
| P0-2 | Republish after `PUBLISHED` (owner decisions D2/D3) |
| P0-3 | Staff Customer + Project creation UI (owner decision D1) |
| P0-4 | Separate Production Supabase, PRO plan (owner decision D4) |
| P0-5 | Production Vercel Pro + environment + domain + isolated Production Upstash (owner decision D5) |
| P0-6 | Minimum operations/recovery runbook |
| P0-7 | Docs status synchronization — **done** (Launch Hardening 01) |
| P0-8 | Facebook/Zalo crawler validation on Production HTTPS |
| P0-9 | Final Production release smoke |

### Accepted debt

**P1 — pilot follow-up:**
- real-device music check;
- Vietnamese glyph spot-check;
- staff Auth hardening / MFA consideration;
- verify Production PostgREST `max_rows` = 1000;
- personalized OG enhancement (deferred by owner decision D7).

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

- all P0 items are complete and frozen;
- Production Supabase is separate;
- Production Vercel and Upstash are isolated from Preview;
- the final Production smoke passes;
- crawler/share validation passes;
- the operations/recovery runbook exists;
- the known P1/P2 debts are explicitly accepted;
- Staff use desktop from the canonical Production domain.

**Pilot Ready is not Production Ready.** It makes no claim of three-template commercial completeness; the Production Ready Definition below is unchanged.

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
