# WeddingClick V2 Documentation Index

Read in this order when onboarding a new development agent:

1. `../CLAUDE.md` — non-negotiable engineering rules.
2. `DECISIONS.md` — approved product decisions; do not reinterpret silently.
3. `PRODUCT.md` — product behavior and user flows.
4. `ARCHITECTURE.md` — application/domain architecture.
5. `DATABASE.md` — logical database model.
6. `TEMPLATE_SYSTEM.md` — invitation template architecture.
7. `TYPOGRAPHY_AND_MOTION.md` — Vietnamese fonts and effects system.
8. `SECURITY.md` — authorization/token/RLS/storage requirements.
9. `DEVELOPMENT_RULES.md` — how tasks must be executed.
10. `TESTING.md` — QA and release gates.
11. `ROADMAP.md` — six-week milestone plan.
12. `LEGACY_AUDIT.md` — verified V1 context and known problems.

## Core Principle

WeddingClick V2 must become commercially usable without recreating V1's central risks:

- duplicated wedding data;
- business logic inside templates;
- hard-coded date behavior;
- save = publish;
- insecure public database writes;
- guest name as URL identity;
- RSVP false-success/duplicate behavior;
- template changes breaking published customers.

## Before First V2 Code Change

Run Task 000 from `TASK-000-CLAUDE-AUDIT.md`.

Task 000 is a planning/audit task only. It must not edit source code.
