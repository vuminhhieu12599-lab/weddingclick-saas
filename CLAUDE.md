# WeddingClick V2 — Claude Development Rules

**Status:** Approved project rules  
**Effective date:** 2026-09-10  
**Scope:** All WeddingClick V2 work in this repository

## 0. Purpose

WeddingClick is a production-oriented invitation creation and project-management platform. The first supported event type is **WEDDING**.

WeddingClick V1 is an internal-service workflow product, not a generic website builder and not a Canva clone. WeddingClick staff create and manage projects. Customers interact through secure links for information intake, review, RSVP management, and guest-link tools. Wedding guests interact only with published invitation pages and RSVP features.

The engineering priorities are, in order:

1. Correctness of wedding information.
2. Security and data isolation.
3. Predictable draft/review/publish behavior.
4. Mobile usability and invitation quality.
5. Maintainability and extensibility.
6. Delivery speed.

Speed never justifies violating documented architecture.

---

## 1. Source of Truth and Mandatory Reading

Before making any non-trivial code change, read:

- `CLAUDE.md`
- `docs/DECISIONS.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/TEMPLATE_SYSTEM.md`
- `docs/TYPOGRAPHY_AND_MOTION.md`
- `docs/SECURITY.md`
- `docs/DEVELOPMENT_RULES.md`
- `docs/TESTING.md`
- `docs/API_CONTRACT.md` (when the task touches Route Handlers, server actions, business-action RPCs, or activity logging)

Read `docs/ROADMAP.md` when the task affects milestone sequencing.
Read `docs/LEGACY_AUDIT.md` when changing or removing V1 behavior.

Repository documentation is the source of truth. Do not rely on previous chat context or assumptions when repository documentation exists.

If the current task conflicts with approved documentation:

1. Stop.
2. Explain the conflict.
3. Do not edit code until the conflict is resolved.

Never silently reinterpret approved business rules.

---

## 2. Task Scope Rule

Only modify code required for the current approved task.

Do **not**:

- redesign unrelated screens;
- refactor unrelated modules;
- rename unrelated files;
- change database schema outside the approved migration;
- modify invitation templates while working on unrelated backend tasks;
- install packages unless they are necessary for the approved task;
- replace an existing architectural pattern without approval;
- perform opportunistic “cleanup” outside task scope;
- implement future-roadmap features merely because they are convenient now.

If unrelated technical debt is discovered, report it under **Technical Debt Found** and leave it unchanged unless the current task explicitly includes it.

Every task must remain small enough to review.

---

## 3. No Broad Rewrite

Never rewrite the whole WeddingClick application without explicit approval.

For existing V1 code use this classification:

- **KEEP** — preserve behavior/code with minimal change.
- **REFACTOR** — preserve behavior while improving implementation.
- **REBUILD** — replace architecture while preserving required business capability.
- **REMOVE** — remove only after replacement has passed validation and removal is explicitly approved.

Do not delete legacy V1 tables, routes, assets, or templates merely because V2 replacements exist.

---

## 4. Core Domain Rule: One Project, One Canonical Data Source

A WeddingClick `Project` represents one customer order/event.

For wedding projects there must be one canonical set of wedding data.

Correct model:

```text
Project
 ├─ Wedding Details
 ├─ Events
 ├─ Media
 ├─ Design
 └─ Invitations
      ├─ COMMON
      ├─ GROOM
      └─ BRIDE
```

Forbidden model:

```text
GROOM invitation -> copied groom/bride/family/event data
BRIDE invitation -> copied groom/bride/family/event data
COMMON invitation -> copied groom/bride/family/event data
```

Never duplicate canonical groom, bride, family, event, venue, or project data between invitation variants.

Invitation variants are different views of the same Project data.

---

## 5. Invitation Variant Rules

Supported wedding invitation variants:

- `COMMON`
- `GROOM`
- `BRIDE`

Business rules must be implemented in one centralized variant resolver/domain layer, not independently inside each template.

### GROOM

- Groom is the primary person.
- Bride is the secondary person.
- Groom-side family is primary.
- Wedding wording uses **“Lễ Thành Hôn”** where applicable.

### BRIDE

- Bride is the primary person.
- Groom is the secondary person.
- Bride-side family is primary.
- Wedding wording uses **“Lễ Vu Quy”** where applicable.

### COMMON

- Appropriate information from both families is shown.
- Both sides remain first-class; do not arbitrarily treat one side as the only family.

Every feature that can affect wedding invitation rendering must answer the **Rule of Three**:

1. What happens for `COMMON`?
2. What happens for `GROOM`?
3. What happens for `BRIDE`?

If this is undefined, the feature is incomplete.

---

## 6. Template Separation Rule

Templates are presentation components.

Templates must **not**:

- query Supabase directly;
- insert/update RSVP records directly;
- calculate authorization or role permissions;
- parse raw database records;
- decide publication status;
- implement GROOM/BRIDE business rules;
- independently calculate weekday/date/countdown logic;
- construct or validate guest authorization;
- contain customer-specific hard-coded wedding data;
- own pricing/business workflow logic.

Approved flow:

```text
Database
  -> Domain Services
  -> InvitationViewModel
  -> Template Renderer
```

Do not bypass this flow.

---

## 7. Date and Time Correctness

Wedding date/time correctness is production-critical.

Never hard-code:

- weekday names;
- calendar dates;
- number of days in a month;
- countdown targets;
- ceremony date text;
- ceremony time text derived separately from the canonical value.

Canonical event date/time values must use appropriate database date/time types.

Default timezone for Vietnamese WeddingClick projects is `Asia/Ho_Chi_Minh` unless a Project explicitly defines another timezone.

The following must derive from the same canonical event value:

- date;
- time;
- weekday;
- month;
- year;
- calendar display;
- countdown.

Any disagreement between those values is a **release-blocking bug**.

---

## 8. Draft / Review / Publish Separation

`SAVE` is not `PUBLISH`.

Required lifecycle:

```text
Mutable Draft
   -> Review Snapshot
   -> Customer Approval
   -> Published Snapshot
```

Editing draft data must never silently modify an already published invitation.

Published invitations must render from an immutable or effectively immutable published version/snapshot.

Public output changes only through an explicit publish/republish action.

Never make public invitation rendering depend directly on mutable Project draft data.

---

## 9. Template Versioning Rule

Template updates must not silently change previously published customer invitations.

Template implementation versions must be treated as immutable once used by production published invitations.

Example renderer keys:

```text
wedding.elegant-editorial.v1
wedding.elegant-editorial.v2
```

Do not edit `v1` to become visually different after customer invitations are published on it. Create `v2`.

Existing published projects stay on their previous template version until explicitly upgraded and republished.

---

## 10. Guest Personalization Rule

Personalized guest invitation text is intentionally flexible and free-form.

Examples:

- `Anh Hiếu và gia đình`
- `Chú B và người thương`
- `Em và sự cô đơn`
- `Team Marketing`

Do not force a structured honorific + legal-name model.

The canonical guest-facing field is conceptually `display_name`.

Optional metadata may include:

- invitation variant;
- group;
- phone;
- internal note.

Guest URLs must use secure opaque identifiers/tokens. The guest display name itself is never authorization.

Never trust URLs such as `?guest=NguyenVanA` as verified guest identity.

---

## 11. RSVP Rule

RSVP is a shared domain service, not template-specific logic.

Templates must never write directly to Supabase RSVP tables.

RSVP requests must be validated server-side.

### Personalized guests

- RSVP must link to the correct Guest record.
- One Guest should have one current RSVP state.
- Resubmission updates the valid current RSVP instead of creating uncontrolled duplicates.

### Non-personalized invitations

- Guest name may be collected manually.
- `guest_id` may be null.

A success message may be shown only after persistence has been confirmed by the server.

Never swallow RSVP persistence errors.

---

## 12. Customer Access Rule

Customers do not require normal WeddingClick accounts in V1.

Customers use secure Project-scoped access links/tokens.

Supported purposes:

- `INTAKE` — submit project/wedding information.
- `REVIEW` — view review version and submit feedback/approval.
- `PORTAL` — monitor RSVP and use Guest Tool when entitled.

Customer links must be:

- unpredictable;
- revocable;
- replaceable;
- scoped to one Project;
- scoped to one purpose/capability;
- validated server-side.

Do not use Project IDs, slugs, sequential numbers, or customer names as authorization.

Where feasible store only a cryptographic hash of raw access tokens in the database.

---

## 13. Authorization and Security

Frontend visibility is not authorization. Hiding a button is not security.

Sensitive operations must be protected by server/database authorization.

Never create unrestricted public write policies equivalent to:

```sql
USING (true)
WITH CHECK (true)
```

for internal data.

Anonymous users must never receive unrestricted CRUD access to:

- Projects;
- Customers;
- Wedding Details;
- Staff/Profiles;
- Project media administration;
- Guest lists;
- Internal Tasks;
- Activity Logs;
- Template administration.

Service-role keys must never be exposed to client-side code.

Never commit secrets.
Never print secrets to logs.
Never place secrets in documentation.

---

## 14. Database Migration Rule

All V2 schema changes must be represented by version-controlled migrations.

Never manually alter production schema and leave repository migrations out of sync.

Every migration must:

- have one clear purpose;
- use appropriate primary keys and foreign keys;
- use database constraints for critical integrity rules;
- create required indexes;
- intentionally configure RLS/security;
- avoid destructive changes unless explicitly approved;
- be independently reviewable.

Do not delete V1 tables until explicit removal approval.

Important uniqueness rules belong in the database when possible.

Example:

```text
(project_id, variant) UNIQUE
```

for invitation variants.

---

## 15. Validation Rule

Use layered validation:

- Client validation for usability.
- Server validation for trust boundaries and business correctness.
- Database constraints for data integrity.

Do not rely only on client-side validation.

Validate important categories including:

- UUIDs;
- access tokens;
- dates/times/timezones;
- event type;
- project status;
- invitation variant;
- URLs;
- RSVP party size;
- guest display input;
- media metadata;
- package/add-on entitlement;
- price snapshots.

Never trust client-provided role, Project ownership, price, entitlement, or authorization values.

---

## 16. Pricing Rule

Do not hard-code prices throughout UI components.

Current catalog values may come from package/add-on configuration.

A Project must preserve its agreed price snapshot.

Changing future package prices must not alter historical Project totals.

Money is stored as integer VND values unless a future documented architecture change says otherwise.

---

## 17. Media Rule

Media belongs to the Project/domain, not to one template implementation.

Changing templates must not require re-uploading Project media.

Do not store gallery URLs as comma-separated text.

Use normalized media records with:

- explicit media type;
- storage object path;
- sort order;
- metadata when needed.

Only authorized staff/server workflows may upload, replace, or delete media.

Published invitation media references must remain stable. Do not remove an asset still needed by a published version.

---

## 18. Editor Rule

WeddingClick V1 editor is configuration-driven, not free-form drag-and-drop.

Do not build a Canva-style editor unless a future approved roadmap item explicitly authorizes it.

Staff may configure approved options such as:

- template;
- curated palette;
- curated font preset;
- supported section visibility;
- music;
- approved template/effect options.

The template controls designed visual composition.

Do not expose controls that make it easy to destroy template art direction without explicit approval.

---

## 19. Typography Is a Product Capability

Typography is a core WeddingClick product feature.

WeddingClick must support a curated and extensible library of beautiful fonts across multiple styles, with verified Vietnamese diacritic/glyph coverage.

Do not add production fonts without checking:

- Vietnamese glyph coverage;
- web use rights;
- commercial use rights;
- loading/performance implications.

Never download random fonts from the internet and commit them without licensing verification.

Do not load the full font catalog on every invitation. Load only fonts required by the active template/preset.

Long Vietnamese names and uppercase Vietnamese text must be tested.

---

## 20. Motion Is a Product Capability

Motion/effects are core template capabilities, not decorative afterthoughts.

Use shared motion primitives/infrastructure plus template-specific art direction.

Do not duplicate animation engines independently inside each template.

Templates may expose curated effect presets such as disabled/light/standard/rich when appropriate.

Performance, readability, touch interaction, and mobile usability always override decorative motion.

Respect `prefers-reduced-motion` where applicable.

Avoid heavy endless particle effects and unnecessary animation loops.

---

## 21. Mobile First

Public invitation pages and customer-facing screens are mobile-first.

Primary QA widths include approximately:

- 360 px
- 390 px
- 430 px

Desktop remains supported.

A template is not complete merely because it looks correct on desktop.

---

## 22. Error Handling

Never silently ignore important errors.

Critical operations must report actual success/failure accurately, including:

- database save;
- RSVP submission;
- publish;
- customer approval;
- access-link generation;
- guest import;
- media upload/deletion.

Never show success until success is confirmed.

Log useful context without leaking secrets or unnecessary personal data.

---

## 23. No Silent Product Assumptions

Stop and ask before implementing an ambiguous choice that could materially affect:

- database architecture;
- security;
- customer data;
- pricing;
- package entitlement;
- publish behavior;
- wedding correctness;
- Project workflow;
- role permissions;
- variant behavior.

For low-risk implementation details that do not alter product behavior, choose the simplest documented architecture-consistent solution.

---

## 24. Dependency Rule

Do not install a package solely because it makes implementation convenient.

Before adding a dependency:

1. Check whether current project tools can solve the problem reasonably.
2. Explain why a new dependency is needed.
3. Prefer maintained and widely used packages.
4. Consider bundle/performance impact.

Do not replace the core stack without approval.

Current approved core stack:

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase
- Vercel

---

## 25. TypeScript and Code Quality

New V2 domain code must use strict TypeScript-friendly patterns.

Avoid broad `any`, unsafe casts, or disabled checks as a shortcut.

Shared domain concepts must be defined centrally rather than redefined throughout the project.

Examples:

- `ProjectStatus`
- `InvitationVariant`
- `EventType`
- `AccessLinkType`
- `PaymentStatus`
- `MediaType`

Prefer:

- small focused services;
- explicit domain types;
- composable UI;
- clear server/client boundaries;
- deterministic business logic;
- reusable domain rules.

Avoid:

- giant page components;
- duplicated business logic;
- repeated Supabase query code;
- deeply nested conditional UI;
- magic strings scattered across components;
- copy/paste invitation variants;
- template-specific backend behavior.

---

## 26. Change Safety Protocol

Before editing code:

1. Read the task and relevant docs.
2. Inspect `git status` and understand existing worktree changes.
3. Investigate the current implementation.
4. Identify affected modules and dependencies.
5. Describe the planned change.
6. Identify security/data/regression risks.
7. Only then edit.

After editing:

1. Inspect `git diff`.
2. Confirm no unrelated files were changed.
3. Run required checks.
4. Run task-specific manual verification where possible.
5. Report files changed.
6. Report database/security impact.
7. Report tests/checks run.
8. Report limitations and unverified areas.

Do not claim completion before this protocol is complete.

---

## 27. Required Checks

A task is not complete merely because code was written.

Run all applicable repository checks.

Target baseline checks for V2:

- lint;
- TypeScript/typecheck;
- unit/integration tests;
- production build;
- task-specific manual validation.

When E2E coverage exists, run relevant Playwright flows.

If a required check cannot be run, report exactly why.

Distinguish pre-existing failures from failures introduced by the task.

Never report PASS when the task introduced a failing required check.

---

## 28. Regression Rule

Changing shared code requires testing all affected consumers.

Examples:

- Variant resolver changed -> test COMMON + GROOM + BRIDE.
- InvitationViewModel changed -> test every active template.
- RSVP changed -> test personalized + non-personalized + customer RSVP dashboard.
- Event/date logic changed -> test editor + preview + published invitation + countdown + calendar.
- Publish/versioning changed -> verify draft changes do not alter current public output.

Shared changes require broader regression testing than isolated UI changes.

---

## 29. Template Certification

A wedding template cannot be marked production-ready until verified with:

- COMMON;
- GROOM;
- BRIDE;
- normal guest display;
- long Vietnamese guest display;
- playful/free-form guest display;
- no personalized guest;
- RSVP flow;
- with/without gallery;
- with/without music;
- with/without gift/bank information;
- missing optional content;
- correct event/date/time rendering;
- 360/390/430 px mobile widths;
- desktop;
- no critical console errors;
- reasonable performance;
- reduced-motion fallback where motion is used.

Do not mark a template active merely because it rendered once.

---

## 30. Production Blocking Bugs

The following are release blockers:

- wrong groom/bride identity or order;
- wrong family priority;
- GROOM incorrectly showing Vu Quy;
- BRIDE incorrectly showing Thành Hôn;
- inconsistent date/weekday/time/countdown;
- Guest A seeing Guest B personalization;
- unauthorized Project/customer/guest access;
- anonymous modification of internal data;
- false RSVP success;
- published invitation changing when mutable draft changes;
- predictable/insecure customer management access;
- broken public invitation link;
- critical broken mobile layout;
- customer data loss;
- exposed secret;
- destructive unapproved migration;
- active template with broken Vietnamese glyphs.

A release blocker must be resolved before production launch.

---

## 31. Git Safety

Do not work directly on `main` unless explicitly instructed.

Use the approved V2 development branch/workflow.

Before major tasks run `git status` and understand the worktree.

Never overwrite uncommitted user work.

Do not use destructive Git commands such as:

- `git reset --hard`
- `git clean -fd`
- force push

unless explicitly approved.

Commits must represent coherent tasks. Do not mix unrelated refactors into one feature commit.

---

## 32. Existing V1 Protection

The current V1 application is reference material while V2 is built.

Do not silently break functioning V1 routes before the corresponding V2 path is validated unless an approved task explicitly replaces them.

Do not delete legacy:

- database tables;
- routes;
- assets;
- templates;

until V2 replacement is validated and removal is explicitly approved.

---

## 33. Documentation Synchronization

If implementation changes an architectural contract, update the relevant docs in the same task.

Examples:

- new Project status;
- new InvitationViewModel field;
- new table/constraint;
- changed RLS strategy;
- new template capability;
- changed access-link behavior;
- changed package entitlement.

Code and approved documentation must not knowingly disagree.

---

## 34. Required Task Report

At the end of every implementation task provide:

### TASK SUMMARY
What was implemented.

### FILES CHANGED
All files intentionally changed.

### DATABASE CHANGES
Migration(s) added, or `None`.

### SECURITY IMPACT
What authorization/security surfaces changed, or `None`.

### TESTS / CHECKS RUN
Exact checks and results.

### RESULT
`PASS`, `PARTIAL`, or `BLOCKED`.

### KNOWN LIMITATIONS
Anything not covered or not yet verified.

### MANUAL TEST STEPS
Specific steps a human should use to verify the task.

Do not finish with only “Done.”

---

## 35. Primary Engineering Principle

Do not optimize for the fewest lines of code or the fastest implementation.

Optimize for:

- correctness;
- security;
- maintainability;
- predictability;
- reusable domain logic;
- high-quality mobile experience;
- WeddingClick business requirements.

When a shortcut conflicts with a documented architectural rule, follow the architectural rule.