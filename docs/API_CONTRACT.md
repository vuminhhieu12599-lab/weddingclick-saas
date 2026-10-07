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
- **Browser image optimization (P1-MEDIA-01):** before upload-intent, the staff browser re-encodes photo roles (`COVER`, `GALLERY`, `PORTRAIT_GROOM`, `PORTRAIT_BRIDE`, `PHOTO_STORY`, `LOVE_STORY_PHOTO`, `SOCIAL_SHARE_COVER`) to WebP, quality 0.86, long edge at most 1600 px, EXIF orientation applied, never upscaled or cropped (`lib/admin/image-upload-optimizer.ts`). `AUDIO` and every `QR_*` role are never re-encoded. A file already within 1600 px and at most 600 KiB is kept as-is, the WebP is used only when strictly smaller than the original, and any decode/encode failure falls back to the original. Originals over the per-role byte limit are not optimized, so the source size policy is unchanged. Upload-intent MIME/size, the signed upload and the finalize `width`/`height` all describe the file actually uploaded. This is a payload optimization only: no route, Storage path, MIME/size policy or schema changed, and finalize stays Storage-authoritative. Previously uploaded media is never rewritten.
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
| `RATE_LIMITED` | 429 | Task 035A: a public/capability abuse-control guard refused the request (§31). Generic body, `Cache-Control: no-store`, no `Retry-After`, no `X-RateLimit-*` |
| `INTERNAL` | 500 | generic message only, never raw SQL/Postgres/service-role detail |
| `SERVICE_UNAVAILABLE` | 503 | Task 035A: the shared limiter store a **state-changing** public/capability route requires is unavailable or unconfigured (fail-closed, §31). Nothing is written |

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

Mandatory before **production** launch (`SECURITY.md` §11, `ROADMAP.md` Production Ready Definition) but does **not** block DEV/STAGING implementation of the RSVP workflow (Task 033). An explicit pre-production security gate task exists in the revised order as Task 035 (§8). **Task 035A** (V2 distributed abuse controls) is implemented — see §31. **Task 035B** (Legacy V1 exposure containment) remains open, so the Task 035 gate as a whole is **not** passed.

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

**Status side effect (Task 030B, migration 0037).** In the same transaction, a successful creation recomputes and saves the aggregate review outcome over all required current variants. The new version is unapproved, so this is `CUSTOMER_REVIEW` (including after `REVISION_REQUIRED` or `APPROVED`) unless another required variant still has an unreplaced revision request (`REVISION_REQUIRED`). A Project in `COMPLETED` / `ARCHIVED` is rejected with 409 (RV010) and nothing is written. *Amended by migration 0044 (Launch Hardening 04, §35; authored, not applied):* `PUBLISHED` is allowed for a post-publish correction and moves to `CUSTOMER_REVIEW` by the same recompute; until 0044 is applied, `PUBLISHED` is still rejected with RV010. Payment status is never changed.

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

**Not in this task.** Personalized guest tokens / guest resolve (*since added by §22, Task 033B1; this generic contract is unchanged*), RSVP read/portal/summary, rate limiting (Task 035 pre-production gate), Open Graph (Task 032B), analytics, republish lifecycle.

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

## 22. Task 033B1 — Personalized Guest Link `/i/[slug]/g/[token]`

Adds personalized invitations beside the unchanged generic `/i/[slug]` (§19–§21). Migration `0042_personalized_guest_link.sql`.

**URLs.**

| URL | Meaning |
|---|---|
| `/i/[slug]` | generic, non-personalized invitation ("Quý khách"); RSVP `guest_id` NULL (§20) — unchanged |
| `/i/[slug]/g/[token]` | personalized invitation for exactly one guest; `[token]` is the credential |

Never `?guest=`, never a guest id, name, phone or email as identity. The slug stays a routing locator.

**Token.** 32 CSPRNG bytes, unpadded base64url (43 chars, 256 bits), generated server-side by the shared `generateAccessToken()` (Task 026 D7). `guests.token_hash` stores only its SHA-256 digest; `guests.token_hint` its last 8 characters (display only, never lifecycle state). The raw token is returned once, inside the issued path, and is never stored, logged or put in metadata.

### 22.1 Guest-link issuance — staff SUPPORT path `POST /api/v2/internal/projects/[id]/guests/[guestId]/access-link`

**Actors (accepted product model).** Customers never log in and never edit the Project. The primary flow for managing invited guests and personalized links is the **Guest Tool inside the Customer Portal**: a later milestone, reached through a `project_access_links` PORTAL link and gated by the PERSONALIZED_GUEST entitlement. It is **not implemented in 033B1**. This endpoint is the staff **support/back-office** path only. Both paths share one actor-neutral use case, `issueGuestLink(projectId, guestId, body, client, gateway)`. Each caller authorizes first, then passes an already-authorized data client and gateway (staff: `requireStaff` → staff-scoped client; future Portal: PORTAL resolution → Project-pinned gateway).

**Entitlement.** Every new ISSUE and REGENERATE requires an active PERSONALIZED_GUEST entitlement: at least one `project_addons` row of this Project with `addon_code_snapshot = 'PERSONALIZED_GUEST'` and `revoked_at IS NULL` (`docs/PHYSICAL_DATABASE_PLAN.md` §2.6). It is derived server-side, never sent by the browser; if it is missing the response is 403. The gate covers issuance only. Links already issued keep resolving even if the add-on is later revoked; 0042 resolution is unchanged. **What should happen to those links is an open owner decision (DEFERRED).**

Staff support path: staff Bearer session + `requireStaff` (auth before validation). Direct RLS on `guests` with the staff-scoped client (§7.5: no activity event), never `service_role`. Body exactly `{ "action": "ISSUE" | "REGENERATE" }`; the browser never sends a token, hash, hint, variant or Project.

`guests.token_hash` is `NOT NULL` (0017), so every guest already has a hash whose raw token was never delivered. That **dormant** hash is not a credential. Issuance state is the explicit `guests.token_issued_at` (0042, nullable, existing rows NULL, no backfill): NULL = never issued; set = an issued token is active unless the guest is revoked. `token_hint` is never issuance state.

| Action | Allowed when | Effect |
|---|---|---|
| `ISSUE` | `revoked_at IS NULL` and `token_issued_at IS NULL` | in-place replacement of the dormant `token_hash`/`token_hint` (§2.19 [R14]); `token_issued_at` = now |
| `REGENERATE` | `revoked_at IS NULL` and `token_issued_at IS NOT NULL` | same replacement, `token_issued_at` = now; the previous token stops resolving immediately |

The UPDATE is conditional on project, `revoked_at IS NULL` and the expected `token_issued_at` state, so concurrent calls cannot both succeed. *Task 033E-B:* it is also conditional on the guest's stored `invitation_variant` being the one the slug was resolved from (`expectedInvitationVariant`; NULL matched with `IS NULL`), so a concurrent side change yields 409 instead of a dead link (§26). `token_issued_at` is the issuing server's clock (PostgREST cannot send `now()`). No token history, one active token per guest.

| Condition | HTTP |
|---|---|
| Success | 200 `{ data: { guestId, projectId, invitationVariant, invitationPath } }` — `invitationPath` = `/i/<slug>/g/<token>`, returned once |
| No/invalid bearer · not active staff | 401 · 403 |
| Project has no active PERSONALIZED_GUEST entitlement | 403 `{ error: "Personalized guest add-on is not active for this project" }`, nothing written |
| Bad UUID, body not exactly `{ action }`, unknown action | 400 |
| Guest not in this Project | 404 |
| Revoked guest · ISSUE when already issued · REGENERATE before ISSUE · lost race | 409 |
| Variant unresolvable (§7.3: NULL on a non-COMMON package) or no invitation of that variant | 422 |

The variant is `guests.invitation_variant`, or `COMMON` when NULL on a COMMON-package Project (`resolveGuestInvitationVariant`, `lib/domain`). The slug is that invitation's `public_slug`; issuance does not require the invitation to be published yet. Every response is `Cache-Control: no-store`.

### 22.2 Public resolution

The page hashes the token (shape-checked first; malformed → not-found with no database read) and calls `get_public_guest_invitation(slug, hash)` (0042, `STABLE SECURITY DEFINER`, `SET search_path = ''`, `EXECUTE` for `service_role` only, via `lib/server/supabase/public-guest-repository.ts`). Through the private helper `resolve_public_guest` it requires, in order: the slug's current `PUBLISHED` version (`PI001` on pointer fault), a guest with that hash **and `token_issued_at IS NOT NULL`** (a dormant never-issued hash never resolves), the guest's Project = the invitation's Project, and the permitted variant (§4 step 6, §7.3). It returns only `{ displayName }` of an active guest, else NULL.

Then the unchanged §19 pipeline renders the same PUBLISHED Snapshot with the same renderer; `guests.display_name` is passed as the ViewModel `guest` overlay (the existing renderer contract). The RSVP name input is not prefilled.

**Fail closed, no fallback.** Malformed, unknown, dormant (never issued), regenerated-old, revoked, other-Project and wrong-variant tokens all render the same not-found. A bad personalized credential never becomes the generic `/i/[slug]`. Nothing distinguishes unknown slug from unknown token from foreign token.

**Metadata.** Fixed: generic title, `noindex, nofollow`, `referrer: no-referrer`. No Open Graph, no guest name, no token, no `og:url`/canonical. §21 is unchanged and applies only to `/i/[slug]`.

### 22.3 Personalized RSVP — `POST /api/v2/public/rsvp` with `guestToken`

Same endpoint as §20. The body is either the five §20 keys (generic, unchanged) or those five plus `guestToken` (personalized). `guestId`, `token`, `guest` and every other key stay 400.

With `guestToken`: shape check (malformed → 404, no database call) → SHA-256 → `submit_public_guest_rsvp(slug, hash, …)` (0042, `SECURITY DEFINER`, `service_role` only). The RPC re-validates input (`RS001`), resolves the guest exactly as in §22.2, and then:

- `guest_id` comes only from the token; `project_id` only from the publication;
- the typed `guestName` is stored in `guest_display_name_snapshot` as response data, never identity;
- one logical RSVP per guest: `INSERT … ON CONFLICT (guest_id) WHERE guest_id IS NOT NULL DO UPDATE` on the existing `rsvps_guest_id_key` (0018). The first submission inserts; later ones atomically replace `attendance`, `party_size`, `message` and the name snapshot (attendance may change). `id`, `project_id`, `guest_id`, `created_at` are kept.

| Condition | HTTP |
|---|---|
| Persisted (insert or update) | 201 `{ data: { recorded: true } }` |
| Invalid input | 400 |
| Malformed / unknown / dormant (never issued) / other-Project / wrong-variant token, or slug not published | 404 — nothing written, never a generic insert |
| Known guest token, revoked (`GT001`, §4.1) | 410 `{ error: "Invitation link is no longer valid" }` |
| Other fault | 500 |

Client mapping adds 410 → `UNAVAILABLE`. Generic rows (`guest_id` NULL) are excluded from the unique index by NULL semantics and stay unbounded (§20).

**Unchanged.** Staff Preview and Customer Review stay UNAVAILABLE-only and never carry a guest token. `SOCIAL_SHARE_COVER`, Elegant Editorial v1, publish/republish.

**Not in this task.** The Customer Portal itself (PORTAL link resolution, RSVP list, and the Guest Tool for guest create/list/edit/revoke and customer-side ISSUE/REGENERATE), rate limiting / token brute-force protection (Task 035 pre-production gate; the 256-bit token is the current control), bulk import, messaging, QR codes, analytics, and the deferred decision on already-issued links after entitlement revocation.

## 23. Task 033C — Private Customer Portal `/portal/[token]` (foundation)

**Actors.** The customer/couple never logs in, never creates the Project and never edits the staff-owned workflow. After publish, staff sends the public invitation link(s) and, separately, a private Customer Portal link. The Portal is a limited, read-only, post-publish surface. It is **not** a Project editor.

**Credential.** The Portal reuses the existing Task 026 capability `project_access_links` with `link_type = 'PORTAL'`: the same 43-character, 256-bit base64url token and SHA-256 `token_hash`, with `revoked_at`, `expires_at` and `last_used_at` working as before. No new token type, table or migration. The opaque token in the path is the only credential. The URL carries no Project id, slug, guest token, review token or query identity.

**Resolution.** `loadCustomerPortal` calls `resolveAccessLink({ rawToken, expectedLinkType: "PORTAL" })` (§4):

| Token | Result |
|---|---|
| Malformed, unknown, or a REVIEW/INTAKE link (wrong purpose) | "Không tìm thấy trang" (NOT_FOUND), nothing else read |
| Revoked or expired PORTAL link | "Link đã hết hiệu lực" (410 kinds) |
| Valid PORTAL link | exactly one `projectId`; `last_used_at` updated |

Guest tokens and public slugs are not access links and never resolve. A Project UUID grants nothing.

**Eligibility (MVP).** The Portal renders only if the resolved Project has at least one `project_invitations.published_version_id` pointing to a `PUBLISHED` row of the same invitation and Project. Every pointer is integrity-checked; a fault fails closed with a generic error. No publication → "Thiệp chưa được xuất bản". ARCHIVED/closure policy is not decided here.

**Reads.** `lib/server/supabase/customer-portal-repository.ts` (`service_role`, server-only) runs four read-only SELECTs, each filtered by the resolved `projectId` and using existing grants:
- the Project code;
- its invitations with a published pointer;
- exactly those versions;
- whether a non-revoked PERSONALIZED_GUEST add-on exists (informational).

It reads no RSVPs, guests, media, Storage, payment, review or draft data, and writes nothing.

**View.** Per published variant (COMMON, then GROOM, then BRIDE): the public path `/i/<public_slug>`, couple names in that variant's canonical primary → secondary order, the ceremony title and date/time from the immutable PUBLISHED Snapshot (`deriveEventDateTimePresentationV1`). Nothing is signed. No ids, storage paths, renderer data, token or hash reach the browser. The page also shows an informational RSVP placeholder, plus a Guest Tool note when the add-on is active. There are no inactive controls.

**Metadata.** Fixed title "Cổng khách hàng — WeddingClick", `noindex, nofollow`, `referrer: no-referrer`, no Open Graph, `force-dynamic`. §21 is unchanged.

**Staff.** The Publish tab ("Xuất bản") shows "Link Portal khách hàng" once at least one variant is published. It issues through the existing `POST /api/v2/internal/projects/[id]/access-links` with `{ linkType: "PORTAL" }`, and can rotate the link issued in that view through the existing `…/access-links/[linkId]/rotate`. The raw URL (`/portal/<token>`, built from the browser origin; no SITE_URL) is held only in component state and shown once. Several PORTAL links may be active at once (Task 026 D2). Earlier links stay active until revoked, and there is no listing UI for them yet. **This must be addressed before production or customer rollout** (staff must be able to find and revoke older active PORTAL links).

**Not in 033C.** RSVP owner-read (the next Portal capability, inside the Portal), the Guest Tool (later, PERSONALIZED_GUEST entitlement-gated, through the shared `issueGuestLink`, §22.1), customer guest APIs, ARCHIVED policy, a PORTAL link listing/revocation UI, and one-active-link enforcement.

## 24. Task 033D — Portal RSVP owner-read (read-only)

**Scope.** `/portal/[token]` now shows the RSVP responses of its Project. It is read only. There is no customer login, no RSVP mutation, no Guest Tool and no new route or API: the list is rendered server-side by the existing Portal page.

**Authorization.** As in §23, the raw PORTAL token is resolved with `resolveAccessLink({ expectedLinkType: "PORTAL" })` to exactly one `projectId`. RSVPs are read only for that server-resolved id. `loadCustomerPortal(rawToken, deps)` takes no Project id, so the browser has no parameter to supply one. A Project UUID, public slug, guest token, REVIEW or INTAKE link never reads RSVPs. RSVPs are read only once the Portal is READY (post-publish).

**Read boundary (no migration).** `CustomerPortalGateway.listPortalRsvps(projectId)` in `lib/server/supabase/customer-portal-repository.ts` (server-only, `service_role`) runs one SELECT with an explicit column list: `rsvps` filtered by `project_id`, with the canonical Guest embedded through the `rsvps.guest_id` FK (`display_name`, `invitation_variant`, plus `project_id` for an integrity check). It uses the existing 0018 service_role SELECT grants on `rsvps` and `guests` (PHYSICAL_DATABASE_PLAN §15: "Customer PORTAL: server-only (R aggregate/list)"), the same direct-select pattern as §23. A dedicated RPC would grant `service_role` nothing it does not already have, so 0043 is not needed. The repository never reads `token_hash`, `token_hint`, `token_issued_at`, `phone`, `note` or `group_name`. `guest_id` and every `project_id` are used for guards only and never leave the module. Row guard (`toPortalRsvps`): a row of another Project, a personalized row whose embedded Guest is missing or belongs to another Project, an unknown attendance value or a malformed field fails closed. `count: "exact"` must equal the returned rows, so a server row cap can never silently truncate the list.

**Presentation (`presentPortalRsvps`).**
- PERSONALIZED (`guest_id` set): the canonical `guests.display_name` is the identity. The typed `guest_display_name_snapshot` appears only as a secondary "Trả lời với tên" line when it differs, and is never identity. The Guest's invitation variant is shown when set. There is one current row per guest (0018 unique index).
- GENERIC (`guest_id` NULL): the typed snapshot is shown, labeled "Phản hồi từ link chung". Each submission is its own row and is never deduplicated. A response whose Guest was later deleted (FK `SET NULL`) shows as generic, under its snapshot name.
- Attendance labels: ATTENDING "Sẽ tham dự", MAYBE "Có thể tham dự", NOT_ATTENDING "Không tham dự". `party_size` is shown as stored, and a person count is not shown for NOT_ATTENDING (always 0). Rows are never recalculated or rewritten.
- Summary: responses per status and summed party size per status, derived from the loaded rows only.
- Time: `updated_at`, formatted dd/mm/yyyy HH:mm in Asia/Ho_Chi_Minh (`formatDateTimeVi`).
- Order: `updated_at DESC, id DESC` in the query. The use case keeps `updated_at DESC` with a stable sort, so newest first is deterministic. There are no sort or filter controls.
- Empty: "Chưa có phản hồi tham dự." (not an error).

**Entitlement.** RSVP viewing is **not** gated by PERSONALIZED_GUEST. Generic and existing personalized responses are always visible to the Project's Portal, whatever the add-on state. PERSONALIZED_GUEST gates only the future Guest Tool.

**Errors.** A failed RSVP read after a valid resolution throws, and the page shows its existing generic "Chưa thể hiển thị trang" state with the fixed `[CustomerPortalPage] Unexpected error` log. It never shows a fake empty list. Token errors are unchanged from §23.

**Unchanged.** §23 metadata/privacy (noindex, nofollow, no-referrer, no Open Graph, force-dynamic, no token storage), PORTAL issue/rotate, public and personalized invitations, both RSVP submit flows (§20/§22), §21 Open Graph.

**Not in 033D.** Guest Tool (create/edit/revoke/issue/regenerate/import/QR/messaging), RSVP edit/delete, sort/filter/export, and the PORTAL link listing/revoke gap (§23, still a pre-production requirement).

## 25. Task 033E-A — Portal Guest Tool foundation

**Scope.** Inside `/portal/[token]`, a "Danh sách khách mời" section lets the couple list guests, add a guest, edit a guest's display name (and side, while no link is issued) and revoke a guest. Link state is shown read-only ("Chưa cấp link" / "Đã cấp link"). There is no customer login, no ISSUE/REGENERATE, no restore, no delete, no import/CSV/QR/messaging, and no phone/note/group editing. No migration: the 0017 service_role grants on `guests` (written for this Guest Tool) and the existing constraints suffice.

**Entitlement.** The section and every mutation require an active PERSONALIZED_GUEST add-on (non-revoked `project_addons` row, `addon_code_snapshot = 'PERSONALIZED_GUEST'`). It is re-checked server-side on every request; without it the section is absent and mutations return 403. RSVP owner-read (§24) is unaffected.

**Authorization.** `Authorization: Bearer <raw PORTAL token>` (the 030B pattern, `parseBearerToken`) → `resolveAccessLink({ expectedLinkType: "PORTAL" })` → `projectId` → published-pointer check + entitlement + package mode → body read/validation → one write pinned by `project_id = projectId`. No route or body accepts a Project id. A guest id only targets a row of the resolved Project. A foreign, unknown or malformed guest id is 404, with no oracle. REVIEW/INTAKE links, guest tokens, slugs and UUIDs are 404 like any non-PORTAL value.

| Route | Body | Success |
|---|---|---|
| `POST /api/v2/public/portal/guests` | `{ displayName[, invitationVariant] }` | 201 `{ data: row }` |
| `PATCH /api/v2/public/portal/guests/[guestId]` | `{ displayName[, invitationVariant] }` | 200 `{ data: row }` |
| `POST /api/v2/public/portal/guests/[guestId]/revoke` | none | 200 `{ data: row }` |

Errors: 400 malformed body / name / side; 401 no Bearer; 403 not entitled (or no valid publication); 404 guest not in this Project or PORTAL token not found; 409 with `reason` `GUEST_REVOKED`, `SIDE_LOCKED`, `ALREADY_REVOKED` or `CONCURRENT_CHANGE`; 410 revoked/expired PORTAL link; fixed 500 with the fixed log `[handlePortalGuestRequest] Unexpected error`. Responses are `no-store`.

**Package mode.** From `projects.package_code_snapshot` via `requiredInvitationVariantsForPackage` (never from publications, guests, slugs or the browser); an unknown package fails closed.
- COMMON → `COMMON_ONLY`: the server writes `invitation_variant = 'COMMON'`. The body may omit the variant or send exactly `"COMMON"`; anything else is 400.
- SEPARATE → `GROOM_OR_BRIDE`: create requires `GROOM` or `BRIDE` (missing, null, COMMON or unknown → 400, never defaulted); edit may omit it.

**Display name.** Trimmed server-side, non-blank, ≤ 200 Unicode code points (`normalizeGuestDisplayName`, mirroring the DB CHECK). Duplicates are allowed. Exact keys only.

**Create.** Inserts `project_id` = resolved Project, the validated name and variant, a **dormant** `token_hash` (`generateDormantGuestTokenHash()`: SHA-256 of a fresh 32-byte CSPRNG token whose raw value is discarded immediately), `token_hint`/`token_issued_at`/`revoked_at`/`created_by` = NULL. The dormant hash never resolves (0042 requires `token_issued_at IS NOT NULL`). Success only after the inserted row is returned.

**Edit.** One conditional UPDATE: `id`, `project_id = resolved`, `revoked_at IS NULL`, and when a side is sent also `token_issued_at IS NULL OR invitation_variant = <side>`. The display name stays editable after issuance. The 0042 resolver reads it live, so the issued link keeps working with the new name; nothing is regenerated or invalidated. The side locks once a link is issued; resubmitting the same side succeeds. On 0 rows, a read-only Project-pinned classification (no write follows) returns 404 / `GUEST_REVOKED` / `SIDE_LOCKED` / `CONCURRENT_CHANGE`.

**Revoke.** One conditional UPDATE `SET revoked_at` where `id`, `project_id = resolved`, `revoked_at IS NULL`. A repeat is 409 `ALREADY_REVOKED`. No DELETE, no token change, no restore, no `rsvps` write. Under frozen 0042, a revoked guest's issued link renders not-found and its RSVP submit is rejected (`GT001`) immediately. The RSVP history stays and is still listed in §24 under the canonical name.

**Read model.** Server-rendered with the Portal (`loadCustomerPortal` → `guestTool: { mode, guests } | null`). Each row has `guestId` (mutation target only, never authority), `displayName`, `invitationVariant` (NULL resolved per §7.3), `status` ACTIVE|REVOKED and `linkStatus` NOT_ISSUED|ISSUED (from `token_issued_at IS NOT NULL`; the timestamp is never serialized). Active guests come first, then revoked ones, each in `created_at, id` order. Never serialized: token hash/hint, raw token, `token_issued_at`, phone, note, group, Project id, `created_by`. The list read uses `count: "exact"` so it is never silently truncated.

**Boundary.** `lib/server/supabase/portal-guest-repository.ts` (service_role, server-only, the only new service_role importer) is wired by `lib/server/customer-portal/portal-guest-supabase.ts` (routes) and `customer-portal-supabase.ts` (page). The client component `app/portal/[token]/portal-guest-tool.tsx` keeps the token only in props/memory (no browser storage) and uses a synchronous pending guard against double submits. It shows success only after a 2xx and then calls `router.refresh()`. Revoke uses an in-page confirmation, not `confirm()`.

**Known carry-forward (Owner Option A) — fixed in Task 033E-B (§26).** Frozen 033B1 `replaceGuestToken` did not condition on `invitation_variant`. A staff ISSUE racing a customer side change (both legal while `token_issued_at IS NULL`) can issue a link for the old side's slug, which never resolves. This fails closed: no cross-Project access or data exposure. Accepted for 033E-A; **Task 033E-B must add an `invitation_variant` predicate (or equivalent) to issuance replacement.**

**Still deferred.** ISSUE/REGENERATE from the Portal (033E-B — now §26); the policy for already-issued links after the add-on itself is revoked (separate deferred decision; guest-level revoke above is distinct and immediate); PORTAL link listing/revoke (§23, pre-production); rate limiting (Task 035, pre-production).

## 26. Task 033E-B — Portal personalized guest link ISSUE / REGENERATE

**Scope.** Inside the §25 Guest Tool, an entitled couple can ISSUE the first personalized link of an active guest and REGENERATE an issued one. The raw link is shown once. No QR, SMS/Zalo/email sending, import, bulk issue/regenerate, restore, delete, customer login or RSVP mutation. **No migration** (0042 columns and the existing service_role grants on `guests` suffice).

**Route.** `POST /api/v2/public/portal/guests/[guestId]/access-link`, `Authorization: Bearer <raw PORTAL token>`, body exactly `{ "action": "ISSUE" | "REGENERATE" }`. No Project id in path or body; any extra key is 400.

**Authorization and flow.** raw PORTAL token → `resolveAccessLink({ expectedLinkType: "PORTAL" })` → resolved `projectId` → §25 gate (valid publication + active PERSONALIZED_GUEST, re-checked per request; 403 otherwise) → guest id shape (malformed = 404) → the **shared 033B1 `issueGuestLink`** with the Portal's Project-pinned gateway (`getServiceRolePortalGuestLinkGateway`, service_role, server-only; its "client" is `{ projectId }` and every call for another Project fails closed). The use case re-checks the entitlement, requires the guest to exist in that Project (a Project-B guest id under a Project-A token is 404), refuses revoked guests, decides ISSUE vs REGENERATE validity from `token_issued_at` (never the browser), resolves the variant (§7.3) and slug, and rotates the token. REVIEW/INTAKE links, guest tokens, slugs and UUIDs are not Portal auth (404).

| Action | Allowed when | Effect |
|---|---|---|
| `ISSUE` | active and `token_issued_at IS NULL` | fresh 32-byte token; `token_hash` = SHA-256, `token_hint` = last 8 chars, `token_issued_at` = now |
| `REGENERATE` | active and `token_issued_at IS NOT NULL` | same in-place replacement; the previous token stops resolving immediately (one active token, no history) |

**Published requirement (Portal gateway).** The slug is returned only when the guest's own variant invitation has a valid PUBLISHED pointer (pointer → `invitation_versions` row of the same invitation and Project, `version_type = 'PUBLISHED'`). Unpublished → 422, no fallback to another variant; a pointer integrity fault → fixed 500. The staff support path (§22.1) keeps its frozen rule (issuance does not require publication).

**Variant.** COMMON guest (or NULL on a COMMON package) → the COMMON invitation's slug; SEPARATE GROOM → GROOM slug; BRIDE → BRIDE slug. Never guessed. URL format stays `/i/[slug]/g/[raw token]`; never `?guest=` or a guest id.

**033B1 race fix.** Both gateways (staff and Portal) rotate in ONE conditional UPDATE on `id`, `project_id`, `revoked_at IS NULL`, the expected `token_issued_at` state **and `invitation_variant = <variant read by the use case>`** (`IS NULL` when NULL). PostgreSQL re-evaluates the WHERE clause under the row lock, so a concurrent §25 side change either lands first (the rotation matches 0 rows → 409, nothing written, no dead link) or lands after (it then hits the §25 side lock → 409 `SIDE_LOCKED`). The client never picks another variant.

| Condition | HTTP |
|---|---|
| Success | 200 `{ data: { personalizedUrl, linkStatus: "ISSUED" } }` — `personalizedUrl` is the relative `/i/<slug>/g/<token>`, returned once |
| No Bearer | 401 |
| Not entitled / no valid publication | 403 |
| Bad body / unknown action / extra key | 400 |
| Guest not in this Project, malformed id, non-PORTAL or unknown token | 404 |
| Revoked guest | 409 `reason: "GUEST_REVOKED"` |
| ISSUE when issued, REGENERATE before ISSUE, lost race (incl. side change) | 409 `reason: "CONCURRENT_CHANGE"` |
| Revoked/expired PORTAL link | 410 |
| Variant unresolvable or its invitation not published | 422 |
| Unexpected | fixed 500, fixed log `[handlePortalGuestRequest] Unexpected error` |

Never serialized: Project id, guest id, `token_hash`, `token_hint`, `token_issued_at`, staff metadata. Every response is `no-store`. No absolute URL is built on the server (no SITE_URL); the browser prefixes its own origin.

**Raw-token safety.** The raw token exists only in the success response. It is never stored, logged, put in metadata, docs or browser storage, and cannot be recovered later (the hint is 8 of 43 chars and is never returned to the Portal). After a reload only "Đã cấp link" remains.

**Portal UI.** Active rows show **Tạo link** (NOT_ISSUED) or **Tạo lại link** (ISSUED); hidden while a SEPARATE guest has no side. REGENERATE needs an in-page confirmation ("Tạo lại link sẽ làm link cũ không còn hiệu lực."; **Xác nhận tạo lại** / **Huỷ**), never `confirm()`. After success a one-time panel shows the absolute URL in a read-only field, "Link này chỉ hiển thị một lần…", **Sao chép link** and **Đóng**; after REGENERATE it also says the old link no longer works. "Đã sao chép" appears only after `navigator.clipboard.writeText` resolved; on failure a message asks for a manual copy and the URL stays visible. The raw link lives only in React memory and is dropped on close, on the next issue, on that guest's revoke and on reload. Every new control is ≥ 44 px (`min-h-11`). Once issued, a SEPARATE guest's side stays locked (§25).

**Entitlement vs already-issued links (unchanged, deferred).** The add-on gates only new ISSUE/REGENERATE. If PERSONALIZED_GUEST is revoked after a link was issued, that link keeps resolving under frozen 0042; what should happen is still an open owner decision. Guest-level revoke (§25) is distinct and invalidates the link immediately.

**Unchanged.** Staff support route §22.1 (product behavior; only the race predicate added), 0042 resolution, personalized page and RSVP (§22.2–§22.3), §24 RSVP owner-read.

## 27. Task 033E-C — Per-guest RSVP status in the Portal Guest Tool

**Scope.** Each Guest Tool row (§25) shows whether that personalized guest has responded. Read-only: no RSVP create/edit in the Portal, no new route, no change to RSVP submit/update (§20, §22.3), no realtime or polling (a full refresh shows the current state). **No migration.**

**Identity.** Joined only by `rsvps.guest_id = guests.id`. At most one row per guest is guaranteed by `rsvps_guest_id_key` (0018). Names, typed response names, sides, tokens and slugs are never used. Generic rows (`guest_id IS NULL`) are never read by this projection, so they never attach to a guest even when the typed name equals a guest's `display_name`. They stay in the §24 list only.

**Read.** Inside `loadCustomerPortal`, after the §25 gate (PORTAL → Project, entitlement), two Project-scoped service_role reads with no N+1: the existing guest list and `listGuestRsvps` (`rsvps` `project_id, guest_id, attendance, party_size`, `project_id = resolved`, `guest_id IS NOT NULL`, `count: "exact"`; a count mismatch fails rather than silently truncating). They are merged by guest id. The page fails closed if a row belongs to another Project, names a guest outside the list, appears twice for one guest, has an unknown attendance, or breaks the 0018/0032 party-size rule.

**Row fields (list only).** `rsvpStatus`: `NOT_RESPONDED | ATTENDING | MAYBE | NOT_ATTENDING`; `rsvpPartySize`: the count for ATTENDING / MAYBE, `null` otherwise (never 0). Never serialized: RSVP id, Project id, message, typed name, timestamps. The §25 mutation responses are unchanged.

**UI.** One compact line under the side/link line: "Chưa phản hồi", "Sẽ tham dự · N người", "Có thể tham dự · N người", "Không tham dự" (no "0 người"). The message, typed name and time stay in "Phản hồi tham dự" (§24).

**Independence.** RSVP status is independent of link state and revoke: NOT_ISSUED/ISSUED × responded/not are all valid. A revoked guest keeps its historical status. An updated personalized RSVP (same row) shows its latest attendance on the next load.

**Entitlement.** Unchanged: without PERSONALIZED_GUEST there is no Guest Tool and no per-guest read; §24 still lists every response.

## 28. Task 034A — Staff Project Tasks CRUD

**Scope.** First slice of Task 034 (§8): `project_tasks` (0019) CRUD for staff only. Activity-log read (034B) and dashboard aggregation (034C) are not part of it. **No migration.** These are lightweight operational task/deadline items. There are no subtasks, comments, priorities, labels, notifications, reminders or automation.

**Path.** Every route runs `requireStaff` (STAFF and ADMIN alike, no ADMIN-only branch), then one plain staff-RLS statement scoped by the URL `project_id` (and task id). `project_tasks` has no type in the frozen Activity Union (§6), so it stays on the direct-RLS path (§3) with **no activity logging**. No `service_role`, no RPC, no customer / Portal / Review / guest / public access.

| Route | Body | Success |
|---|---|---|
| `GET …/projects/[id]/tasks` | — | 200 `{ data: ProjectTaskRecord[] }` |
| `GET …/projects/[id]/tasks/assignees` | — | 200 `{ data: { id, displayName }[] }`: active STAFF/ADMIN profiles, by display name |
| `POST …/projects/[id]/tasks` | `{ title, dueAt?, assignedStaffId?, sortOrder? }` | 201 `{ data }`: status is always the DB default `TODO` |
| `PATCH …/projects/[id]/tasks/[taskId]` | any non-empty subset of `title`/`status`/`dueAt`/`assignedStaffId`/`sortOrder` | 200 `{ data }` |
| `DELETE …/projects/[id]/tasks/[taskId]` | — | 200 `{ deleted: true }` |

**Record.** `id, projectId, title, status, dueAt, assignedStaffId, assignedStaffDisplayName, sortOrder, createdAt, updatedAt`. The display name comes from `profiles` (`id, display_name` only) and is kept after the profile is deactivated. Email and auth metadata are never read.

**Ordering.** No canonical ordering existed, so it is `sort_order ASC, due_at ASC NULLS LAST, created_at ASC, id ASC`. "Overdue" is derived from `(due_at, status)` and never stored.

**Validation.** Exact allow-listed keys: `projectId`, `createdAt`, `updatedAt` and (on create) `status` are rejected. `title` is trimmed, non-blank and at most 200 Unicode code points (the 0019 CHECK). `status` must be `TODO | IN_PROGRESS | DONE | CANCELLED`, with no transition rules because this is operational data, not Project lifecycle. `dueAt` is `null` or an RFC 3339 timestamp with an explicit offset (TIMESTAMPTZ). `assignedStaffId` is `null` or the UUID of an active STAFF/ADMIN profile. `sortOrder` is an int4 integer (default 0) and is not exposed in the UI.

| Condition | Kind | HTTP |
|---|---|---|
| Missing/malformed Authorization, invalid/expired token | `UNAUTHENTICATED` | 401 |
| Authenticated, not active STAFF/ADMIN | `FORBIDDEN` | 403 |
| Malformed project/task/staff id, invalid body | `BAD_REQUEST` | 400 |
| Project not visible; task not in this Project; assignee not an active staff profile | `NOT_FOUND` | 404 |
| Unexpected DB failure / malformed row | `INTERNAL` | 500 (generic body) |

- A task id from Project B used against Project A is 404 (update/delete are scoped by both ids), so there is no cross-Project oracle.
- Task assignment is independent of `projects.assigned_staff_id`, which is never written here. Delete removes only the task row: it does not touch activity logs, Project lifecycle, customers or guests.

**UI.** "Công việc" tab on `/admin/v2/projects/[projectId]`. The list shows title, a Vietnamese status label (Chưa làm / Đang làm / Hoàn thành / Đã huỷ; English codes are what is persisted), due date/time and assignee. "Thêm công việc" opens a create form (Tiêu đề, Hạn hoàn thành, Người phụ trách with "Không phân công"). Edit adds Trạng thái and sends only the changed fields. Delete asks for confirmation in the page (no `window.confirm`). The due date is entered as wall-clock time in `Asia/Ho_Chi_Minh` (the existing admin display timezone) and converted with the shared civil-time helper. Every confirmed write re-reads the list from the server. Empty state: "Chưa có công việc nào."

## 29. Task 034B — Staff Project Activity History (read-only)

**Scope.** Second slice of Task 034 (§8): staff **read** of `activity_logs` (0020) for one Project. Dashboard aggregation (034C) is not part of it. **No migration, no writes.** Nothing calls `log_activity`, inserts/updates/deletes `activity_logs`, backfills or synthesizes events. The frozen Activity Union (§6) is unchanged, and Project Tasks (§28) stay unaudited. The union is now mirrored once in `lib/domain/activity-action-type.ts` (`ACTIVITY_ACTION_TYPES`, `ACTIVITY_ACTOR_TYPES`).

**Path.** `requireStaff` (STAFF and ADMIN alike), then the staff-scoped client under the 0020 `is_staff()` SELECT policy. No `service_role`, no RPC, no customer / Portal / Review / guest / public access.

| Route | Query | Success |
|---|---|---|
| `GET …/projects/[id]/activity` | `cursor?` (opaque, from the previous page) | 200 `{ data: { items: ProjectActivityRecord[], nextCursor: string \| null } }` |

**Record.** `id, actionType, summary, actorType, actorDisplayName, createdAt`. `project_id`, `actor_profile_id` and `metadata` are never selected into the response (`metadata` is not read at all). `summary` is the stored one-liner, shown as-is.

**Actor.** STAFF → `profiles.display_name` when the profile still resolves, else "Nhân viên" (e.g. `actor_profile_id` SET NULL after a profile hard-delete). CUSTOMER → "Khách hàng", GUEST → "Khách mời", SYSTEM → "Hệ thống". Customer/guest identity is never inferred. Names come from one bounded `profiles` read (`id, display_name`) for the distinct STAFF actors on the page (no N+1).

**Order and pages.** `created_at DESC, id DESC`, served by the `(project_id, created_at DESC)` index. The page size is fixed at 30 and has no `limit` parameter. One extra row is read to decide `nextCursor`, so there is no count query. The cursor is base64url of `created_at|id` from the last row. The server checks that it is an RFC 3339 TIMESTAMPTZ plus a UUID, and it is a continuation position, never a credential: every page is still filtered by the route `project_id`, so a cursor from another Project cannot cross scope. There is no realtime and no polling. A manual reload shows newer rows.

**Integrity.** An `action_type` outside §6, an unknown `actor_type` or a row of another Project is an integrity fault that returns a generic 500. Such a row is never relabelled. A future task that extends §6 must update this reader explicitly.

| Condition | Kind | HTTP |
|---|---|---|
| Missing/malformed Authorization, invalid/expired token | `UNAUTHENTICATED` | 401 |
| Authenticated, not active STAFF/ADMIN | `FORBIDDEN` | 403 |
| Malformed project id or cursor | `BAD_REQUEST` | 400 |
| Project not visible | `NOT_FOUND` | 404 |
| Unexpected DB failure, unsupported/malformed row | `INTERNAL` | 500 (generic body) |

**UI.** "Lịch sử" tab on `/admin/v2/projects/[projectId]`. Each row shows the summary as the main text, with the actor · date/time (`formatDateTimeVi`, Asia/Ho_Chi_Minh) below it. "Xem thêm" appends older rows, is disabled while pending and reports errors in the page. "Tải lại" re-reads from the first page. Empty state: "Chưa có lịch sử hoạt động." No metadata, UUIDs or action codes are shown.

## 30. Task 034C — Staff Admin Dashboard Aggregation

**Scope.** Final slice of Task 034 (§8): the `/admin/v2` "Tổng quan" operational summary, computed **server-side** from the current canonical tables `projects` and `project_tasks`, never from `activity_logs`. **Read-only, no migration**, no realtime/polling (a page reload re-reads). It replaces the old browser-side counting over the 100-row project list (`PROJECT_LIST_LIMIT`), which silently capped totals. Out of scope: staff workload (no per-staff counts, scores or rankings) and statistics (projects by month, revenue, package/template popularity, conversion, RSVP engagement, overdue rate/trends).

**Path.** `GET /api/v2/internal/dashboard`: `requireStaff` (STAFF and ADMIN alike), then the staff-scoped client under existing staff RLS. No `service_role`, no RPC, no customer / Portal / Review / guest / public access.

**Definitions (owner-approved, constants in `lib/domain/project-dashboard-groups.ts`).** `now` is the server instant (`generatedAt`). Windows are exact rolling durations (7 × 24 h, 30 × 24 h) compared as TIMESTAMPTZ instants in the database, never as formatted strings.

| Metric | Label | Definition |
|---|---|---|
| Status breakdown | (12 canonical labels) | exact count per `ProjectStatus`. No synthetic status. |
| Active | Đang hoạt động | status NOT IN (`COMPLETED`, `ARCHIVED`). `PUBLISHED` is active. |
| Staff action | Cần xử lý | status IN (`NEW`, `IN_PROGRESS`, `INTERNAL_REVIEW`, `REVISION_REQUIRED`, `APPROVED`, `READY_TO_PUBLISH`) |
| Waiting for customer | Chờ khách | status IN (`WAITING_FOR_INFO`, `CUSTOMER_REVIEW`, `AWAITING_PAYMENT`) |
| Project overdue | Quá hạn | `deadline_at < now` (NULL never) AND status NOT IN (`PUBLISHED`, `COMPLETED`, `ARCHIVED`) |
| Project approaching | Sắp đến hạn | `now <= deadline_at <= now + 7 days`, same status exclusion. Disjoint from overdue. |
| Recently completed | Hoàn thành 30 ngày | status = `COMPLETED` AND `completed_at >= now − 30 days` (NULL never). `ARCHIVED` is not counted. |
| Outstanding tasks | Công việc chưa xong | task status IN (`TODO`, `IN_PROGRESS`) AND parent Project status NOT IN (`COMPLETED`, `ARCHIVED`). `PUBLISHED` Projects' tasks count. |
| Overdue tasks | Công việc quá hạn | outstanding AND `due_at < now` (NULL never) |
| Upcoming tasks | Công việc 7 ngày tới | outstanding AND `now <= due_at <= now + 7 days`. Disjoint from overdue tasks. |

Cần xử lý and Chờ khách together with `PUBLISHED`/`COMPLETED`/`ARCHIVED` partition the 12 statuses. The presentation helper `isStatusNeedingStaffAttention` now delegates to the same Cần xử lý constant (it previously hid a different code-only set).

**Queries.** There is a fixed set of 20, run in parallel and independent of data size (no N+1):
- 12 status counts, plus 3 Project counts (overdue, approaching, recently completed), all `count: "exact", head: true`, so no rows are transferred. The overdue and approaching filters use the `(status, deadline_at)` index.
- 3 task counts with `projects!inner(status)` so the parent-status exclusion is applied in the database.
- 2 deadline lists (overdue, approaching), each `limit 10`, ordered `deadline_at ASC, id ASC`.

`project_tasks` has only its `(project_id)` index. That is accepted at V1 volume; review a `(status, due_at)` index if cross-Project task counts grow.

**Response.** `200 { data: { generatedAt, projects: { active, staffAction, waitingForCustomer, overdue, approaching, recentlyCompleted, byStatus }, tasks: { outstanding, overdue, upcoming }, attention: [{ id, projectCode, status, deadlineAt, overdue }] } }`. `attention` lists overdue Projects first and then approaching ones, earliest deadline first with an `id` tie-break, at most 10 in total. It carries navigation fields only: no customer, price, note, token or activity data. Errors: 401 (missing/invalid credential), 403 (not active staff), 500 (generic body).

**UI.** It shows 6 summary tiles, 3 task tiles, the deadline attention list (linking to each Project, with a "Hiển thị n / N" hint when truncated), and the 12-status breakdown using the existing labels. "Dự án gần đây" keeps its meaning (5 newest by `created_at DESC, id DESC`) through the existing list endpoint with `limit=5`, not the 100-row list.

## 31. Task 035A — V2 Abuse Controls / Distributed Rate Limiting

**Status.** **FROZEN** at `cabb2010d62fb9ba9237434186a0d08fcecd7ef2`. The controlled Preview smoke passed (Product Owner record). Together with Task 035B (§32) the Task 035 pre-production security gate is **COMPLETE**. The Production environment still needs its own isolated Upstash database, `RATE_LIMIT_IP_HMAC_SECRET` and smoke under the pilot launch-hardening items P0-5 / P0-9 (`docs/ROADMAP.md` "Pilot Launch Hardening"). *(Superseded status text, kept for history: "Implemented locally. The complete Task 035 gate is not passed …")*

**Backend.** Upstash Redis (REST) via `@upstash/redis` + `@upstash/ratelimit`, behind the `RateLimitStore` seam (`lib/server/rate-limit/`).
- **Algorithm:** `SLIDING WINDOW` for every rule.
- **Disabled SDK features:** limiter analytics, the ephemeral in-process cache and SDK telemetry are all off.
- **Bounded wait:** one store attempt (Redis retries disabled), capped at 1 s.
- **No local authority:** no process-local counter is authoritative.
- **Tests:** they use a deterministic fake store.

**Rules (owner-approved).**

| Rule | Routes | Key subject | Limit / window | Store unavailable |
|---|---|---|---|---|
| `TOKEN_PAGE_IP` | `/i/[slug]/g/[token]`, `/review/[token]`, `/review/[token]/frame`, `/portal/[token]` (via `proxy.ts`) | keyed client-IP identity | 120 / 1 min | fail **open** |
| `PUBLIC_WRITE_IP` | `POST /api/v2/public/rsvp` (generic + personalized) | keyed client-IP identity | 60 / 10 min | 503 |
| `CAPABILITY_MUTATION_IP` | `POST review-feedback`, `POST intake-submissions`, `POST portal/guests`, `PATCH portal/guests/[guestId]`, `POST …/revoke`, `POST …/access-link` (one shared budget) | keyed client-IP identity | 60 / 10 min | 503 |
| `GUEST_RSVP_GUEST` | personalized RSVP, after the token resolves to an active guest | `guestId` | 20 / 10 min | 503 |
| `REVIEW_FEEDBACK_LINK` | review feedback (COMMENT, REVISION_REQUEST, APPROVAL alike), after REVIEW resolution | `accessLinkId` | 20 / 10 min | 503 |
| `INTAKE_LINK` | intake submission, after INTAKE resolution | `accessLinkId` | 5 / 1 h | 503 |
| `PORTAL_MUTATION_LINK` | Portal guest create / edit / revoke, after PORTAL resolution | `accessLinkId` | 120 / 1 h | 503 |
| `GUEST_LINK_MINT_GUEST` | Portal ISSUE and REGENERATE, once the guest is confirmed in the resolved Project | `guestId` | 5 / 1 h | 503 |

**Not limited:** the generic public invitation `/i/[slug]`, every staff `/api/v2/internal/**` route, and all admin/staff pages.

**Order.** pre-resolution IP guard → frozen token resolution (§4.1, unchanged) → post-resolution link/guest guard → frozen domain action.
- **IP guard:** runs before any body read, token hash or `service_role` lookup. Its 429 is therefore independent of credential validity, so it creates no oracle.
- **Link guard (REVIEW / INTAKE / PORTAL):** injected at the resolver's `touchLastUsedAt` step, which runs only after shape, hash, purpose, project, revoked and expiry checks have all passed.
  - Malformed, unknown, wrong-purpose, revoked or expired tokens keep their frozen 404/410 and never reach the guard.
  - A refused request writes no `last_used_at` and never reads the body.
- **Mint guard:** applied after `getGuestLinkTarget` confirms the guest belongs to the resolved Project, and before any token rotation. ISSUE/REGENERATE race protections are unchanged.
- **Personalized-RSVP guest guard:** the 0042 RPC never returns the guest id, so a narrow `service_role` lookup supplies it (`guests.id` of the active guest by `token_hash`, `public-guest-identity-repository.ts`).
  - The id stays server-side.
  - When the lookup finds no active guest, the guard is skipped and the RPC yields its frozen 404/410.

**Keys.**
- **Formats:** `wc:v1:<segment>:ip:<HMAC-SHA256(RATE_LIMIT_IP_HMAC_SECRET, normalized IP)>`, `wc:v1:<segment>:link:<uuid>` and `wc:v1:<segment>:guest:<uuid>`. Upstash appends the window index.
- **Keyed IP identity:** the IP digest is keyed with a server-only secret, so the small IPv4 space cannot be brute-forced back to an address from Redis keys. Redis keys never contain a raw IP. Rotating the secret starts fresh limiter identities, which is acceptable.
- **Never keys:** raw IP, raw REVIEW/PORTAL/INTAKE/guest token, or stored `token_hash`.
- **Unresolved IP:** requests whose client IP cannot be determined share one `unresolved` bucket; this is never a bypass.

**Trusted client IP.** Owner deployment contract: CLIENT → VERCEL → WEDDINGCLICK, with no other proxy or CDN in front.
- **Single reader:** `lib/server/rate-limit/client-ip.ts` is the only reader. It prefers `x-real-ip`, else the first `x-forwarded-for` entry (both are normalized by Vercel's first hop).
- **Validation:** the value is validated with `node:net`.
  - IPv4-mapped IPv6 collapses to IPv4.
  - Other IPv6 addresses are reduced to their /64 network.
  - Anything else → unresolved.
- **Revisit:** this trust MUST be revisited if the topology changes.

**Responses.**
- **429:** `{"error":"Too many requests"}` (JSON for APIs; a fixed Vietnamese `text/plain` page for token pages) with `Cache-Control: no-store`.
- **503:** `{"error":"Service temporarily unavailable"}` with `Cache-Control: no-store`.
- **No `Retry-After`:** the sliding window's `reset` is only the end of the current fixed window. A request after it may still be refused, so no correct retry time is available.
- **No headers:** no `X-RateLimit-*` header.
- **No details:** no key, IP, token state, counter or provider detail.
- **Code:** the post-resolution refusals are a dedicated `RateLimitGuardError` (kind `RATE_LIMITED` | `SERVICE_UNAVAILABLE`), mapped only by the four public handlers. `apiErrorStatus` and the staff error mapping are unchanged.

**Logging.** Fixed categories only: `[rate-limit] RATE_LIMIT_BACKEND_NOT_CONFIGURED` and `[rate-limit] RATE_LIMIT_BACKEND_UNAVAILABLE`.
- **Never logged:** IP, IP hash, token, token hash, link or guest id, guest name, or RSVP message.
- **Not activity:** no `activity_logs` writes.

**Deployment.**
- **Redis credentials:** server-only, resolved as ONE complete pair and never mixed across families:
  1. **Preferred, explicit/direct Upstash:** `UPSTASH_REDIS_REST_URL` (HTTPS) + `UPSTASH_REDIS_REST_TOKEN`.
  2. **Else Vercel Marketplace (Upstash integration):** `KV_REST_API_URL` + `KV_REST_API_TOKEN`, used natively so Marketplace-managed rotation stays effective.

  The rules:
  - **Do not duplicate:** never manually copy Marketplace-managed secrets into `UPSTASH_*` names just to rename them.
  - **Partial pairs:** a partial `UPSTASH_*` pair is ignored (the complete `KV_*` pair is then used whole). A partial pair with no complete pair is invalid.
  - **Invalid:** a non-HTTPS URL is invalid.
  - **Handling:** all of these are never `NEXT_PUBLIC_`, never committed, never logged.
- **`RATE_LIMIT_IP_HMAC_SECRET`** is required separately, whichever Redis source is used. It is server-only, never `NEXT_PUBLIC_`, never committed, never logged.
- **`RATE_LIMIT_IP_HMAC_SECRET`:** ≥ 32 cryptographically random bytes, generated for this purpose only.
  - **Independence:** never reuse the Supabase service-role key, the Upstash token or any customer/guest token.
  - **Generation:** `openssl rand -hex 32` (64 hex characters).
  - **Validation:** the application treats it as an opaque UTF-8 secret and rejects values shorter than 43 characters or containing whitespace. A length check cannot prove entropy.
  - **Rotation:** resets all IP limiter identities; link/guest limits are unaffected.
- **Missing or invalid configuration (no complete Redis pair, or an invalid HMAC secret):** every protected mutation returns 503 without running the domain handler, and token pages fail open. This includes local `next dev` and Vercel Preview without the variables.
  - **Fixed diagnostics:** `RATE_LIMIT_BACKEND_NOT_CONFIGURED` (Upstash) and `RATE_LIMIT_IDENTITY_NOT_CONFIGURED` (HMAC secret).
- **Release condition:** not releasable until a complete Redis pair and the HMAC secret are configured in the target environment and a controlled smoke passes. That smoke uses a normal request, one controlled 429 on an isolated key, recovery after the window, and no credential in logs.
- **Operational recovery:**
  - Counters expire on their own.
  - To clear a stuck key, delete `wc:v1:<segment>:<subject>:*` in Upstash.
  - To reset every V1 counter, bump `RATE_LIMIT_NAMESPACE`.

**No migration** (latest remained 0042 at the time; 0043 was later added by Task 035B, §32). No CAPTCHA. A Vercel Firewall may be added later as an outer layer only.

## 32. Task 035B — Legacy V1 Exposure Containment

**Status.** **FROZEN** at `70ab2bf5ee2bf19b2202cce158d61555558701ae`. Migration `20260911041203_0043_legacy_v1_lockdown.sql` is **applied** (Product Owner, `supabase db push`) and **live-verified** (2026-10-06). The post-application verification proved each item below (details: `docs/SECURITY.md` §11.2):
- anon reads denied;
- anon writes denied;
- authenticated legacy access denied;
- `wedding-photos` upload denied;
- `wedding-photos` public read denied;
- V2 still healthy.

The Task 035 pre-production security gate is **COMPLETE**. *(Historical: until this verification, Task 035 was not complete.)*

**Database (primary).** Every statement is guarded (`to_regclass`); the migration is a no-op on fresh environments without V1 objects and is re-runnable.

| Object | Change |
|---|---|
| `public.invitations`, `public.weddings`, `public.wishes` | `REVOKE ALL` from `anon`, `authenticated`, `PUBLIC` (incl. owned sequences); `ENABLE` + `FORCE ROW LEVEL SECURITY` |
| `public.invitations` policies | drop "Cho phép admin sửa thiệp" (ALL, `USING (true)`) and "Cho phép tất cả mọi người đọc thiệp" (SELECT, `USING (true)`) |
| `storage.objects` | drop "Cho phép mọi người tải ảnh lên" (public INSERT into `wedding-photos`) |
| `storage.buckets` | `wedding-photos` → `public = false` |

- **Post-conditions:** the migration raises (and rolls back) if any client grant, any policy on the three tables, any `wedding-photos` storage policy, or a public `wedding-photos` bucket remains.
- **Non-destructive:** no `DELETE`, `TRUNCATE` or `DROP TABLE`, and no storage object removal.
- **Unaffected:** `service_role`/`postgres` access (both BYPASSRLS), `project-media` and all V2 objects.

**Routes.**
| Route | Behavior |
|---|---|
| `/[id]`, `/[id]/rsvp`, `/[id]/vip`, `/guest-list/[id]` | fixed unavailable page "Phiên bản thiệp này không còn được hỗ trợ." + contact hint, `noindex`; no data read |
| `/admin`, `/dashboard`, `/thong-ke` | exact `next.config.ts` redirect → `/admin/v2` (307); `/dashboard` and `/thong-ke` pages also `redirect()` |
| `/admin/v2/**` and every V2 route | unchanged (never matched) |

V1 RSVP is not routed into V2 RSVP: the data models differ.

**Browser write boundary.**
- **Rule:** no browser file may call `.insert/.update/.upsert/.delete/.rpc` or Storage writes through `lib/supabase`.
- **Exceptions:**
  - `app/admin/page.tsx`, the owner-quarantined V1 editor: unchanged, valid only while `/admin` is redirected and 0043 denies its operations;
  - `lib/admin/signed-media-upload.ts`, the V2 Task 024 `uploadToSignedUrl` with a server-issued one-time token.

**Not changed.** Task 035A (frozen at `cabb201`), V2 behavior and data retention. The six earlier checkpoint tests that asserted "no 0043" now allow exactly this approved file (owner decision 2026-10-06).

## 33. Launch Hardening 02 — Staff Access-Link Inventory + Revoke (P0-1)

**Purpose.** Staff can find and revoke every capability link of a Project after a page reload, so an old or leaked link (above all a PORTAL link) is recoverable through the product. Closes the Task 033C deferral "PORTAL link listing/revoke" (`docs/DECISIONS.md`).

**Managed types.** Exactly the frozen `ACCESS_LINK_TYPES` stored in `project_access_links`: `INTAKE`, `REVIEW`, `PORTAL`. Personalized guest links (the `guests` token model, §22/§26) are out of scope.

### 33.1 `GET /api/v2/internal/projects/[id]/access-links`

- **Auth:** Bearer → `requireStaff` → staff-scoped Supabase client. STAFF and ADMIN alike. No `service_role`, no customer/guest token.
- **Order of checks:** missing/malformed bearer 401 → unknown user 401 → non-staff 403 → malformed Project id 400 → unknown Project 404 (direct RLS read of `projects`).
- **Read:** one staff-RLS select of explicit columns `id, project_id, link_type, created_at, expires_at, revoked_at, last_used_at` filtered by `project_id`, with an exact count. `token_hash`, `token_hint` and `created_by` are never selected.
- **Completeness:** the full Project set is returned. If the exact count differs from the rows received (a server row cap), or any row belongs to another Project or has an unknown type, the request fails closed with 500 — an active link can never be silently hidden.
- **Response (200, `Cache-Control: no-store`):** `{ data: [{ id, linkType, status, createdAt, expiresAt, revokedAt, lastUsedAt }] }`. `id` is the revoke target, not a credential. No token, hash, hint, Project id or creator id.
- **Status:** derived at request time with the frozen resolver precedence (§4): `revoked_at` set → `REVOKED`; else `expires_at <= now` → `EXPIRED`; else `ACTIVE`.
- **Ordering:** `ACTIVE` first, then `EXPIRED`/`REVOKED`; each group `created_at` descending, `id` descending as tie-break.

### 33.2 Revoke

Reuses the frozen Task 026 route `POST /api/v2/internal/projects/[id]/access-links/[linkId]/revoke` (§11.3) and `revoke_access_link` unchanged: pinned to `(project_id, id)`; cross-Project or unknown link → 404 (AL003); already revoked → 409 (AL004); exactly one `ACCESS_LINK_REVOKED` activity row, written by the RPC. An expired-but-not-revoked link remains revocable at the API; the UI offers revoke on `ACTIVE` rows. There is no restore. A revoked token stops resolving immediately (`REVOKED_TOKEN` → the link type's frozen unavailable state).

### 33.3 Staff UI

Publish tab ("Xuất bản"), section "Liên kết truy cập", shown regardless of publication state. Rows show the type label (Cổng khách hàng / Duyệt thiệp / Thu thập thông tin), status, created, last used, expiry and revoked times; no UUID. "Thu hồi link" opens an in-page confirmation ("Xác nhận thu hồi", stating the link stops immediately and cannot be restored). After every revoke attempt the list is re-read from the server; success is shown only after the server confirmed. "Tải lại" re-reads the list (for example after issuing a new Portal link). The Task 033C Portal issuer and its one-time raw URL are unchanged.

**Not provided.** Raw-token or URL recovery (raw tokens are never stored), restore/unrevoke, ISSUE/ROTATE changes, new Intake/Review UI, guest-link management. **No migration** (latest remains 0043): the existing 0014 staff SELECT policy/grant and the 0025 RPC suffice.

## 34. Launch Hardening 03 — Staff Customer + Project Creation UI (P0-3)

**Purpose.** Staff start a real WeddingClick workflow entirely in V2 Admin (owner decision D1, `docs/DECISIONS.md` "Launch Hardening 01"). UI only: the frozen Task 005 / 005B routes and `create_project_with_addons` are reused unchanged.

### 34.1 Flow

`/admin/v2/projects` → "Tạo dự án" → `/admin/v2/projects/new` → Customer fields + package + add-ons → submit:

1. `POST /api/v2/internal/customers` (Task 005) with `{ displayName, phone, email, contactNote }`; blank optional fields are sent as `null`.
2. `POST /api/v2/internal/projects` (Task 005B) with `{ customerId, packageCode, addonCodes }` only.
3. On `201`, `router.replace("/admin/v2/projects/<server-returned id>")`.

Both calls use the staff Bearer token through `lib/admin/admin-api-client.ts`; STAFF and ADMIN alike; no browser Supabase table access and no `service_role`. The client validation (name 1–200 characters, canonical `SERVICE_PACKAGE_CODES` / `SERVICE_ADDON_CODES`) is for UX only; the server validators and the RPC stay authoritative.

### 34.2 Not one transaction

The two routes are separate requests. The Project + add-ons step is atomic (`create_project_with_addons`); Customer + Project together are **not**. If the Customer is created and the Project fails, the Customer remains. The form keeps that Customer id, hides the Customer fields and offers "Thử lại tạo dự án", which calls only step 2 for the same Customer — a retry never creates a second Customer. "Nhập khách hàng khác" is an explicit staff choice that clears the Customer fields; the earlier Customer stays as an ordinary Customer with no Project.

### 34.3 Duplicate submit

Neither route is idempotent. The form blocks a second submit with an in-flight ref guard and disables every input and the submit button while a request is in flight and during the success redirect. There is no server-side idempotency guarantee.

### 34.4 Server-derived values

Project code, `event_type` `WEDDING`, `status` `NEW`, `payment_status` `UNPAID`, the package/add-on price and name snapshots and `created_by` all come from the RPC and column defaults (0005/0006b). The form shows no price; the Project workspace shows the stored snapshot. No lifecycle or payment transition is triggered. Add-ons are chosen only at creation; there is no post-create add-on editing.

### 34.5 Errors and logging

Errors are shown as fixed Vietnamese messages keyed by HTTP status (0/401/403/400/404/409, else a generic retry message); server text is never rendered. Customer and Project creation write no activity row — there is no creation activity code in the frozen contract, and adding one would need a migration.

**Not provided.** Intake UI, Excel import, customer search/reuse of an existing Customer, CRM editing, assigned staff/deadline input, add-on editing, Republish. **No migration** (latest remains 0043).

## 35. Launch Hardening 04 — Republish After PUBLISHED (P0-2)

**Purpose.** Correct a live invitation without mutating the published snapshot (owner decisions D2/D3, `docs/DECISIONS.md` "Launch Hardening 01"). **Status:** implemented; migration 0044 **APPLIED** by the Product Owner and DEV-verified by a post-apply republish E2E (2026-10-07, `docs/DECISIONS.md` "Launch Hardening 04" item 7); freeze performed by the Launch Hardening 04 commit.

### 35.1 Flow (no new route, RPC or activity code)

`PUBLISHED` → staff edit the canonical draft → **"Chỉnh sửa & duyệt lại"** (Duyệt tab, in-page confirmation) → `POST …/review-versions` (§ Task 030, unchanged) → `CUSTOMER_REVIEW` → customer approves the **new** version through a Review link (`submit_review_feedback`, unchanged) → `APPROVED` → `AWAITING_PAYMENT` → `READY_TO_PUBLISH` → **"Xuất bản lại từ bản duyệt #N"** (Xuất bản tab) → `publish_invitation` (§8, unchanged) → `PUBLISHED`.

- **Database change:** only `create_review_version` (0044): RV010 now rejects `COMPLETED` / `ARCHIVED` only. Everything else in its 0037 body, security mode, grants and error contract is unchanged.
- **Approval:** an approval of an earlier version never counts for the new one; there is no skip, staff-approve or quick-republish path.
- **Payment:** `payment_status` stays `PAID`. The Xuất bản tab offers `AWAITING_PAYMENT → READY_TO_PUBLISH` directly when already paid; `mark_project_paid` refuses a second confirmation (PL007). Price snapshots are untouched.
- **Live version:** public `/i/[slug]`, RSVP, share cover and personalized guest reads resolve `published_version_id`, never `projects.status`, so the old publication stays live through `CUSTOMER_REVIEW` … `READY_TO_PUBLISH`. Only a successful publish moves the pointer.
- **Republish:** appends a new PUBLISHED version copied from the approved review (CAS on both pointers, PB009/PB010 unchanged), keeps the old PUBLISHED row, keeps the frozen `public_slug`, logs `INVITATION_REPUBLISHED` once (written by the RPC; the UI logs nothing).
- **SEPARATE:** a correction may cover one variant only; the untouched variant keeps its publication and the Project returns to `PUBLISHED` when every required publication matches its current review.
- **Unchanged:** guest tokens and ids, Portal and other access links, RSVP rows (Project/guest scoped), templates, 035A/035B, LH02, LH03.
