# WeddingClick V1 — Legacy Audit Summary

**Audit date:** 2026-09-10  
**Purpose:** Preserve verified context while building V2  
**Rule:** This document describes current V1; it is not permission to delete V1.

## 1. Current Repository Stack

Observed:

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase JS
- browser-image-compression
- xlsx
- framer-motion dependency present

Current application code is relatively small, making controlled architectural refactoring feasible.

The uploaded archive was very large primarily because `.next` build/cache output was included. `.next` and `node_modules` are not source and should not be included in future source handoffs.

---

## 2. Current Routes Observed

Key V1 routes include:

```text
/
/login
/dashboard
/admin
/thong-ke
/[id]
/[id]/rsvp
/[id]/vip
/guest-list/[id]
```

The application has an existing landing page, login, admin/editor-like page, dashboard/statistics, public invitation route, RSVP view, and VIP/guest-link helper.

---

## 3. Existing Templates

V1 includes three template/theme implementations.

Useful concepts/assets should be preserved as reference, but template components currently own too much business logic.

Observed duplication/inconsistency includes per-template handling of:

- countdown/date logic;
- RSVP behavior;
- music behavior;
- optional sections;
- variant rendering.

V2 should preserve useful art/assets while moving shared behavior out of individual templates.

---

## 4. Current Invitation Data Model

V1 uses a broad `invitations` table containing many unrelated responsibilities, including:

- couple data;
- family data;
- date/time text;
- venue/map;
- media URLs;
- bank/gift information;
- template ID;
- invitation type;
- settings;
- status;
- deadline.

This effectively combines Project, wedding data, design, invitation variant and operational status in one record.

V2 should not extend this pattern.

---

## 5. V1 Variant Concept

V1 already contains concepts similar to:

- `CHUNG`
- `NHA_TRAI`
- `NHA_GAI`

and a `couple_id` field.

However, the audited source does not use `couple_id` as a true canonical shared-data architecture. Variants still behave largely as separate invitation records.

Observed variant behavior is incomplete: changing invitation type mostly affects wording in limited places; family visibility/order and bride/groom ordering are not consistently resolved across templates.

V2 must centralize variant semantics.

---

## 6. Date/Time Problems Observed

V1 stores important date/time fields as text.

Template code contains hard-coded weekday/calendar assumptions and independent parsing logic.

Observed risks include:

- different hard-coded weekday labels in one invitation;
- fixed 31-day calendar behavior;
- countdown targeting midnight rather than actual wedding time;
- each template parsing/deriving date differently.

V2 must use canonical typed event date/time and one shared derivation layer.

---

## 7. Preview / Publish

V1 does not have a true isolated Preview/Publish versioning model.

Public `/[id]` renders directly from current invitation data. Saving/upserting effectively makes current data available at the public route.

V2 must separate:

```text
Draft
Review Snapshot
Published Snapshot
```

---

## 8. Personalized Guest / VIP

V1 includes a useful UX concept for:

- manually entering guest names;
- importing names through Excel;
- generating personalized URLs.

However personalization is based on a visible query such as `?guest=...` and does not create real Guest records.

Consequences:

- display name can be changed directly in URL;
- no canonical guest list;
- no secure guest identity;
- no guest-to-RSVP relationship;
- no reliable “unanswered guest” reporting.

V2 should preserve manual/Excel UX ideas while rebuilding the data/security model.

---

## 9. RSVP

V1 uses `wishes` for RSVP/message-like data.

Observed concerns:

- RSVP and wishes concepts are combined;
- templates write directly from client to Supabase;
- no canonical guest relationship;
- duplicates are possible;
- error result is not always checked before success UI.

V2 needs server validation, one current RSVP per personalized guest, and accurate success/failure handling.

---

## 10. Legacy `weddings` Table/Route

Database audit shows legacy `weddings` table in addition to `invitations` and `wishes`.

Route `/guest-list/[id]` uses `weddings`, while the main application primarily uses `invitations`.

This strongly suggests a legacy/orphan flow.

Classification: **candidate REMOVE/MIGRATE later**, but do not delete until V2 replacement and explicit cleanup approval.

---

## 11. Authentication / App Registration

V1 source includes login but no verified public sign-up flow in audited code.

For V2 this is acceptable because public customer/staff registration is not a V1 requirement. Internal Admin-controlled Staff accounts are preferred.

---

## 12. Security Audit Findings

Supabase audit confirmed significant V1 security weaknesses.

Public/anonymous and authenticated roles have broad table privileges on V1 tables, and RLS configuration is incomplete/insecure.

Observed examples:

- `invitations` RLS enabled but broad policy equivalent to public `ALL` access;
- `weddings` RLS disabled;
- `wishes` RLS disabled;
- public write access concerns;
- current Storage bucket allows overly broad public behavior.

V1 must not be considered production-safe for real customer data.

V2 security must be built before commercial launch.

---

## 13. Database Integrity Findings

V1 audit found no meaningful foreign-key model connecting the main business records.

Existing tables primarily have primary keys/index basics but lack the relational integrity required for Project -> Invitation -> Guest -> RSVP architecture.

V2 must introduce explicit foreign keys and constraints.

---

## 14. Storage Findings

V1 uses a `wedding-photos` bucket and appears to use it for multiple media purposes including images/audio/QR-related assets.

Current code removes media URLs from application state/database without necessarily deleting the underlying storage object, creating orphan-file risk.

V2 should use a normalized media model and controlled lifecycle.

---

## 15. Landing Page Findings

V1 landing page contains outdated/placeholder commercial/contact information compared with newly approved V2 pricing/business model.

Landing page should be treated as a refactor target rather than current source of truth for packages/pricing.

---

## 16. V1 Classification Summary

| Area | Decision Direction |
|---|---|
| Next.js / React / TypeScript / Tailwind | KEEP |
| Supabase / Vercel | KEEP |
| Landing | REFACTOR |
| Auth foundation | REFACTOR |
| Dashboard concepts | REBUILD using useful ideas |
| Current admin/editor | REBUILD architecture |
| Existing template visual assets | KEEP as reference/assets |
| Template business logic | REBUILD |
| Current invitation data model | REBUILD CORE |
| Variant handling | REBUILD |
| VIP manual/Excel UX concept | KEEP idea, REBUILD data/security |
| RSVP data layer | REBUILD |
| Preview/publish | BUILD proper versioning |
| Legacy guest-list/weddings flow | REMOVE/MIGRATE later |
| Tests | BUILD |
| RLS/security | REBUILD |

---

## 17. Data Migration Context

As of the audit, all known database records are test data and there are no real customers.

This permits a cleaner V2 architecture without needing complex backward-compatible migration of hundreds of live invitations.

Nevertheless, legacy objects should remain untouched until V2 passes validation, because the repository itself is still useful reference material.
