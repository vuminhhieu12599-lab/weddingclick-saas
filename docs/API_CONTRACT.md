# WeddingClick V2 — Application Workflow & API Contract

**Status:** Approved contract freeze (Task 021, Final Revision)
**Last updated:** 2026-09-26
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
- **Image dimensions (adaptive Photo Story, PO-approved 2026-10-03):** `POST …/media/finalize` additionally accepts optional `width` / `height`: the image's natural pixel size, decoded locally by the staff browser with EXIF orientation applied. They are both-or-neither, integers from 1 to 20000, and image roles only (rejected on `AUDIO`). They are stored in the existing nullable `project_media.width` / `height` columns, so no migration is needed. They are presentation metadata only, never used for authorization, storage, or the MIME/size policy, which stays Storage-authoritative. Rows uploaded earlier keep `null`.
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

> **Status note (Task 029 freeze, 2026-09-26):** Task 029 was delivered and frozen as **internal Invitation Visual Prototypes only** (`docs/DECISIONS.md` "Task 029"). None of the production Rendering Foundation deliverables listed above have been built yet. They remain an outstanding prerequisite, so Task 030's hard dependency is **not yet satisfied** and **Task 030 must not start yet**. No task/roadmap renumbering was performed, and no task number has been assigned to the remaining foundation work.
>
> **Tracking (RF-00, 2026-09-26):** the outstanding work is tracked as the **Invitation Rendering Foundation**, with implementation checkpoints `RF-00`, `RF-01`, …. These checkpoint IDs are not roadmap task numbers. Its frozen contract lives in `docs/DECISIONS.md` "Invitation Rendering Foundation — RF-00 Contract Closure". That contract covers variant/event resolution, the `payloadSchemaVersion: 1` snapshot payload, the payload-vs-`InvitationViewModel` split, and the media URL boundary. Task 030's dependency on "029" means that document's **foundation completion gate (RF16)**, whose proving renderer is Elegant Editorial v1. A staff preview route is not part of that gate.
>
> **Contract recovery (RF-00, 2026-09-26):** lunar date is manual display text owned by each event (`docs/DECISIONS.md` RF6), so the foundation now has these API/schema prerequisites:
> - **Schema migration: YES.** Checkpoints RF-L01/RF-L02 add nullable `project_events.lunar_date_display` and redefine the existing `create_project_event`/`update_project_event` business actions. This is the one approved additive exception to the §9 "no frozen table shape change" rule; see the DECISIONS RF17 "Frozen-table-shape clarification".
> - **Project Events API/domain: YES.** Checkpoint RF-L03 extends the existing Task 023 staff Project Events read/write contract (`GET`/`POST` `/api/v2/internal/projects/[id]/events` and `PUT` `.../events/[eventId]`; `DELETE` is unaffected) with `lunarDateDisplay`. This stays Path A with the same `CANONICAL_DATA_APPLIED` action type.
> - **Unchanged:** the Task 028 Project Design APIs. No `service_role` and no new public endpoint.
> - Task 030 stays blocked until the revised RF16 gate, which includes RF-L01–RF-L03, is met.

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
| **029** | **Invitation Rendering Foundation** (Wedding Domain Resolver, `InvitationViewModel` builder, template registry, variant/event resolution, snapshot payload construction, media reference extraction). *Delivered as internal visual prototypes only. The production foundation is still outstanding and is tracked as the Invitation Rendering Foundation (RF checkpoints); see the §7.2 status note.* | 022, 023, 028 |
| **030** | Review Workflow (`create_review_version`, REVIEW resolve, `submit_review_feedback`) | **029 hard dependency**: satisfied only by the Invitation Rendering Foundation completion gate (`docs/DECISIONS.md` RF16) |
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

---

## 11. Task 026 Phase 3 — Staff Access-Link Issue/Rotate/Revoke HTTP Contract (frozen)

Phase 3 implements the HTTP surface over the three trusted business actions frozen in migration `0025_access_link_actions.sql` (Task 026 §8, `docs/DECISIONS.md` D14): `issue_review_link`, `rotate_access_link`, `revoke_access_link`, plus the direct-RLS INTAKE/PORTAL issuance path (§7.4). All three routes are internal STAFF/ADMIN endpoints — `requireStaff` only, per §2's Path A; there is no ADMIN-only branch on any of the three. No public/customer token-resolution route exists here or anywhere in Task 026 — that remains later-workflow-task scope (027/030/032), per D1.

### 11.1 `POST /api/v2/internal/projects/[id]/access-links`

Issues a new access link. Request body (exact shape):

```json
{
  "linkType": "INTAKE | REVIEW | PORTAL",
  "expiresAt": "RFC3339 timestamp | null"
}
```

- `linkType` is required and must be one of the three canonical `AccessLinkType` values. `expiresAt` is optional; omitted or explicit `null` both mean "never expires." A non-null value must be a valid RFC 3339 timestamp — a valid past, exactly-now, or future timestamp is all accepted; there is no TTL minimum, maximum, or default (`docs/DECISIONS.md` D6).
- Unknown request fields are rejected `BAD_REQUEST` (400) — the request body shape is exact. In particular, a caller-supplied `token`, `rawToken`, `tokenHash`, `tokenHint`, `createdBy`, or `projectId` is rejected the same way any other unknown field is; none of those are legal request fields.
- A malformed project id (not a UUID) is rejected `BAD_REQUEST` (400) before any DB call.
- **INTAKE/PORTAL:** a direct-RLS existence check on the target Project precedes a direct-RLS `INSERT` carrying exactly the six issuance columns (`docs/DECISIONS.md` D12); a missing Project is `NOT_FOUND` (404). No activity log is written (§7.4, unchanged).
- **REVIEW:** no pre-read; `issue_review_link` is called directly, and its own AL002 is the sole authority for a missing Project (`NOT_FOUND`, 404). Audited `REVIEW_LINK_ISSUED` (§6) inside the RPC.

Success (201):

```json
{
  "data": {
    "id": "uuid",
    "projectId": "uuid",
    "linkType": "INTAKE | REVIEW | PORTAL",
    "token": "<one-time raw opaque token>",
    "expiresAt": "timestamptz | null",
    "createdAt": "timestamptz"
  }
}
```

`token` is the raw capability token, returned exactly once. The raw token itself is never persisted — the database persists only non-raw token material: `token_hash` (a SHA-256 digest of the raw token) and `token_hint` (the raw token's final 8 characters, display-only, never used for lookup or authentication). The response never includes `tokenHint` or `token_hash`. Every response from this route — success or error — carries `Cache-Control: no-store`.

### 11.2 `POST /api/v2/internal/projects/[id]/access-links/[linkId]/rotate`

Rotates an existing access link. **Takes no request-body input** — every mutation input (a fresh raw token, hash, and hint) is generated server-side, so the route never reads the request body at all.

- Malformed project or link id (not a UUID) is `BAD_REQUEST` (400).
- Calls `rotate_access_link` (`docs/DECISIONS.md` D8) — the source link must exist, belong to the project, be unrevoked, and be unexpired. A not-found source is `NOT_FOUND` (404, AL003). An already-revoked source is `CONFLICT` (409, AL004). An expired source is `CONFLICT` (409, AL005) — expired links are not rotatable; revocation remains available instead. No sibling link of the same `(project_id, link_type)` is touched (D2).
- Audited `ACCESS_LINK_ROTATED` (§6) inside the RPC.

Success (200):

```json
{
  "data": {
    "id": "uuid",
    "projectId": "uuid",
    "linkType": "INTAKE | REVIEW | PORTAL",
    "token": "<NEW one-time raw opaque token>",
    "expiresAt": "timestamptz | null",
    "createdAt": "timestamptz"
  }
}
```

`token` is the **new** raw token only — the old token is never re-derivable (neither the RPC nor the repository ever returns `token_hash`) and never appears in this response. Every response from this route — success or error — carries `Cache-Control: no-store`.

### 11.3 `POST /api/v2/internal/projects/[id]/access-links/[linkId]/revoke`

Revokes an existing access link. **Takes no request-body input**, for the same reason as rotate — no token generation occurs at all.

- Malformed project or link id is `BAD_REQUEST` (400).
- Calls `revoke_access_link` (`docs/DECISIONS.md` D9) — the target link must exist and belong to the project. An already-revoked target is `CONFLICT` (409, AL004). An expired-but-not-revoked target may still be revoked — expiry never blocks revocation. There is no un-revoke path.
- Audited `ACCESS_LINK_REVOKED` (§6) inside the RPC.

Success (200):

```json
{
  "data": {
    "id": "uuid",
    "projectId": "uuid",
    "linkType": "INTAKE | REVIEW | PORTAL",
    "revokedAt": "timestamptz"
  }
}
```

No token field of any kind. `Cache-Control: no-store` is not required on this route (nothing secret in the payload).

### 11.4 Error model

All three routes use the frozen error model (§5), but the error *mapping mechanism* differs by path — not all three are RPC-based:

- **Direct INTAKE/PORTAL issue** (§11.1) is not RPC-based at all: a malformed request/UUID is `BAD_REQUEST`; a missing Project — detected via the staff-RLS `projectExists` precheck — is `NOT_FOUND`; an unexpected `INSERT` failure (including a residual FK race after the precheck), an unexpected result shape, or a token-hash collision is generic `INTERNAL`. No raw PostgreSQL error-string matching ever occurs.
- **REVIEW issuance, rotation, and revocation** each call exactly one migration-`0025` trusted RPC and are mapped from that RPC's own `ALxxx` SQLSTATE code (migration `0025`) by the fixed, static `ACCESS_LINK_RPC_ERROR_CODES` map — the underlying Postgres error message is never forwarded to a caller.

`EXPIRED_TOKEN`/`REVOKED_TOKEN` (410) are token-*resolution* error kinds (§4.1, customer/guest-facing) and are never used here — an expired rotation source is `CONFLICT` (409, AL005), not 410, because this is a staff mutation conflict, not a customer token-consumption failure:

| HTTP | Kind | Condition |
|---|---|---|
| 400 | `BAD_REQUEST` | malformed project/link UUID; malformed/wrong-shape/unknown-field issue body |
| 401 | `UNAUTHENTICATED` | missing/invalid staff session |
| 403 | `FORBIDDEN` | authenticated but not active STAFF/ADMIN (AL001, REVIEW/rotate/revoke only — the direct INTAKE/PORTAL path is authorized by RLS, not an AL code) |
| 404 | `NOT_FOUND` | **Project does not exist** — via the INTAKE/PORTAL direct `projectExists` precheck, or via AL002 (raised only by REVIEW issuance's `issue_review_link` RPC). **Access link does not exist, or does not resolve to the requested project** — AL003 (rotate/revoke). Both conditions are the same 404/`NOT_FOUND` outcome; no new observable distinction is introduced. |
| 409 | `CONFLICT` | access link already revoked (AL004, rotate/revoke); access link expired and not rotatable (AL005, rotate only) |
| 500 | `INTERNAL` | unexpected RPC failure or unexpected RPC result shape; unexpected direct-`INSERT` failure (including a residual FK race after the `projectExists` precheck); a token-hash collision (either path); or a mutation-result identity mismatch (an RPC-returned row's project/id does not match the request) — generic message only, never a raw Postgres detail |

---

## 12. Task 027 — Intake Workflow HTTP Contract (frozen)

Phase 2 implements the HTTP surface over the three trusted business actions frozen in migration `20260911041146_0026_intake_actions.sql` (Task 027 Phase 1, `docs/DECISIONS.md`): `submit_intake_submission`, `apply_intake_submission`, `reject_intake_submission`. Unlike §§10–11, the PUBLIC submit route uses Path B (§1) — no Supabase Auth session exists — while the three STAFF routes use Path A (`requireStaff`), identical in kind to Tasks 025/026 Phase 3.

### 12.1 `POST /api/v2/public/intake-submissions`

Public customer INTAKE submission. Transport auth is `Authorization: Bearer <raw INTAKE token>` — never a Supabase Auth session. Frozen order: transport-auth parse → `resolveAccessLink` (the existing Task 026 Phase 2 resolver, `expectedLinkType: "INTAKE"`, `expectedProjectId` omitted) → body parse/validation → `submit_intake_submission` RPC via `service_role`. `projectId`/`accessLinkId` are never read from the URL or the request body — both come only from the resolved token context.

- Missing/malformed transport (`Authorization` absent, wrong scheme, or an empty bearer credential): `401` `UNAUTHENTICATED`, resolved before the resolver is ever invoked.
- Malformed token shape, unknown token hash, or a non-INTAKE-purpose token: `404` `NOT_FOUND` (§4.1 anti-enumeration — indistinguishable from each other).
- Revoked INTAKE link: `410` `REVOKED_TOKEN`.
- Expired INTAKE link: `410` `EXPIRED_TOKEN`.
- Request body must be exactly `{ "weddingDetails": { ...the Task-022 writable Wedding Details fields... } }`; a non-object body, an unknown top-level field, or a missing `weddingDetails` key: `400` `BAD_REQUEST`. Auth/token resolution always precedes body parsing — a malformed-JSON body never preempts or reorders a transport/resolver failure above.

Success (201):

```json
{
  "id": "uuid",
  "projectId": "uuid",
  "status": "PENDING",
  "createdAt": "timestamptz"
}
```

Never echoes the raw token, `token_hash`, `token_hint`, `accessLinkId`, or the submitted payload. Every response from this route — success or error — carries `Cache-Control: no-store`. Multiple simultaneously-`PENDING` submissions per Project are permitted by design (no partial unique index, no auto-supersede of a sibling submission).

### 12.2 `GET /api/v2/internal/projects/[id]/intake-submissions`

Staff list. Path A only — direct-RLS `SELECT` (`is_staff()`), never `service_role`.

- Malformed project id: `400` `BAD_REQUEST`.
- Missing/invalid staff session: `401` `UNAUTHENTICATED`.
- Project does not exist: `404` `NOT_FOUND`.
- An empty result (`"data": []`) is a valid `200`, not an error.

Success (200): `{ "data": [ <IntakeSubmissionRecord>, ... ] }`, newest-first by `submittedAt`. Each record: `id`, `projectId`, `accessLinkId`, `status`, `submittedAt`, `reviewedBy`, `reviewedAt`, `staffNote`, `weddingDetails` (the stored 20-key Task-022 snapshot). Never includes a `token`/`tokenHash`/`tokenHint` field.

### 12.3 `GET /api/v2/internal/projects/[id]/intake-submissions/[submissionId]`

Staff detail. Same auth/RLS boundary as §12.2.

- Malformed project or submission id: `400` `BAD_REQUEST`.
- Project does not exist: `404` `NOT_FOUND`.
- Submission does not exist, **or exists but belongs to a different Project**: both collapse to the same `404` `NOT_FOUND` — no cross-project existence leakage.

Success (200): `{ "data": <IntakeSubmissionRecord> }` (same shape as one §12.2 row).

### 12.4 `POST /api/v2/internal/projects/[id]/intake-submissions/[submissionId]/apply`

Applies a `PENDING` submission's stored immutable snapshot to canonical `wedding_details` via `apply_intake_submission`, composing Task 022's `save_wedding_details()` exactly once.

**Frozen no-body contract:** this route never reads a request body under any circumstance — a body-less request and a request carrying deliberately malformed/non-JSON bytes produce the identical result. The stored snapshot is the only apply source.

- Malformed project or submission id: `400` `BAD_REQUEST` (checked before any RPC call).
- Missing/invalid staff session: `401` `UNAUTHENTICATED`.
- Project does not exist: `404` `NOT_FOUND` (`IS003`).
- Submission does not exist or belongs to a different Project: `404` `NOT_FOUND` (`IS007`).
- Submission is not `PENDING` (already `APPLIED`/`REJECTED`): `409` `CONFLICT` (`IS008`) — no idempotent success on a repeat.
- A propagated `WD004` (Gift QR media same-Project FK violation) from the nested `save_wedding_details()` call: `422` `INVARIANT` (checked against the existing `SAVE_WEDDING_DETAILS_RPC_ERROR_CODES` map after the Task-027-native `IS`xxx map).
- Any other unrecognized SQLSTATE: generic `500` `INTERNAL`.

Success (200):

```json
{
  "id": "uuid",
  "projectId": "uuid",
  "status": "APPLIED",
  "reviewedBy": "uuid",
  "reviewedAt": "timestamptz",
  "weddingDetailsChanged": "boolean"
}
```

`CANONICAL_DATA_APPLIED` (§6) is emitted — or correctly suppressed on a true no-op — exclusively by the nested `save_wedding_details()` call; `apply_intake_submission` never calls `log_activity` itself.

### 12.5 `POST /api/v2/internal/projects/[id]/intake-submissions/[submissionId]/reject`

Rejects a `PENDING` submission via `reject_intake_submission`. Never mutates canonical `wedding_details`; no activity type exists for rejection in the frozen Activity Union (§6), and none is emitted.

Frozen order: transport auth → `requireStaff` → body parse/validation → RPC. The request body is read only after staff authorization has already succeeded — a missing/wrong-scheme/empty-bearer transport failure, or an authenticated-but-non-staff caller, never triggers a body read.

Request body (exact shape):

```json
{ "staffNote": "string | null (optional)" }
```

`staffNote` is optional; omitted or explicit `null` both normalize to `null`; a non-null value is trimmed, and an empty-after-trim result also normalizes to `null`. No business max-length is enforced beyond the unbounded `TEXT` column.

- Missing/invalid staff session: `401` `UNAUTHENTICATED` — checked before the body is ever read.
- Active staff + malformed JSON, a non-object body, or an unknown field: `400` `BAD_REQUEST`.
- Malformed project or submission id: `400` `BAD_REQUEST`.
- Project does not exist: `404` `NOT_FOUND` (`IS003`).
- Submission does not exist or belongs to a different Project: `404` `NOT_FOUND` (`IS007`).
- Submission is not `PENDING`: `409` `CONFLICT` (`IS008`).

Success (200):

```json
{
  "id": "uuid",
  "projectId": "uuid",
  "status": "REJECTED",
  "reviewedBy": "uuid",
  "reviewedAt": "timestamptz",
  "staffNote": "string | null"
}
```

### 12.6 Cross-cutting

- Every Task 027 route response — success or error, all five endpoints — carries `Cache-Control: no-store`.
- No rate limiting exists in Task 027 (deferred to Task 035, §7.6).
- No events/media/lifecycle/publish/portal/guest/RSVP behavior of any kind is touched by any Task 027 route.
- `service_role` is used only by the PUBLIC submit route (via the existing Task-026 resolution repository and a narrow, isolated Task-027 intake-submit repository — the two never import each other). All three STAFF routes use exclusively the authenticated staff client for both reads (RLS) and mutations (RPC `EXECUTE`) — never `service_role`.

---

## 13. Task 028 — Project Design APIs HTTP Contract (frozen)

Implements the application/API layer over the already-frozen `project_design`/`templates`/`template_versions` schema (migrations `0010`/`0011`) — no migration was required. All three routes are internal STAFF/ADMIN endpoints (`requireStaff` only, Path A) — direct RLS reads/writes throughout; no `service_role`, no RPC (`project_design` get/upsert has no corresponding action type in the frozen Activity Union, §6, so it is never a trusted business action). Every response from every route — success or error — carries `Cache-Control: no-store`.

### 13.1 `GET /api/v2/internal/templates`

Complete template/version catalog — active and inactive template families, retired and non-retired versions all included, never filtered out. `templates` ordered `sort_order ASC, id ASC`; nested `versions[]` ordered `version_number ASC, id ASC`.

Success (200):

```json
{
  "data": [
    {
      "id": "uuid", "code": "string", "eventType": "WEDDING", "name": "string",
      "description": "string | null", "isActive": "boolean", "sortOrder": "number",
      "previewMediaPath": "string | null",
      "versions": [
        {
          "id": "uuid", "versionNumber": "number", "rendererKey": "string",
          "designManifest": "TemplateDesignManifestV1 — see docs/TEMPLATE_SYSTEM.md §6",
          "retiredAt": "timestamptz | null", "selectable": "boolean"
        }
      ]
    }
  ]
}
```

`selectable` is server-derived (`templates.is_active === true && template_versions.retired_at === null`) — never accepted from a client, and does not factor in any Project's `event_type` (this route has no Project context; `PUT /design`, §13.3, is the real event-type compatibility authority). The raw `template_versions.manifest` JSONB is never exposed — only the validated `TemplateDesignManifestV1` subset (`designManifest`, `docs/TEMPLATE_SYSTEM.md` §6) is. A malformed persisted manifest fails the whole request closed (generic `500` `INTERNAL`), never a partial/degraded catalog.

- Missing/invalid staff session: `401` `UNAUTHENTICATED`.
- Malformed persisted design-manifest subset on any version: `500` `INTERNAL`.

### 13.2 `GET /api/v2/internal/projects/[id]/design`

Reads the Project's current mutable design selection. No join/duplication of template/version metadata — the caller resolves `templateVersionId` against §13.1's already-complete catalog.

Success (200): `{ "data": ProjectDesignRecord | null }` — `null` when the Project exists but has no design row yet.

```text
ProjectDesignRecord = {
  id, projectId, templateVersionId, paletteKey, fontPresetKey, effectPresetKey,
  sectionSettings: Record<string, string | number | boolean>,
  designSettings: Record<string, string | number | boolean>,
  createdAt, updatedAt
}
```

- Malformed project id: `400` `BAD_REQUEST`.
- Missing/invalid staff session: `401` `UNAUTHENTICATED`.
- Project does not exist: `404` `NOT_FOUND`.

### 13.3 `PUT /api/v2/internal/projects/[id]/design`

Direct-RLS upsert (`.upsert(..., { onConflict: "project_id" })`) — one design row per Project, last-write-wins (no optimistic concurrency token).

**Frozen auth/body ordering:** transport-auth parse → `requireStaff` → lazy body read (invoked only once staff authorization has already succeeded) → body-shape validation → use case. A missing/wrong-scheme/expired-token transport failure, or an authenticated-but-non-staff caller, never triggers a body read — identical in kind to Task 027 Phase 2's Finding A precedent (§12.5).

Request body — exactly the closed six fields, no others accepted:

```json
{
  "templateVersionId": "uuid",
  "paletteKey": "string", "fontPresetKey": "string", "effectPresetKey": "string",
  "sectionSettings": { "<key>": "string | number | boolean" },
  "designSettings": { "<key>": "string | number | boolean" }
}
```

No caller-controlled `id`/`projectId`/`createdAt`/`updatedAt`/`templateId`/`templateCode`/`rendererKey`/`manifest`/`designManifest`/`isActive`/`retiredAt`/`selectable` — any such field is rejected outright (`400`).

Save algorithm: validate body shape → read Project → read current design (if any) → read requested `template_versions` row → read parent `templates` row → validate the persisted `TemplateDesignManifestV1` subset → event-type compatibility → retired/inactive selection rule → validate submitted config against the manifest → upsert → return.

**Version pinning:** `templateVersionId` pins an exact immutable `template_versions` row, never a template family — deterministic/reproducible across draft edits.

**Inactive/retired rule:** a **new or changed** `templateVersionId` selection targeting a retired version, or a version under an inactive template, is rejected. An **unchanged** existing selection (`templateVersionId` identical to the Project's current stored design) may continue receiving config edits even after its template/version later becomes inactive/retired — grandfathered, matching `template_versions.retired_at`'s own documented semantics (`docs/PHYSICAL_DATABASE_PLAN.md` §2.11: "only blocks new selection, never resolution of an already-referenced version").

Success (200): `{ "data": ProjectDesignRecord }` (same shape as §13.2).

Error table:

| Condition | Kind | HTTP |
|---|---|---|
| Missing/malformed Authorization, invalid/expired token | `UNAUTHENTICATED` | 401 |
| Authenticated, not active STAFF/ADMIN | `FORBIDDEN` | 403 |
| Malformed JSON body (active staff) | `BAD_REQUEST` | 400 |
| Malformed project id / `templateVersionId` / closed-body-shape violation | `BAD_REQUEST` | 400 |
| Project not found | `NOT_FOUND` | 404 |
| `template_versions` row not found | `NOT_FOUND` | 404 |
| New/changed selection targets an inactive template or a retired version | `INVARIANT` | 422 |
| `templates.event_type ≠ projects.event_type` | `INVARIANT` | 422 |
| Submitted `paletteKey`/`fontPresetKey`/`effectPresetKey`/`sectionSettings`/`designSettings` violates the selected manifest (undeclared key, wrong type, value outside `enumValues`) | `INVARIANT` | 422 |
| Malformed persisted design-manifest subset, malformed DB row/result, unexpected DB failure | `INTERNAL` | 500 |

### 13.4 Cross-cutting

- Every Task 028 route response — success or error, all three endpoints — carries `Cache-Control: no-store`.
- No `service_role`, no RPC, no activity logging (no activity type exists for design changes in the frozen Activity Union, §6), no project lifecycle mutation, no `invitation_versions`/`project_invitations` access.
- No template catalog seeding, no renderer/UI implementation — both remain Task 029+ scope.
- See `docs/TEMPLATE_SYSTEM.md` §6 for the full `TemplateDesignManifestV1`/`ManifestSettingSpec` contract this feature validates against, and `docs/DECISIONS.md` "Task 028 — Project Design APIs" for the full decision record and DEV/STAGING verification evidence.

## 14. Staff Invitation Preview HTTP Contract

### 14.1 `GET /api/v2/internal/projects/[id]/preview?variant=COMMON|GROOM|BRIDE`

Staff-only, read-only. It runs `requireStaff` and then the frozen `buildStaffInvitationPreview` over the staff-scoped production wiring (`docs/ARCHITECTURE.md`). An absent `variant` means `COMMON`. Any other value is rejected by the use case. The page that calls it is `/admin/v2/projects/[projectId]/preview`. The variant lives only in that page's URL and is never persisted.

Success (200): `{ "data": { "status": "READY", "rendererKey", "viewModel", "sections" } | { "status": "BLOCKED", "issues": SnapshotPayloadIssue[] } }`. The in-memory Snapshot is not returned. `viewModel` carries runtime-only signed media URLs.

| Condition | Kind | HTTP |
|---|---|---|
| Missing/malformed Authorization, invalid/expired token | `UNAUTHENTICATED` | 401 |
| Authenticated, not active STAFF/ADMIN | `FORBIDDEN` | 403 |
| Malformed project id / invalid `variant` | `BAD_REQUEST` | 400 |
| Project not visible | `NOT_FOUND` | 404 |
| Project has no design configured | `CONFLICT` | 409 |
| Invariant, load, media-resolver or renderer-selection failure | `INTERNAL` | 500 (generic body) |

- Every response carries `Cache-Control: no-store`.
- No `service_role`, no write of any kind, no `invitation_versions`, no publish, no token or public link.

## 15. Staff Optional Content (Timeline / Dress Code) HTTP Contract

Staff-only draft-data CRUD that populates the optional content the frozen Snapshot builder already consumes (`docs/DECISIONS.md` RF7 Timeline and Dress Code amendments). Every route runs `requireStaff` and then one plain staff-RLS statement on the 0029/0030 tables, scoped by the URL `project_id` (and row id). This is safe structured content with no activity type in the frozen Activity Union (§6), so it stays on the direct-RLS path (§3.1). Media for the same editor reuses the Task 024 endpoints unchanged (§3.2), and Gift bank/QR plus Love Story text reuse the Task 022 `PUT …/wedding-details` full-replace save.

| Route | Body | Success |
|---|---|---|
| `GET …/projects/[id]/timeline` | — | 200 `{ data: ProjectTimelineItemRecord[] }` (sort_order, then id; `time` is `HH:mm`) |
| `POST …/projects/[id]/timeline` | `{ time: "HH:mm", label, sortOrder }` (all required) | 201 `{ data }` |
| `PATCH …/projects/[id]/timeline/[itemId]` | any non-empty subset of `time`/`label`/`sortOrder` | 200 `{ data }` |
| `DELETE …/projects/[id]/timeline/[itemId]` | — | 200 `{ deleted: true }` |
| `GET …/projects/[id]/dress-code` | — | 200 `{ data: { dressCode, swatches } \| null }` |
| `PUT …/projects/[id]/dress-code` | `{ description: string \| null }` (blank → `null`) | 200 `{ data: ProjectDressCodeRecord }` (creates or updates the one row) |
| `POST …/projects/[id]/dress-code/swatches` | `{ color: "#rrggbb", sortOrder }` | 201 `{ data }` |
| `PATCH …/projects/[id]/dress-code/swatches/[swatchId]` | any non-empty subset of `color`/`sortOrder` | 200 `{ data }` |
| `DELETE …/projects/[id]/dress-code/swatches/[swatchId]` | — | 200 `{ deleted: true }` |

Validation: strict allow-listed bodies (unknown keys are rejected); `time` is a 24-hour `HH:mm` (stored as TIME(0), seconds zero); `label` is trimmed, non-blank, at most 200 characters; `description` is trimmed, at most 1000 characters; `color` is strict lowercase `#rrggbb` and is never normalized server-side; `sortOrder` is an int4 integer. No default time, label, description or colour is ever invented.

| Condition | Kind | HTTP |
|---|---|---|
| Missing/malformed Authorization, invalid/expired token | `UNAUTHENTICATED` | 401 |
| Authenticated, not active STAFF/ADMIN | `FORBIDDEN` | 403 |
| Malformed project/item/swatch id, invalid body | `BAD_REQUEST` | 400 |
| Project not visible; item/swatch not in this Project | `NOT_FOUND` | 404 |
| Swatch created before the Project's Dress Code row exists | `CONFLICT` | 409 |
| Unexpected DB failure / malformed row | `INTERNAL` | 500 (generic body) |

- No `service_role`, no RPC, no activity logging, no `invitation_versions`, no publish, no token or public link. Timeline is never derived from `project_events`.

## 16. Task 030 — Staff Review Snapshot HTTP Contract

Staff-only (Path A: Bearer → `requireStaff` → staff-scoped client → RLS). No `service_role`. Every response carries `Cache-Control: no-store`.

**Lifecycle.** Draft → immutable REVIEW version → customer approval → (Task 031) publish. REVIEW versions are append-only: a new review never edits an older one, and `published_version_id` is never touched here. Publish remains Task 031.

**Required variants (canonical).** `projects.package_code_snapshot`: `COMMON` → `COMMON`; `SEPARATE` → `GROOM` + `BRIDE`. Any other code has no policy and fails closed. TypeScript `lib/domain/invitation-variant-policy.ts`, enforced again in the database by `create_review_version` (migration 0036).

### 16.1 `POST /api/v2/internal/projects/[id]/review/versions`

Body (strict allow-list, any other key → 400): `{ "variant": "COMMON"|"GROOM"|"BRIDE", "expectedCurrentReviewVersionId": uuid | null }`. The browser never sends a Snapshot, renderer key, template version or media list.

The server builds the Snapshot from the CURRENT draft through the same pipeline as Staff Preview (`loadStaffDraftSnapshot` → `buildSnapshotPayload`), proves the exact pinned renderer can serve it (no fallback), asserts it contains no storage/signed URL, extracts media refs with the frozen extractor, then calls `create_review_version` (one atomic, audited transaction; see `docs/PHYSICAL_DATABASE_PLAN.md` §2.14). The persisted payload is the URL-free Snapshot Payload v1; runtime media URLs are resolved only at render time.

`expectedCurrentReviewVersionId` is a compare-and-set token: it must equal the invitation's `current_review_version_id` (`null` = none yet). A double-click or concurrent duplicate carrying the same expectation creates exactly one version; the other gets 409.

**Status side effect (Task 030B, migration 0037).** In the same transaction, a successful creation recomputes and saves the aggregate review outcome over all required current variants. The new version is unapproved, so this is `CUSTOMER_REVIEW` (including after `REVISION_REQUIRED` or `APPROVED`) unless another required variant still has an unreplaced revision request (`REVISION_REQUIRED`). A Project in `PUBLISHED` / `COMPLETED` / `ARCHIVED` is rejected with 409 (RV010) and nothing is written. Payment status is never changed.

| Condition | Kind | HTTP |
|---|---|---|
| Created | — | 201 `{ data: { id, invitationId, projectId, variant, versionNumber, templateVersionId, rendererKeySnapshot, createdAt } }` |
| Canonical data BLOCKED (nothing written) | — | 422 `{ error, issues: SnapshotPayloadIssue[] }` |
| Missing/invalid token | `UNAUTHENTICATED` | 401 |
| Not active STAFF/ADMIN | `FORBIDDEN` | 403 |
| Malformed id/body/JSON, unknown body key | `BAD_REQUEST` | 400 |
| Project not visible | `NOT_FOUND` | 404 |
| No design; design/binding changed; stale `expectedCurrentReviewVersionId`; media changed; Project already PUBLISHED/COMPLETED/ARCHIVED | `CONFLICT` | 409 |
| Variant not required by the package; package has no policy; pinned renderer cannot serve the Snapshot | `INVARIANT` | 422 |
| Unexpected DB/loader/invariant failure | `INTERNAL` | 500 (generic body) |

### 16.2 `GET /api/v2/internal/projects/[id]/review`

200 `{ data: ProjectReviewState }`: `requiredVariants` (or `null` without a policy), per required variant its `invitationId`, current REVIEW version (number, created time, pinned template version / renderer key) `approvalState` (`AWAITING_FEEDBACK` | `REVISION_REQUESTED` | `APPROVED`; a revision request outranks an approval on the same version), `approved`, `revisionRequested` and that version's `feedback` (type, customer message, time), plus `projectStatus` (persisted), `allRequiredVariantsApproved` and `reviewOutcome` (`CUSTOMER_REVIEW` | `REVISION_REQUIRED` | `APPROVED` by the owner precedence, `null` with no policy or no review yet). A variant is approved only when an `APPROVAL` row exists for **its own current** review version: approving review N never approves N+1, and COMMON never approves GROOM/BRIDE (`[R-Q2]`). Task 031 publish eligibility consumes this read model; it is never true without a policy.

### 16.3 `GET /api/v2/internal/projects/[id]/review/versions/[versionId]/preview`

200 `{ data: { status: "READY", version, rendererKey, viewModel, sections } }`. Renders only the persisted REVIEW Snapshot with its pinned binding. It never loads or rebuilds the mutable draft and never falls back to draft preview. A stored payload that disagrees with its row is a 500. Unknown version → 404. The staff UI opens it through `/admin/preview-frame/[projectId]?reviewVersionId=…`.

### 16.4 Not in this task

No PUBLISHED version, no `published_version_id`, no public `/i/[slug]`, no Open Graph, no guest token and no RSVP. Customer review is §17.

## 17. Task 030B — Customer REVIEW Contract (Path B)

Customer REVIEW uses the existing Task 026 REVIEW access link: Project-scoped, live across revision rounds (`[R-Q2]`), opaque 43-character token, SHA-256 hash lookup, 404 for malformed/unknown/wrong-purpose, 410 for revoked/expired, `last_used_at` on success. The raw token never reaches the database; only the resolved `{ projectId, accessLinkId }` does. Both customer RPCs (migration 0037, `EXECUTE` for `service_role` only) re-validate that context first. No email identity, no `?guest=`, no Project-id or version-id authorization.

### 17.1 Page `GET /review/[token]`

Server-rendered, dynamic, `noindex`, `referrer: no-referrer`. This is not the public invitation route. Flow: `resolveAccessLink(REVIEW)` → `get_customer_review` → for each required variant's **current** REVIEW version, the integrity gate (stored payload must match its row's variant, template version and renderer key) → runtime media signing → `buildInvitationViewModel` → exact pinned renderer (no fallback) → `InvitationRendererHost` (production host: no RSVP capability). It never loads or rebuilds the mutable draft. SEPARATE projects switch variants with `?v=GROOM|BRIDE`; `v` is display selection only, never authorization. Invalid link → "Không tìm thấy bản duyệt"; revoked/expired → "Link duyệt đã hết hiệu lực"; no review yet → "Bản duyệt chưa sẵn sàng". No token, Project or DB detail is echoed.

**Media.** Only `project_media` rows pinned to that exact version through `invitation_version_media` are returned, and only those the persisted Snapshot references (in the `project-media` bucket) are signed, through `lib/server/supabase/customer-review-media-signer.ts` (CUSTOMER REVIEW MEDIA SIGNING ONLY, 1 hour). Anything else is `UNAVAILABLE`. Signed URLs live only in the rendered ViewModel and are never persisted. `SOCIAL_SHARE_COVER` is never pinned in a REVIEW, so it is never signed here.

### 17.2 `POST /api/v2/public/review-feedback`

`Authorization: Bearer <raw REVIEW token>` (never a Supabase session). The body is read only after token resolution. Strict body (unknown key → 400): `{ "invitationVersionId": uuid, "feedbackType": "COMMENT"|"REVISION_REQUEST"|"APPROVAL", "message"?: string|null }`. `message` is trimmed; required for COMMENT and REVISION_REQUEST, optional for APPROVAL; at most 2000 characters. The browser never sends a status, Project id or access-link id. One call to `submit_review_feedback` does everything in one transaction (see `PHYSICAL_DATABASE_PLAN.md` §2.18). Every response is `no-store`.

| Condition | HTTP |
|---|---|
| Recorded | 201 `{ data: { id, invitationVersionId, feedbackType, createdAt, projectStatus } }` |
| No bearer token | 401 |
| Malformed body / invalid type or message (incl. RV014) | 400 |
| Malformed / unknown / wrong-purpose token; version not a REVIEW of a required variant (RV011/RV015) | 404 |
| Revoked / expired link (incl. race, RV012/RV013) | 410 |
| Version superseded (RV016) | 409 `{ error, reason: "REVIEW_SUPERSEDED" }` |
| Project status not open for feedback (RV017) | 409 `{ error, reason: "REVIEW_CLOSED" }` |
| Decision already recorded on this version: APPROVAL after any decision, or REVISION_REQUEST after APPROVAL (RV018) | 409 `{ error, reason: "ALREADY_DECIDED" }` |
| Anything else | 500 (generic body) |

### 17.3 Review status lifecycle (Product Owner decisions)

| Event | `projects.status` |
|---|---|
| New current REVIEW created (any required variant, including after `REVISION_REQUIRED` or `APPROVED`) | recomputed aggregate: `CUSTOMER_REVIEW` unless another required variant still has an unreplaced revision request (`REVISION_REQUIRED`) |
| COMMENT | unchanged |
| REVISION_REQUEST on a required variant's current review | `REVISION_REQUIRED` |
| APPROVAL, then recompute over all required variants' current reviews | any revision request → `REVISION_REQUIRED`; else all approved → `APPROVED`; else `CUSTOMER_REVIEW` |
| Any feedback on a superseded version | rejected (409); status unchanged |
| REVISION_REQUEST after APPROVAL on the same version | rejected (409); status unchanged. APPROVAL is final for that version; changes need a new REVIEW version |

Customer feedback is accepted only while the status is `CUSTOMER_REVIEW`, `REVISION_REQUIRED` or `APPROVED`. Approving COMMON never approves GROOM/BRIDE, approving GROOM never approves BRIDE, and approving review N never approves N+1. `APPROVED` does not mean `PAID`, `READY_TO_PUBLISH` or `PUBLISHED`. The Task 025 graph (`APPROVED → AWAITING_PAYMENT → READY_TO_PUBLISH` only when PAID) is unchanged. Publication is Task 031.

### 17.4 Staff UI

The Duyệt tab shows the persisted project status, the review outcome, each required variant's current review with its customer feedback, "Tạo bản duyệt mới", and "Tạo link duyệt", which uses the existing Task 026 issue route and shows the `/review/<token>` URL once. No publish action.

## 18. Task 031 — Staff Publish HTTP Contract

Path A (Bearer → `requireStaff` → staff-scoped client → RLS). Every response is `Cache-Control: no-store`. There is no public publish endpoint and no `service_role` path.

**Publication source.** A PUBLISHED version is always a verbatim copy of the invitation's **approved current REVIEW** version: `payload`, `template_version_id` and `renderer_key_snapshot` are copied inside `publish_invitation` (migration 0038) with `INSERT … SELECT` from that REVIEW row, `source_review_version_id` points to it, and its `invitation_version_media` pins are copied from that REVIEW. The mutable draft is never read or rebuilt during publish, and no signed URL is stored.

### 18.1 `POST /api/v2/internal/projects/[id]/publish`

Body (strict allow-list; any other key → 400): `{ variant, expectedCurrentReviewVersionId, expectedPublishedVersionId }`. `expectedCurrentReviewVersionId` is required (UUID); `expectedPublishedVersionId` is a UUID or `null` (never published). The browser never sends a Snapshot, renderer key, template version, version number, media ids or a status target.

In one transaction `publish_invitation` locks the Project (`FOR NO KEY UPDATE`) and the invitation row (`FOR UPDATE`), then requires: project status `READY_TO_PUBLISH` **and** `payment_status = PAID` (Task 025 graph; never faked); the variant is required by the package policy; the invitation's `current_review_version_id` and `published_version_id` equal the two expected values (compare-and-set); the current review is a REVIEW row of this invitation with an `APPROVAL`, no `REVISION_REQUEST`, and an aggregate review outcome of `APPROVED`; and the current publication (if any) is not already sourced from this review. It then appends one PUBLISHED row (`version_number` = invitation max + 1 under the row lock — REVIEW and PUBLISHED share one per-invitation sequence), copies the media pins, advances `published_version_id`, logs `INVITATION_PUBLISHED` (first publication) or `INVITATION_REPUBLISHED`, and sets the Project to `PUBLISHED` (logging `PROJECT_STATUS_CHANGED`) only when **every required variant's** current publication is sourced from its current review. Rows for variants the package does not require are ignored.

| Result | Kind | HTTP | `reason` |
|---|---|---|---|
| PUBLISHED version created | — | 201 `{ data: PublishedInvitationVersion }` | — |
| Missing/invalid bearer; not active staff | — | 401 / 403 | — |
| Malformed body / id / extra key | `BAD_REQUEST` | 400 | — |
| Project not found | `NOT_FOUND` | 404 | — |
| Variant not required; no package policy | `INVARIANT` | 422 | — |
| Status not `READY_TO_PUBLISH` | `CONFLICT` | 409 | `LIFECYCLE_NOT_READY` |
| `payment_status` not `PAID` | `CONFLICT` | 409 | `PAYMENT_NOT_READY` |
| Project `PUBLISHED` / `COMPLETED` / `ARCHIVED` | `CONFLICT` | 409 | `PROJECT_CLOSED` |
| No current review; not approved; revision requested; aggregate not approved | `CONFLICT` | 409 | `NOT_APPROVED` |
| Stale `expectedCurrentReviewVersionId` | `CONFLICT` | 409 | `STALE_REVIEW` |
| Stale `expectedPublishedVersionId` (incl. a double submit) | `CONFLICT` | 409 | `STALE_PUBLISHED_VERSION` |
| Current review already published | `CONFLICT` | 409 | `ALREADY_PUBLISHED` |
| Integrity fault / anything else | — | 500 (generic) | — |

A double submit with the same expected pointers creates exactly one PUBLISHED row; the second request is 409 `STALE_PUBLISHED_VERSION`.

### 18.2 `GET /api/v2/internal/projects/[id]/publish`

200 `{ data: ProjectPublishState }`: `projectStatus`, `paymentStatus`, `requiredVariants`, `projectBlocker` (`PROJECT_CLOSED` | `PAYMENT_NOT_READY` | `LIFECYCLE_NOT_READY` | `null`, in that order), `allRequiredVariantsPublished`, and per required variant its current review (number, approval state), its current publication (number, source review number, `publishedAt`), `upToDate`, `canPublish` and the first `blocker`. Direct RLS reads only. The RPC remains the authority.

### 18.3 Staff UI

The Xuất bản tab shows, per required variant, the current review and its approval, the current publication, the first blocker and a publish action with an inline confirmation (the approved review is frozen as a published version; later draft edits do not change it; a newer approved review can later be published as another version).

### 18.4 Not in this task

No public `/i/[slug]` rendering, no public media resolver, no Open Graph / `SOCIAL_SHARE_COVER` metadata, no guest token, no RSVP persistence, no QR/share/analytics, no rollback/unpublish.

## 19. Task 032A — Public Published Invitation `/i/[slug]`

Server-rendered page `app/i/[slug]/page.tsx`. No staff session, no customer token, no query parameter: the path slug (`project_invitations.public_slug`, e.g. `wc-2026-000001-groom`) is the only locator and is a routing identifier, never authorization. Each invitation variant has its own slug, so a COMMON/GROOM/BRIDE slug always renders its own invitation; no parameter switches variant, version or renderer.

**Flow.** Slug shape check (lowercase alphanumerics and single hyphens, ≤ 100 chars; anything else → not-found without a database read) → `get_public_invitation` (migration 0039, `service_role` only, via `lib/server/supabase/public-invitation-repository.ts`) → the exact row referenced by `published_version_id` (must be `PUBLISHED`, same invitation, same Project) → integrity gate on the persisted Snapshot (payload variant, template version and renderer key must equal the stored row binding, and `payload.project.code` the Project's code) → runtime signing of only the pinned media the Snapshot references → `buildInvitationViewModel` → exact `renderer_key_snapshot` through the fail-closed registry → `InvitationRendererHost`. The PUBLISHED Snapshot is immutable and is never rebuilt; the mutable draft and any REVIEW version are never read, and there is no "latest version" inference.

**Media.** Only `project_media` rows pinned to that exact PUBLISHED version through `invitation_version_media`, in the `project-media` bucket and referenced by its Snapshot, are signed — through `lib/server/supabase/published-invitation-media-signer.ts` (PUBLISHED INVITATION MEDIA SIGNING ONLY, 1 hour). Anything else is `UNAVAILABLE`. Signed URLs live only in the rendered ViewModel and are never persisted.

**Capabilities.** The production host: clipboard, music and clock only. No RSVP capability, so the RSVP section is not rendered until Task 033. *Superseded by Task 033A (§20): the page now renders through the public client wrapper, which adds the real public RSVP capability.* Music never autoplays; "Mở thiệp" remains the explicit gesture (template behavior unchanged).

| Condition | Result |
|---|---|
| Published slug | 200, the invitation |
| Malformed or unknown slug | Next.js not-found (404) |
| Invitation with `published_version_id IS NULL` | not-found (404) — never REVIEW or draft |
| Pointer/Snapshot binding mismatch (`PI001` or TS gate), unregistered renderer, media-signing failure, any other fault | fixed safe message "Chưa thể hiển thị thiệp"; no slug, id or database detail is shown or logged |

**Caching.** `export const dynamic = "force-dynamic"`: every request re-resolves the current `published_version_id` (a later republish moves the slug immediately) and signs fresh URLs. Metadata is a fixed title with `noindex` until Task 032B. *Superseded by Task 032B (§21): metadata is generated per request, still `noindex`.*

**Not in this task.** Open Graph / `SOCIAL_SHARE_COVER` metadata (Task 032B), RSVP persistence (Task 033), guest tokens/personalization, QR/share/analytics, republish lifecycle changes, rollback/unpublish.

## 20. Task 033A — Public RSVP `POST /api/v2/public/rsvp`

Non-personalized RSVP from the public published invitation `/i/[slug]`. No session, no customer token and no guest token: the generic public invitation is the canonical non-personalized flow (`docs/PRODUCT.md` §14, `docs/PHYSICAL_DATABASE_PLAN.md` §2.20 — `guest_id` NULL, typed name required).

**Request body** — exactly these five keys, nothing else (any other key, such as a Project/invitation/version id, renderer key, guest id or token, is 400):

| Key | Rule |
|---|---|
| `publicSlug` | the slug of the page; shape as in §19 (malformed → 404, no database read). A routing locator, never authorization |
| `attendance` | `ATTENDING` \| `MAYBE` \| `NOT_ATTENDING` |
| `partySize` | integer; `ATTENDING`/`MAYBE` 1–20, `NOT_ATTENDING` exactly 0 |
| `message` | `null` or ≤ 500 code points |
| `guestName` | required typed response name: already trimmed, non-blank, ≤ 200 code points. Display/response data only, never identity |

The four response fields are validated with the canonical `isValidRsvpSubmitInputV1` (K16), then re-validated inside the RPC.

**Flow.** Route → `submitPublicRsvp` → `submit_public_rsvp` (migration 0040, `SECURITY DEFINER`, `SET search_path = ''`, `EXECUTE` for `service_role` only, via `lib/server/supabase/public-rsvp-repository.ts`). The RPC resolves the slug to its invitation, requires `published_version_id` to point at a `PUBLISHED` row of the same invitation and Project (else `PI001`), derives `project_id`, and inserts one `rsvps` row (`guest_id` NULL, `guest_display_name_snapshot` = typed name). It never reads REVIEW pointers, draft data or existing RSVPs, and never touches `guests`.

| Condition | Result |
|---|---|
| Persisted | 201 `{ data: { recorded: true } }` |
| Malformed body / unparseable JSON / extra key / invalid field (`RS001` from the RPC included) | 400 `{ error: "Invalid RSVP request" }` |
| Malformed, unknown or never-published slug | 404 `{ error: "Invitation not found" }`, nothing written |
| Any other fault (`PI001`, DB error, unexpected shape) | 500 `{ error: "Internal server error" }` |

Every response is `Cache-Control: no-store`. No database detail is returned; nothing about the request (slug, name, message) is logged.

**Duplicates.** Non-personalized rows are unbounded (§2.20 / §J accepted limitation): every submission, including a "Sửa lại" resubmission, inserts a new row. No row is ever updated or matched by the typed name.

**Client capability.** `app/i/[slug]/public-invitation-renderer.tsx` (client) builds the RSVP capability in the client graph and passes it to the host core. Mapping: 201 with `recorded: true` → `SUCCESS`; 400 → `INVALID`; 404 → `UNAVAILABLE`; any other status, unexpected body or network error → `FAILED`. Staff Preview and Customer Review keep the UNAVAILABLE-only wrapper and never write.

**Not in this task.** Personalized guest tokens / guest resolve (no issuance or resolution contract exists yet; Task 032/033 guest workflow), RSVP read/portal/summary, rate limiting (Task 035 pre-production gate), Open Graph (Task 032B), analytics, republish lifecycle.

## 21. Task 032B — Open Graph + Social Share Cover for `/i/[slug]`

`generateMetadata` on `app/i/[slug]/page.tsx`, resolved per request (the page is `force-dynamic`). Invitation rendering and the Task 033A RSVP path are unchanged; one React `cache()` shares the single Task 032A PUBLISHED load between metadata and page.

**Sources.**
- **Title:** `"<primary> & <secondary> — Thiệp cưới"`, from the PUBLISHED Snapshot's ViewModel in the canonical variant order (`people.primary` → `people.secondary`: GROOM → groom first, BRIDE → bride first, COMMON → the resolver's order). Never the mutable draft.
- **Description:** fixed generic text "Trân trọng kính mời bạn đến chung vui cùng chúng tôi." The Snapshot has no canonical description field.
- **Image:** the Project's CURRENT effective `SOCIAL_SHARE_COVER`, read through `get_public_social_share_cover` (migration 0041, `STABLE SECURITY DEFINER`, `SET search_path = ''`, `EXECUTE` for `service_role` only). The RPC requires the slug's current PUBLISHED version (else NULL, or `PI001` on pointer mismatch), derives the Project, and returns only the `(sort_order, id)`-first `SOCIAL_SHARE_COVER` row's storage reference. It is image only (a non-image MIME is ignored; legacy NULL MIME is accepted) and must be in the `project-media` bucket. `lib/server/supabase/public-social-share-repository.ts` signs exactly that one object (`createSignedUrl`, 1 hour = the shared runtime media TTL). The URL is never persisted.

**Emitted fields.** `title`, `description`, `robots: noindex, nofollow`, `og:type=website`, `og:locale=vi_VN`, `og:title`, `og:description`, and — only when a cover exists — `og:image` (+ `og:image:width`/`height` when stored, `og:image:alt` = the media's alt text or the title). No `og:url` and no `metadataBase`: there is no trusted public site-URL configuration, and request headers are not trusted.

| Condition | Metadata |
|---|---|
| Published, cover chosen | full set including `og:image` |
| Published, no cover (or non-image / signing failure) | full set without `og:image` — never a `COVER` fallback |
| Malformed / unknown / unpublished slug, or load failure | generic title "Thiệp cưới — WeddingClick" + `noindex` only; no project data |

**Freshness.** Staff can replace `SOCIAL_SHARE_COVER` without republishing; every request re-reads the effective row and signs a fresh URL. No cache invalidation infrastructure.

**Crawlers.** `noindex` stays: it does not block Open Graph previews. Next.js 16 streams metadata to normal browsers but renders it blocking in `<head>` for its default HTML-limited bot list, which includes `facebookexternalhit`. Zalo's crawler is not in that list. Real Facebook/Zalo validation needs a public HTTPS deployment; localhost can only be checked by inspecting the generated HTML.

**Not in this task.** Facebook/Zalo SDKs, tracking, analytics, `og:url`/site-URL config, `htmlLimitedBots` override, guest personalization, RSVP changes, republish lifecycle.
