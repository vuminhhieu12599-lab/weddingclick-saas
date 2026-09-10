# TASK 000 — Claude Code Repository Audit & V2 Foundation Plan

**Execution mode:** READ / INVESTIGATE / PLAN ONLY  
**Code changes:** Forbidden  
**Database changes:** Forbidden  
**Dependency installation:** Forbidden

## Objective

Verify that Claude Code understands the current WeddingClick repository and all approved V2 documentation before any V2 implementation begins.

The output must be a concrete Foundation implementation plan that can be reviewed before Task 001.

---

## Instructions to Claude Code

You are working on WeddingClick V2.

Before doing anything else, read completely:

- `CLAUDE.md`
- `docs/README.md`
- `docs/DECISIONS.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/TEMPLATE_SYSTEM.md`
- `docs/TYPOGRAPHY_AND_MOTION.md`
- `docs/SECURITY.md`
- `docs/DEVELOPMENT_RULES.md`
- `docs/TESTING.md`
- `docs/ROADMAP.md`
- `docs/LEGACY_AUDIT.md`

Then audit the current repository.

### Absolute restrictions

DO NOT:

- edit source files;
- create migrations;
- modify documentation;
- install/update packages;
- change package-lock.json;
- delete files;
- rename files;
- execute destructive Git commands;
- alter Supabase schema/data;
- deploy anything.

You may use read-only inspection commands and non-destructive validation commands where practical.

If dependencies are already installed, you may run existing lint/build checks if they do not require installing/updating packages. If dependencies are not installed, report that rather than installing them during Task 000.

Do not reveal environment variable secret values. You may identify variable names/configuration needs without printing secrets.

---

## Audit Scope

Inspect at least:

### Repository state

- current branch;
- `git status`;
- ignored/generated directories;
- whether `.env*`, `.next`, `node_modules` are correctly ignored;
- whether there are uncommitted user changes.

### Stack/configuration

- `package.json`;
- scripts;
- TypeScript config;
- Next config;
- ESLint;
- Tailwind/PostCSS;
- Supabase client configuration.

### Routes

Map all current App Router pages/routes.

Identify:

- internal routes;
- public invitation route;
- RSVP route;
- VIP/guest generation route;
- legacy/orphan routes.

### Data access

Find all Supabase reads/writes.

For each important call classify:

- table/bucket used;
- read/write/delete;
- client or server execution;
- security concern;
- V2 replacement domain.

### V1 data model usage

Trace usage of:

- `invitations`;
- `weddings`;
- `wishes`;
- `couple_id`;
- `invitation_type`;
- status/deadline;
- media fields;
- template IDs/settings.

### Templates

Identify all current template/theme components.

For each template identify duplicated business behavior such as:

- date parsing;
- countdown;
- calendar;
- variant conditions;
- RSVP mutation;
- music;
- gallery;
- gift/bank;
- guest personalization.

Do not redesign them.

### Auth/security

Identify:

- login/session handling;
- protected/unprotected internal routes;
- browser-side privileged database access;
- any service-role exposure risk;
- current Storage upload behavior.

Do not change it during Task 000.

### Testing baseline

Identify:

- current lint/typecheck/test/build scripts;
- current automated tests if any;
- gaps that Foundation should address.

---

## Required Output

Return one structured report with these sections.

### 1. EXECUTIVE SUMMARY

Maximum ~15 concise bullets/paragraphs summarizing current repo and biggest V2 implications.

### 2. CURRENT ARCHITECTURE MAP

Show current V1 route/data/template flow in text form.

### 3. VERIFIED STACK

List versions and core dependencies from repository.

### 4. ROUTE INVENTORY

For every current route:

- purpose;
- auth state observed;
- main data dependencies;
- V2 classification: KEEP / REFACTOR / REBUILD / REMOVE-LATER.

### 5. DATA ACCESS INVENTORY

Table/bucket access and where it occurs.

### 6. TEMPLATE AUDIT

Summarize shared vs duplicated logic and major correctness issues.

### 7. SECURITY GAP SUMMARY

Code-visible risks only. Do not claim unseen RLS facts unless documented in `LEGACY_AUDIT.md`.

### 8. TESTING GAP SUMMARY

What exists and what Foundation must add.

### 9. V1 PROTECTION PLAN

Explain what should remain untouched while V2 is developed.

### 10. V2 FOUNDATION IMPLEMENTATION PLAN

Propose ordered tasks for Week 1 only.

Each proposed task must include:

- task name;
- objective;
- in scope;
- out of scope;
- expected files/modules;
- database impact;
- security impact;
- required checks;
- acceptance criteria;
- stop conditions.

Do not plan all six weeks at implementation-detail level. Focus on Foundation/Week 1.

### 11. PHYSICAL DATABASE PLAN QUESTIONS

List only unresolved technical decisions that genuinely must be answered before the first V2 migration.

Do not ask questions already answered in documentation.

Pay special attention to the V1/V2 `invitations` table-name collision.

### 12. RISKS

Top risks ranked High / Medium / Low.

### 13. TASK 001 RECOMMENDATION

Recommend exactly one first implementation task after this audit, but do not execute it.

---

## Success Criteria

Task 000 passes only if Claude demonstrates that it understands these non-negotiable points:

- one canonical Project wedding-data source;
- COMMON/GROOM/BRIDE are views, not copied records;
- templates receive normalized view models and do not own business logic;
- typed canonical date/time;
- customer has token-based Intake/Review/Portal, not normal V1 account;
- personalized guest display is free-form;
- guest tokens are secure identity, display names are not;
- RSVP is server-validated and shared;
- Save != Publish;
- published versions remain stable;
- template implementation versions remain stable;
- Vietnamese typography and motion are core product features;
- no public unrestricted internal database writes;
- V1 is preserved until V2 validation;
- no coding is performed during Task 000.
