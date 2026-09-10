# WeddingClick V2 — Development Workflow Rules

**Status:** Mandatory workflow  
**Last updated:** 2026-09-10

## 1. Purpose

This document defines how Claude Code should execute tasks so changes remain controlled, reviewable, and resistant to regressions.

Claude must not use a “read prompt -> immediately edit” workflow for non-trivial tasks.

---

## 2. Required Task Lifecycle

Every non-trivial task follows seven phases.

### PHASE A — READ

Read:

- `CLAUDE.md`;
- `docs/DECISIONS.md`;
- all task-relevant docs.

Do not assume remembered context is sufficient.

### PHASE B — INVESTIGATE

Before editing:

- inspect `git status`;
- inspect relevant source files;
- identify current data flow;
- identify current consumers/dependencies;
- identify legacy behavior that must remain untouched;
- inspect existing tests/scripts.

No edits during investigation unless the task explicitly says planning and implementation may be combined.

### PHASE C — PLAN

State:

- objective understood;
- files/modules expected to change;
- database impact;
- security impact;
- migration needs;
- regression risk;
- tests to run;
- assumptions/unknowns.

If the task is architecture-sensitive and the plan materially differs from docs, stop.

### PHASE D — IMPLEMENT

Make only approved changes.

Keep changes cohesive.

Do not fix unrelated technical debt.

### PHASE E — VERIFY

Run applicable:

- lint;
- typecheck;
- tests;
- production build;
- task-specific manual or automated validation.

### PHASE F — REVIEW DIFF

Inspect:

- `git diff --stat`;
- `git diff` for changed files;
- accidental package-lock changes;
- unrelated formatting churn;
- secrets;
- documentation mismatch.

### PHASE G — REPORT

Use the required final report from `CLAUDE.md`.

---

## 3. Task Contract Format

Implementation tasks should be provided with this structure whenever possible:

```text
TASK
OBJECTIVE
IN SCOPE
OUT OF SCOPE
EXPECTED AREAS
ARCHITECTURE CONSTRAINTS
DATABASE IMPACT
SECURITY REQUIREMENTS
ACCEPTANCE CRITERIA
REQUIRED TESTS
STOP CONDITIONS
```

Claude should restate scope before implementing if any portion is ambiguous.

---

## 4. Scope Discipline

If working on Project Foundation, do not redesign templates.

If working on RSVP, do not redesign Dashboard.

If working on template rendering, do not opportunistically change package pricing.

If working on RLS, do not “clean up” unrelated CSS.

Report unrelated issues instead.

---

## 5. Technical Debt Reporting

Use this format:

```text
TECHNICAL DEBT FOUND
- Location:
- Problem:
- Risk:
- Why it is out of scope:
- Suggested future task:
```

Do not silently fix it unless authorized.

---

## 6. Small Commits and Reviewability

Prefer one coherent task per commit.

Avoid mega-commits combining:

- database migration;
- large UI redesign;
- unrelated legacy cleanup;
- dependency upgrade;
- template redesign.

If one approved feature necessarily spans layers, keep all changes tied to one acceptance contract and report them clearly.

---

## 7. Branching

Do not work directly on `main` for V2 development.

Initial recommended branch:

```text
weddingclick-v2
```

Feature branches may later branch from the V2 integration branch when useful.

Before switching machines:

1. commit coherent completed work;
2. push;
3. on other machine fetch/pull;
4. confirm clean worktree before continuing.

Do not manually copy source directories between machines as the normal sync method.

---

## 8. Dependency Changes

Any new dependency requires:

- reason;
- alternatives considered;
- expected runtime/bundle impact;
- maintenance confidence;
- license awareness where relevant.

Lockfile changes should correspond only to intentional dependency changes.

---

## 9. Database Change Workflow

Before any migration:

1. confirm approved schema task;
2. write migration file in source control;
3. review SQL for destructive operations;
4. review keys/constraints/indexes;
5. review RLS/grants;
6. run in local/staging/test environment where available;
7. verify application behavior;
8. only then apply to production Supabase with approval.

Do not manually click-create production tables and forget migrations.

---

## 10. Migration Naming Conflict Rule

V1 currently has tables named `invitations`, `weddings`, and `wishes`.

V2 planning includes an `invitations` concept.

Before implementing physical schema, Claude must explicitly propose how to avoid unsafe naming collision.

Do not rename/drop legacy tables silently.

---

## 11. Client/Server Component Discipline

Use Client Components only when browser interaction/state requires them.

Do not mark large route trees `'use client'` merely for convenience.

Keep secrets, privileged Supabase operations, and trusted authorization on the server.

Do not move server-only code into browser bundles.

---

## 12. Supabase Data Access

Avoid repeated ad-hoc Supabase calls spread across visual components.

Prefer domain/repository/service boundaries appropriate to the feature.

Templates must never perform direct Supabase business mutations.

Handle Supabase errors explicitly.

---

## 13. Shared Types

Business types belong in central domain modules.

Do not create multiple local definitions of values such as:

```text
COMMON | GROOM | BRIDE
```

Use one canonical type/constant source.

---

## 14. UI Change Discipline

When changing a shared component:

- identify all screens consuming it;
- verify affected states;
- avoid unrequested visual redesign;
- verify mobile if customer-facing.

When creating admin UI, optimize for clarity and speed.
When creating invitation UI, follow template art direction.
When creating Customer Portal UI, optimize for simplicity/mobile.

Do not force all three surfaces into one visual pattern.

---

## 15. Content and Vietnamese Text

Business-critical Vietnamese labels should be centralized where practical.

Pay special attention to:

- `Lễ Thành Hôn`;
- `Lễ Vu Quy`;
- bride/groom order;
- family-side wording;
- RSVP terminology.

Do not introduce missing accents or inconsistent variants through copy/paste.

---

## 16. Error-State Development

For every mutation UI, implement and verify:

- loading state;
- success state based on confirmed success;
- meaningful error state;
- retry/recovery where appropriate.

Never write only the happy path for:

- save;
- upload;
- review approval;
- publish;
- RSVP;
- guest import;
- token regeneration.

---

## 17. Feature Flag / Activation Discipline

Incomplete templates/features should not accidentally appear as production-active.

Template activation should be controlled by manifest/database state.

Do not expose unfinished V2 routes from the main customer-facing navigation unless task requires it.

---

## 18. Seed/Test Data

Use realistic Vietnamese test data rather than `abc`, `A`, `B` for visual/domain testing.

Maintain reusable fixtures/seed data for:

- common invitation;
- separate variants;
- personalized guest;
- long names;
- optional-content omissions;
- RSVP states.

Test data must not contain real customer information.

---

## 19. Documentation Update Trigger

Update docs whenever implementation changes:

- approved entity/table contract;
- status/enum;
- public URL/capability semantics;
- template manifest contract;
- publish lifecycle;
- entitlement behavior;
- security boundary.

Minor internal refactors that preserve contract do not require rewriting architecture docs.

---

## 20. “Done” Gate

A task is not done until:

- acceptance criteria met;
- relevant tests pass;
- build/typecheck/lint status reported;
- diff reviewed;
- no scope leakage;
- security impact reviewed;
- documentation synchronized when required;
- known limitations stated.
