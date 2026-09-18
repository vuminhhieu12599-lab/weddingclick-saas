# WeddingClick V2 — Application Workflow & API Contract

**Status:** Approved contract freeze (Task 021, Final Revision)
**Last updated:** 2026-09-12
**Depends on:** `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/PHYSICAL_DATABASE_PLAN.md`, `docs/SECURITY.md`, `docs/DEVELOPMENT_RULES.md`, `docs/TESTING.md`, `docs/ROADMAP.md`

This document freezes the application/API workflow between the finished, frozen V2 database (migrations `0001`–`0020`) and the remaining V2 application work. It governs which server mechanism (direct RLS vs. trusted business action) each use case uses, the two customer/guest-facing security paths, the error model, and the activity-log contract. Table schema itself is governed by `docs/DATABASE.md` / `docs/PHYSICAL_DATABASE_PLAN.md` and is not reopened here — this document does not change any frozen table shape.

Existing application foundation this contract builds on (do not rebuild): Task 003 (`lib/domain/*` + Vitest), Task 004 (staff server boundary — `lib/server/auth/*`, `lib/server/supabase/staff-client.ts`), Task 005/005B (Customer + Project CRUD, `create_project_with_addons()`), UI-001 (read-only `/admin/v2`).

---

## 1. The Two Security Paths

### Path A — Internal Staff

```text
Browser Supabase Auth access token
  → Next.js Route Handler
  → auth.getUser(token)                  (real GoTrue validation, never local JWT decode)
  → active profiles row check
  → staff-scoped Supabase client (anon key + caller's own JWT)
  → RLS (is_staff() / is_admin())
```

Implemented exactly by `lib/server/auth/{staff-context,staff-auth-gateway,bearer-token}.ts` + `lib/server/supabase/staff-client.ts`. `service_role` is never used for ordinary staff convenience (`SECURITY.md` §5.3, `PHYSICAL_DATABASE_PLAN.md` §1.4).

### Path B — Customer / Guest Bearer Token

```text
Raw opaque bearer token (URL)
  → server hashes with SHA-256
  → resolve project_access_links / guests by token_hash
  → validate: not revoked, not expired, correct purpose/type, resolved project matches
  → service_role, scoped to the minimum operation the validated token authorizes
```

No Supabase Auth session exists for these actors. `service_role` is authorized only after independent server-side validation, never as a blanket substitute for authorization. Raw tokens are never stored, logged, or returned after initial issuance.

---

## 2. Actor / Auth Matrix

| Actor | Credential | Client | Enforcement |
|---|---|---|---|
| STAFF / ADMIN | Supabase Auth access token | staff-scoped client (anon key + caller JWT) | `auth.getUser()` + active `profiles` row + RLS |
| CUSTOMER (INTAKE/REVIEW/PORTAL) | raw opaque token, no Auth session | `service_role`, post-validation only | hash → `project_access_links.token_hash` lookup → `revoked_at`/`expires_at`/`link_type`/`project_id` checks → `last_used_at` update |
| GUEST | raw opaque token, no Auth session | `service_role`, scoped to one guest row | hash → `guests.token_hash` lookup → `revoked_at` check → scoped to that guest's own data only |
| Anonymous public | none | `service_role` (published render only) | `project_invitations.public_slug` → published `invitation_versions` snapshot only |

---

## 3. Direct-RLS vs. Trusted-Business-Action Rule

This is the central rule of this contract, corrected in this revision:

- **Reads** of internal/canonical data always use the normal authenticated staff-session + RLS path. Direct `SELECT` is fine.
- **A deliberate staff Save that changes canonical, audited domain data is a business action, not a plain RLS write.** If a mutation corresponds to a real domain event that must appear in `activity_logs` (per the frozen Activity Union in §6), it cannot be a bare RLS `INSERT`/`UPDATE`, because `log_activity(...)` is private and callable only from inside another `SECURITY DEFINER` business-action function (`SECURITY.md` §5.4, `PHYSICAL_DATABASE_PLAN.md` §2.22/[F13]). The business action:
  - is invoked by an authenticated staff session (`GRANT EXECUTE TO authenticated` only, never `anon`);
  - performs its own `is_staff()`/`is_admin()` check internally (it runs as the schema-owner role, which carries `BYPASSRLS`, so RLS does not protect it — the function must protect itself);
  - performs the actual canonical mutation;
  - calls `log_activity(...)` internally, in the same transaction;
  - commits atomically.
- **Safe, non-domain-meaningful edits remain plain RLS CRUD.** Metadata-only fields with no corresponding activity type (e.g. `project_media.alt_text`/`sort_order`, guest token rotation, plain project `internal_note`/`deadline_at` edits) stay on the direct-RLS path. Do not invent new activity types to force everything through a business action — the rule is driven by "is this in the frozen union," not by "is this a mutation."
- Bulk/volume operations with real audit value (e.g. guest import) and operations requiring cross-table atomicity (review snapshot creation, publish) are business actions regardless of whether a single field's mutation would otherwise look simple.

### 3.1 Corrected classification — canonical wedding data

| Operation | Classification |
|---|---|
| `wedding_details` read | DIRECT RLS SELECT (`is_staff()`) |
| `wedding_details` create/update/upsert Save | **TRUSTED BUSINESS ACTION** — staff-invoked, performs the upsert, calls `log_activity('CANONICAL_DATA_APPLIED')`, atomic |
| `project_events` read/list | DIRECT RLS SELECT (`is_staff()`) |
| `project_events` create/update/delete | **TRUSTED BUSINESS ACTION** — same pattern, same `CANONICAL_DATA_APPLIED` action type |

Audit fires on the explicit staff Save/domain mutation, never on intermediate keystrokes, drafts, or client-side state. Exact SQL function signatures are not frozen here beyond this contract, except where an immediate implementation task (Task 022) requires one — see §7.

### 3.2 Corrected classification — project media

`project_media` is **not** end-to-end generic CRUD:

| Operation | Classification |
|---|---|
| Read/list metadata | DIRECT RLS SELECT (`is_staff()`) |
| Safe metadata-only edit (`alt_text`, `sort_order`) | DIRECT RLS UPDATE (`is_staff()`) — no activity type exists for this, stays unaudited |
| Object upload + `project_media` row creation | **One trusted server media use case** (Next.js server code, not a single DB function — Storage and Postgres are two systems) |
| Object deletion + `project_media` row deletion | **One trusted server media use case** |

Storage and Postgres are not one ACID transaction. Later media implementation (Task 024) must define explicit ordering/compensation rather than claim false cross-system atomicity:

- **Creation order:** upload the Storage object first, then insert the `project_media` row. A failure after upload but before the row insert leaves an orphaned Storage object (safe: wasted storage, cleanable later) rather than a DB row pointing at nothing. **No-Cleanup Rule (frozen):** if the `project_media` INSERT itself fails for any reason — a duplicate/unique-constraint conflict, an ambiguous transport/network outcome, or a definite non-duplicate DB error — Task 024 performs no synchronous Storage removal. An ownership re-check followed by `Storage.remove` is an unavoidable TOCTOU race: a concurrent finalize request can commit a valid `project_media` row between the re-check and the removal, causing a valid row's object to be deleted. A safe orphaned Storage object is the accepted outcome instead; no age-based sweeper/maintenance job exists in Task 024, and this documentation does not imply one does.
- **Deletion order:** delete the `project_media` row first, then delete the Storage object (matches `PHYSICAL_DATABASE_PLAN.md` §K's already-frozen rationale) — a failure after the DB delete leaves an orphaned object, never a dangling DB reference to already-missing storage.
- The browser never independently deletes a Storage object and a DB row as two separate unguarded client actions.
- `invitation_version_media`'s `ON DELETE RESTRICT` toward `project_media` and `guard_project_media_asset_immutability()` remain the enforcement backstop; the trusted server workflow must respect both (a referenced asset cannot be deleted or have its identity changed in place — replacing it means a new object + new row).
- No activity type exists for media upload/delete in the frozen union (§6); this stays an unaudited trusted-server workflow in initial V1, consistent with not inventing new telemetry actions.

Media implementation is explicitly **not** part of Task 022 (see §8).

---

## 4. Token Resolution Contract

`project_access_links` and `guests` are **not** resolved by one generic sequence — their frozen schemas differ (`PHYSICAL_DATABASE_PLAN.md` §2.17/§2.19). `guests` has `token_hash`/`token_hint`/`revoked_at` only; it has **no `expires_at`** and **no `last_used_at`**. Do not apply access-link-only fields to guest resolution.

**Customer access-link resolution** (`project_access_links` — INTAKE/REVIEW/PORTAL):

1. Validate presented token's shape.
2. Hash with SHA-256.
3. Look up by `project_access_links.token_hash`.
4. Require active (`revoked_at IS NULL`).
5. Require not expired (`expires_at IS NULL OR expires_at > now()`).
6. Require `link_type` matches the endpoint's purpose.
7. Require the resolved `project_id` matches the project being acted on.
8. Update `last_used_at` (the only `service_role` write grant on `project_access_links` besides `SELECT`).

**Guest token resolution** (`guests`):

1. Validate presented token's shape.
2. Hash with SHA-256.
3. Look up by `guests.token_hash`.
4. Require active (`revoked_at IS NULL`).
5. Enforce the guest/project relationship (resolved `project_id` matches the project being acted on).
6. Enforce the permitted invitation variant (§7.3).
7. **No `expires_at` check** — guest tokens do not expire in V1.
8. **No `last_used_at` update** — `guests` carries no such column.

### 4.1 Token failure HTTP model (frozen)

| Condition | HTTP |
|---|---|
| Malformed presented token shape (either token type) | 404 |
| Unknown hash — no matching row (either token type) | 404 |
| Correct customer access token presented to the wrong-purpose endpoint | 404 |
| Known customer access link, correct purpose, expired | 410 |
| Known customer access link, correct purpose, revoked | 410 |
| Known guest token, revoked | 410 |

`EXPIRED_TOKEN` applies only to customer access links — guest tokens have no expiration field in V1 and can never produce this condition. Malformed/unknown/wrong-purpose all collapse to a uniform 404 so a caller cannot distinguish "doesn't exist" from "exists but wrong purpose" — this is a deliberate anti-enumeration choice. Expired/revoked are deliberately distinguished from not-found (410, not 404) because the link/token once worked. Never return the raw token, the token hash, SQL/Postgres internals, or `service_role` details in any response.

---

## 5. Error Model (frozen)

| Kind | HTTP | Notes |
|---|---|---|
| `UNAUTHENTICATED` | 401 | missing/invalid staff session; **or** a customer/guest endpoint called with **no bearer token presented at all** |
| `FORBIDDEN` | 403 | authenticated but not authorized — includes inactive/non-staff, wrong role, and **entitlement missing** (e.g. no Personalized Guest add-on) |
| `VALIDATION` | 400 | malformed/missing/wrong-type request input |
| `NOT_FOUND` | 404 | resource does not exist; **or** a token failure that is not expiry/revocation — malformed presented bearer token, unknown token hash, or a customer access token presented to the wrong-purpose endpoint (§4.1) |
| `CONFLICT` | 409 | staff-action state conflicts — already revoked, already published, already paid, stale review version |
| `EXPIRED_TOKEN` | 410 | a known customer access link, correct purpose, that has expired — customer access links only; guest tokens have no `expires_at` and can never produce this |
| `REVOKED_TOKEN` | 410 | a known, correct-purpose customer access link that has been revoked, **or** a known guest token that has been revoked |
| `INVARIANT` | 422 | well-formed input violates a business rule (illegal status transition, RSVP bounds, incomplete SEPARATE-package guest variant) |
| `INTERNAL` | 500 | generic message only, never raw SQL/Postgres/service-role detail |

Rule of thumb: **staff-side already-done/already-revoked conflicts are `CONFLICT` (409)**; **token consumption failures (expired/revoked) are `410`**, never `409`.

This extends, not replaces, the existing `ApiError` (`BAD_REQUEST|FORBIDDEN|NOT_FOUND|CONFLICT|INTERNAL`) and `StaffAuthError` (`UNAUTHENTICATED|FORBIDDEN`) kinds already implemented in `lib/server/errors/api-error.ts` and `lib/server/auth/staff-auth-error.ts`. `VALIDATION`→400 maps onto `BAD_REQUEST`; `INVARIANT`→422 and the two token kinds→410 are additions later tasks must add to that error module when they are first needed.

---

## 6. Activity Action Type Union (frozen, initial V1)

```text
CUSTOMER_SUBMISSION_RECEIVED
CANONICAL_DATA_APPLIED
INVITATION_REVIEW_CREATED
REVIEW_LINK_ISSUED
REVISION_REQUESTED
CUSTOMER_APPROVED
PROJECT_MARKED_PAID
INVITATION_PUBLISHED
INVITATION_REPUBLISHED
ACCESS_LINK_REVOKED
ACCESS_LINK_ROTATED
GUEST_IMPORTED
GUEST_REVOKED
STAFF_ASSIGNMENT_CHANGED
PROJECT_STATUS_CHANGED
PROJECT_ARCHIVED
```

This is the exact, complete initial set. Do **not** add to it without an explicit approved task. In particular, **not** added in initial V1:

- `INTAKE_LINK_ISSUED` / `PORTAL_LINK_ISSUED` — only REVIEW link issuance is a named audit event; INTAKE/PORTAL link creation stays direct-RLS and unaudited.
- `GUEST_TOKEN_ROTATED` — guest token rotation remains a trusted staff server mutation but has no activity-log event in initial V1.
- Any project-media upload/delete event — see §3.2.

`log_activity(p_project_id, p_actor_type, p_action_type, p_summary, p_metadata)` remains the frozen, private signature from `PHYSICAL_DATABASE_PLAN.md` §2.22 — callable only from within business-action functions, never directly by `authenticated`/`service_role`/`anon`.

---

## 7. Resolved Decisions

### 7.1 Portal display summary — no schema change

Customer PORTAL does **not** get direct access to `customers` or `wedding_details` (the RLS Matrix in `PHYSICAL_DATABASE_PLAN.md` §M correctly marks both `—` for PORTAL, and this stands). Portal is delivered only **after** publish. Portal resolves:

- Project minimal display context (status, code) via its validated PORTAL server flow;
- `project_invitations` / public invitation link(s);
- human wedding/couple display information by reusing the **same safe view service that renders the public PUBLISHED invitation** (reading the immutable `invitation_versions` PUBLISHED payload), not a second direct `wedding_details` exposure path.

This resolves the previously-flagged gap with no schema change: because Portal only exists post-publish, the published snapshot is always available to source display data from.

### 7.2 Rendering Engine — explicit prerequisite task

An explicit implementation task (Task 029, §8) must exist and complete **before** Review Workflow (Task 030). It builds:

- Wedding Domain Resolver;
- `InvitationViewModel` builder;
- template renderer registry;
- variant/event resolution;
- normalized snapshot payload construction;
- media reference extraction (feeding `invitation_version_media`).

No REVIEW snapshot (`create_review_version`) may be implemented before this foundation exists — it is what produces the frozen payload that function persists.

### 7.3 Guest `invitation_variant = NULL` resolution rule

- **COMMON package / sole COMMON invitation:** `NULL` resolves/normalizes to `COMMON`. Prefer normalizing newly-created COMMON-context guests to `COMMON` explicitly at creation time rather than leaving `NULL` to be interpreted later.
- **SEPARATE package:** `NULL` is an incomplete configuration. Never guess `GROOM` vs `BRIDE`. Guest-link issuance must reject (`INVARIANT`, 422) until the variant is explicitly set to `GROOM` or `BRIDE`.

### 7.4 Access-link issuance audit scope

Confirmed: only `REVIEW_LINK_ISSUED` is logged. INTAKE/PORTAL link creation stays plain DIRECT RLS INSERT, unaudited, in initial V1 (§6).

### 7.5 Guest token rotation audit

Confirmed: no `GUEST_TOKEN_ROTATED` type in initial V1. Rotation is a trusted staff server mutation (`UPDATE guests SET token_hash=..., token_hint=...`) with no activity-log event.

### 7.6 Rate limiting / abuse controls

Mandatory before **production** launch (`SECURITY.md` §11, `ROADMAP.md` Production Ready Definition) but does **not** block DEV/STAGING implementation of the RSVP workflow (Task 033). An explicit pre-production security gate task exists in the revised order as Task 035 (§8).

### 7.7 Token failure HTTP model

Frozen — see §4.1.

---

## 8. Revised Implementation Order

Smaller, independently reviewable slices, replacing the previous broad 022–030 sequence:

| Task | Scope | Depends on |
|---|---|---|
| **022** | Wedding Details API + audited Save action | Task 004 boundary only |
| **023** | Project Events API + audited mutations | 022 (same business-action pattern) |
| **024** | Project Media trusted workflow (upload/delete orchestration, §3.2) | Task 004 boundary |
| **025** | Project lifecycle/payment/assignment business actions (`mark_project_paid`, `transition_project_status`, `reassign_project_staff`) | Task 004/005 boundary |
| **026** | Access-Link & Token Foundation (token crypto/hash utility, resolution module, INTAKE/PORTAL direct RLS, `issue_review_link`, `rotate_access_link`, `revoke_access_link`) | Task 004 boundary |
| **027** | Intake Workflow (`submit_intake`, `apply_intake_submission`, reject) | 022 (apply target), 026 (tokens) |
| **028** | Project Design APIs (`project_design` get/upsert, template/version catalog reads) | Task 004 boundary |
| **029** | **Invitation Rendering Foundation** (Wedding Domain Resolver, `InvitationViewModel` builder, template registry, variant/event resolution, snapshot payload construction, media reference extraction) | 022, 023, 028 |
| **030** | Review Workflow (`create_review_version`, REVIEW resolve, `submit_review_feedback`) | **029 hard dependency** |
| **031** | Publish Workflow (`publish_invitation`, project-level publish-eligibility) | 030, 025 (`mark_project_paid`) |
| **032** | Guest & Portal Workflow (guest CRUD/import/revoke, PORTAL resolve reusing the published-view service per §7.1) | 026, 031 |
| **033** | Guest Token & RSVP Workflow (guest resolve, RSVP submit/read) | 031, 032 |
| **034** | Tasks / Activity Admin Integration (`project_tasks` CRUD, `activity_logs` staff read, dashboard aggregation) | none — may be parallelized earlier |
| **035** | Pre-production Abuse Controls / Rate Limiting / security gate | 033 (must land before production launch, not before DEV/STAGING work) |

Existing Customer/Project CRUD, `create_project_with_addons()`, the Task 004 staff boundary, and UI-001 are reused unchanged throughout this sequence — none of it is rebuilt.

---

## 9. Task 022 Frozen Boundary

Task 022 (next implementation task) is deliberately narrow:

- `wedding_details` only — no `project_events`, no `project_media`, no project lifecycle mutation, no token/customer flow.
- Internal STAFF/ADMIN only.
- `GET` canonical `wedding_details` for one project — DIRECT RLS SELECT.
- One audited create/update/upsert Save action — TRUSTED BUSINESS ACTION per §3.1, emitting `CANONICAL_DATA_APPLIED` atomically.
- Reuses the existing Task 004 staff auth/server boundary as-is.
- No UI implementation unless separately authorized.
- May require one feature migration adding the narrowly-scoped business-action function. This is permitted: the **table schema phase is frozen**, but later feature migrations may add reviewed functions/RPCs without changing any frozen table shape.

---

## 10. Task 025 — Project Lifecycle / Payment / Assignment HTTP Contract (frozen)

Task 025 Phase 2 implements the HTTP surface over the three trusted business actions frozen in migration `0024_project_lifecycle_payment_assignment.sql` (§8): `transition_project_status`, `mark_project_paid`, `reassign_project_staff`. All three are internal STAFF/ADMIN endpoints — `requireStaff` only, per §2's Path A; there is no ADMIN-only branch on any of the three. Each route handler calls exactly one of the three RPCs via the frozen `ProjectLifecycleGateway` and never performs a direct `UPDATE` of a governed `projects` column (`status`, `payment_status`, `paid_at`, `assigned_staff_id`, `completed_at`, `archived_at`) or a direct `activity_logs`/`log_activity` write — every audited side effect (`PROJECT_STATUS_CHANGED`, `PROJECT_ARCHIVED`, `PROJECT_MARKED_PAID`, `STAFF_ASSIGNMENT_CHANGED`, §6) happens atomically inside the RPC.

Each RPC is declared to return exactly one row (`FOR UPDATE` row lock + `RETURNS TABLE`/`RETURNING`); a client-library result that is `null`, an empty array, more than one row, or a row that fails field-level shape validation is treated as a generic `INTERNAL` (500) failure, never forwarded to the caller.

### 10.1 `PATCH /api/v2/internal/projects/[id]/status`

Manual project lifecycle transition.

Request body:

```json
{
  "targetStatus": "<ProjectStatus>",
  "reason": "string (optional)"
}
```

- `targetStatus` is required and must be one of the 12 canonical `ProjectStatus` values (`lib/domain/project-status.ts`). The HTTP validator accepts all 12 syntactically, including the reserved targets `CUSTOMER_REVIEW`, `REVISION_REQUIRED`, `APPROVED`, and `PUBLISHED` — those are rejected only by `transition_project_status` itself (`INVARIANT`, 422), never at the HTTP validation layer, so the transition graph is defined exactly once.
- `reason` is optional. It is trimmed; a blank or omitted value normalizes to `null`; a trimmed value over 2000 characters is rejected `BAD_REQUEST` (400) at the HTTP boundary, mirroring the RPC's own 2000-character limit.
- Unknown request fields are rejected `BAD_REQUEST` (400) — the request body shape is exact, not partial.
- A malformed project id (not a UUID) is rejected `BAD_REQUEST` (400) before any RPC call.
- Requesting the project's current status is `CONFLICT` (409).
- An illegal transition, a reserved target, or `READY_TO_PUBLISH` requested while `payment_status <> PAID` is `INVARIANT` (422).
- A missing project is `NOT_FOUND` (404).

Success (200):

```json
{
  "data": {
    "id": "uuid",
    "status": "<ProjectStatus>",
    "completedAt": "timestamptz | null",
    "archivedAt": "timestamptz | null",
    "updatedAt": "timestamptz"
  }
}
```

### 10.2 `PATCH /api/v2/internal/projects/[id]/payment`

Manual/offline payment acknowledgement only. There is no `MARK_UNPAID` and no generic payment-status setter — this endpoint can only move a project from `UNPAID` to `PAID`.

Request body (exact shape):

```json
{
  "action": "MARK_PAID"
}
```

- `action` is required and must be the literal string `"MARK_PAID"`. Any other value, a missing `action`, or an unknown field is `BAD_REQUEST` (400).
- A malformed project id is `BAD_REQUEST` (400).
- Already `PAID` is `CONFLICT` (409).
- A project in a lifecycle state that does not permit marking paid is `INVARIANT` (422).
- A missing project is `NOT_FOUND` (404).
- Success does not change `projects.status` — marking paid is independent of the manual status transition in §10.1.

Success (200):

```json
{
  "data": {
    "id": "uuid",
    "status": "<ProjectStatus>",
    "paymentStatus": "PAID",
    "paidAt": "timestamptz",
    "updatedAt": "timestamptz"
  }
}
```

### 10.3 `PATCH /api/v2/internal/projects/[id]/assignment`

Staff assignment/reassignment/unassignment. Assignment is responsibility metadata only — it is never an RLS or visibility condition on the assigned project.

Request body (exact shape):

```json
{
  "assignedStaffId": "uuid | null"
}
```

- `assignedStaffId` is required even when `null` — a missing key is `BAD_REQUEST` (400); `null` means unassign.
- A non-null value that is not a syntactically valid UUID is `BAD_REQUEST` (400).
- A malformed project id is `BAD_REQUEST` (400).
- Unknown request fields are `BAD_REQUEST` (400).
- The HTTP layer never prechecks whether a non-null assignee resolves to an active STAFF/ADMIN profile — `reassign_project_staff` is the sole authority for that invariant. An invalid, inactive, or missing assignee is `INVARIANT` (422).
- Assigning the project to its current assignee (including re-submitting the current `null`) is `CONFLICT` (409).
- A missing project is `NOT_FOUND` (404).

Success (200):

```json
{
  "data": {
    "id": "uuid",
    "assignedStaffId": "uuid | null",
    "updatedAt": "timestamptz"
  }
}
```

### 10.4 Error model

All three routes use the frozen error model (§5) exactly, mapped from the RPCs' own `PLxxx` SQLSTATE codes (migration `0024`) by a fixed, static application-owned message table — the underlying Postgres error message is never forwarded to a caller:

| HTTP | Kind | Condition |
|---|---|---|
| 400 | `BAD_REQUEST` | malformed project UUID; malformed/wrong-shape/unknown-field request body |
| 401 | `UNAUTHENTICATED` | missing/invalid staff session |
| 403 | `FORBIDDEN` | authenticated but not active STAFF/ADMIN |
| 404 | `NOT_FOUND` | project does not exist |
| 409 | `CONFLICT` | same-status / already-paid / same-assignment |
| 422 | `INVARIANT` | illegal or reserved status transition; `READY_TO_PUBLISH` without `PAID`; wrong lifecycle state for payment; invalid/inactive/missing assignee |
| 500 | `INTERNAL` | unexpected RPC failure or unexpected result shape — generic message only |
