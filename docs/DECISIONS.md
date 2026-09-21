# WeddingClick V2 — Approved Product & Architecture Decisions

**Status:** Source of truth for approved decisions  
**Last updated:** 2026-09-21

This file records decisions that Claude Code must not silently reinterpret.

## Product Model

1. WeddingClick V1 is primarily an **internal production/operations system** used by WeddingClick staff to create and manage invitations.
2. Customers do not need normal user accounts in V1.
3. Customers interact through secure links for:
   - information intake;
   - invitation review/approval;
   - RSVP management;
   - guest-link creation/management when the personalized guest add-on is purchased.
4. Wedding guests interact with published invitation pages and RSVP only.
5. Payment happens outside WeddingClick. The system records payment status manually; it does not implement a payment gateway in V1.

## Commercial Packages

Current initial pricing:

- One common invitation for both families: **150,000 VND**.
- Separate groom-side + bride-side invitations: **250,000 VND**.
- Personalized guest-name capability: **+50,000 VND**.

Current catalog prices must be configurable. A Project preserves a price snapshot so future catalog changes do not alter historical Projects.

## Invitation Variants

Every wedding template must support:

- `COMMON`
- `GROOM`
- `BRIDE`

Business rules:

- Groom-side invitation uses **Lễ Thành Hôn** and groom-first presentation.
- Bride-side invitation uses **Lễ Vu Quy** and bride-first presentation.
- Common invitation includes both families appropriately.
- Variants use one canonical wedding data source. No copy/paste data duplication.

## Personalized Guest Add-on

1. Personalized guest text is free-form.
2. The system must allow entries such as:
   - `Anh Hiếu và gia đình`
   - `Chú B và người thương`
   - `Em và sự cô đơn`
3. Do not require honorific/name decomposition.
4. Manual entry and Excel import should be supported.
5. Guest links must use secure opaque tokens, not the guest display name as identity.

## Customer RSVP Management

After delivery/publish, the customer receives:

1. A public invitation link.
2. A private Customer Portal/RSVP management link.
3. If personalized guest add-on is enabled, the same private portal exposes the guest-link tool.

The customer should be able to monitor at least:

- number of responses;
- attending responses;
- not-attending responses;
- expected attendee headcount;
- response list.

RSVP remains available for non-personalized invitations as well.

## Customer Portal

1. No normal customer login/password is required in V1.
2. Portal uses a private, revocable, Project-scoped secure token.
3. Portal does not grant staff/admin access.
4. Portal should be simple and mobile-first.
5. Customer editing of the final published invitation is not a V1 goal.

## Intake Form

1. Staff may create/send a secure form link to the customer.
2. Customers may provide wedding information through the form.
3. If the customer changes previously submitted data, staff confirmation is preferred before those changes become canonical Project data.
4. Customer submissions must not silently overwrite a near-final/published invitation.

## Project Management

WeddingClick must manage:

- Projects;
- customers;
- status;
- main deadline;
- assigned staff;
- package/add-ons;
- payment status;
- invitation progress;
- review/approval;
- guests;
- RSVP;
- basic activity/history;
- statistics.

V1 may use one primary assigned staff member per Project while keeping architecture extensible.

## Project Lifecycle

Approved conceptual lifecycle:

- `NEW`
- `WAITING_FOR_INFO`
- `IN_PROGRESS`
- `INTERNAL_REVIEW`
- `CUSTOMER_REVIEW`
- `REVISION_REQUIRED`
- `APPROVED`
- `AWAITING_PAYMENT`
- `READY_TO_PUBLISH`
- `PUBLISHED`
- `COMPLETED`
- `ARCHIVED`

Exact naming may be refined during schema implementation only if product meaning remains unchanged and documentation is updated.

## Task 025 — Project Lifecycle / Payment / Assignment

Frozen decisions implemented by migration `0024_project_lifecycle_payment_assignment.sql` (`transition_project_status`, `mark_project_paid`, `reassign_project_staff`).

**A. Manual transition graph**

```text
NEW               -> WAITING_FOR_INFO
WAITING_FOR_INFO  -> IN_PROGRESS
IN_PROGRESS       -> INTERNAL_REVIEW
INTERNAL_REVIEW   -> IN_PROGRESS
REVISION_REQUIRED -> IN_PROGRESS
APPROVED          -> AWAITING_PAYMENT
AWAITING_PAYMENT  -> READY_TO_PUBLISH   (only when payment_status = PAID)
PUBLISHED         -> COMPLETED
COMPLETED         -> ARCHIVED
```

No other manual edge is allowed. `ARCHIVED` is terminal.

**B. Reserved targets for `transition_project_status`**

`CUSTOMER_REVIEW`, `REVISION_REQUIRED`, `APPROVED`, and `PUBLISHED` never appear as a target (`to_status`) of this generic function.

- `CUSTOMER_REVIEW` / `REVISION_REQUIRED` / `APPROVED` belong to Task 030 (Review workflow).
- `PUBLISHED` belongs to Task 031 (publish_invitation).
- No `ADMIN` override exists in V1.

**C. Status semantics**

- A same-status request is a conflict/no-op, never an error about illegality.
- A structurally invalid edge is an invariant failure.
- Reaching `COMPLETED` sets `completed_at`; reaching `ARCHIVED` sets `archived_at`. No Task 025 transition ever clears either timestamp.
- The optional `reason` is trimmed; a blank result becomes `NULL`; it is capped at 2000 characters; it is stored only in activity metadata, never as a `projects` column.

**D. Payment**

- Payment confirmation is manual/offline only.
- `mark_project_paid` succeeds only when `status = AWAITING_PAYMENT` and `payment_status = UNPAID`.
- On success it sets `payment_status = PAID` and `paid_at = now()`. It does not change project lifecycle status.
- `PAID -> UNPAID` is not a normal V1 application action.
- The `AWAITING_PAYMENT -> READY_TO_PUBLISH` edge additionally requires `payment_status = PAID`.

**E. Commercial freeze**

Commercial terms remain editable only under the already-frozen UNPAID rules. After `PAID`, the existing database commercial-freeze mechanisms (migrations 0005/0006) remain authoritative. Task 025 adds no commercial-edit API.

**F. Assignment**

Assignment (`assigned_staff_id`) is responsibility metadata only — never a visibility/RLS filter. Any active `STAFF`/`ADMIN` may self-assign, assign another active `STAFF`/`ADMIN`, reassign, or unassign (set `NULL`). A non-null assignee must resolve to an existing, active, `STAFF` or `ADMIN` profile. Assigning the same value the Project already has is a conflict/no-op.

**G. Activity**

- An ordinary manual status transition logs `PROJECT_STATUS_CHANGED`.
- Reaching `ARCHIVED` logs `PROJECT_ARCHIVED` only (never both).
- `mark_project_paid` logs `PROJECT_MARKED_PAID`.
- An assignment change logs `STAFF_ASSIGNMENT_CHANGED`.
- Every mutation and its activity row are written atomically, in the same transaction.

## Task 026 — Access-Link & Token Foundation

Frozen decisions implemented by migration `0025_access_link_actions.sql` (`issue_review_link`, `rotate_access_link`, `revoke_access_link`) against the existing `project_access_links` table (migration `0014`). Phase 1 (this migration, D1–D13) = FROZEN. Phase 2 (token crypto utility + `service_role`-backed resolution module, `lib/server/auth/access-token-crypto.ts` / `lib/server/access-links/resolve-access-link.ts` / `lib/server/supabase/access-link-resolution-repository.ts`) = FROZEN. Phase 3 (staff issue/rotate/revoke HTTP routes, D14) = FULL PASS (authoring, independent source review, DEV/STAGING-verified — not production — docs sync) — see D14. Task 026 overall: Phase 1 FROZEN, Phase 2 FROZEN, Phase 3 FROZEN. COMMITTED, PUSHED (implementation commit `45e1cf0`).

**D1. Routes (later phase)**

Task 026 will eventually own staff issue/rotate/revoke routes. No public token-resolution route belongs to Task 026 — that is built by whichever of Tasks 027/030/032 first exposes a customer-facing token-consuming page.

**D2. Multiplicity**

Multiple simultaneously-active links with the same `(project_id, link_type)` are allowed. Issuing a new link never auto-revokes any other link of the same type. No partial unique index and no single-active rule exist or are planned. Rotation affects exactly the selected source link and never inspects or touches any sibling link.

**D3. Token resolution errors (later phase)**

The existing `ApiError` will gain `EXPIRED_TOKEN -> 410` and `REVOKED_TOKEN -> 410` when the (later-phase) resolution module is built. No third error framework — these extend the existing `ApiError`/`ApiErrorKind` module (`lib/server/errors/api-error.ts`), consistent with `docs/API_CONTRACT.md` §5's "later tasks must add to that error module when first needed."

**D4. Resolution order (later phase)**

```text
malformed token                -> 404
unknown hash                   -> 404
wrong purpose                  -> 404
wrong project                  -> 404
revoked                        -> REVOKED_TOKEN / 410
expired (expires_at <= now())  -> EXPIRED_TOKEN / 410
success -> update last_used_at -> return context
```

Purpose/project checks must happen before revoked/expired disclosure is possible — an unknown hash, a wrong-purpose token, and a wrong-project token are never distinguishable from each other by a caller, preserving anti-enumeration (`docs/API_CONTRACT.md` §4.1). Only after a token is confirmed to match the expected purpose and project does the resolution flow distinguish revoked from expired. If both conditions hold after purpose/project match, `REVOKED_TOKEN` wins (revocation is a deliberate staff action and takes precedence over passive expiry).

**D5. Token transport**

The Task 026 resolution module accepts a bare raw token string, agnostic to where the caller extracted it from (header, query parameter, or path segment). The URL query/path choice for customer-facing links is deferred to the later workflow tasks (027/030/032) that actually build a page around it.

**D6. Expiry**

`expires_at` remains nullable; `NULL` means never expires. No TTL minimum, maximum, or default is introduced, and no product-level expiry bound is added by Task 026.

**D7. Token crypto (later phase)**

32 CSPRNG raw bytes, unpadded base64url-encoded (raw token exactly 43 characters). SHA-256 digest, exactly 32 bytes, stored in `token_hash` (`BYTEA`). `token_hint` is the final 8 characters of the raw token — display-only, never used for authentication or lookup. The raw token is never persisted, logged, or placed in activity metadata.

**D8. Rotation**

The source link must exist, belong to `p_project_id`, have `revoked_at IS NULL`, and not be expired. A successful rotation: revokes exactly the source row; inserts exactly one replacement row preserving `project_id`, `link_type`, and `expires_at` from the source; uses the newly supplied `token_hash`/`token_hint`; is atomic in one DB transaction; and logs `ACCESS_LINK_ROTATED` exactly once. An already-revoked or already-expired source is `CONFLICT` (409) — expired links are not rotatable (revocation remains available instead). No sibling link of the same type is touched.

**D9. Revocation**

The target link must exist and belong to the project. An already-revoked link is `CONFLICT` (409). An expired-but-not-revoked link may still be revoked. There is no un-revoke path. A successful revocation logs `ACCESS_LINK_REVOKED` exactly once.

**D10. Activity**

`issue_review_link` success logs `REVIEW_LINK_ISSUED`; `rotate_access_link` success logs `ACCESS_LINK_ROTATED`; `revoke_access_link` success logs `ACCESS_LINK_REVOKED`. Initial INTAKE/PORTAL direct-RLS issuance logs nothing (unchanged from `docs/API_CONTRACT.md` §7.4). Activity metadata never contains a raw token, `token_hash`, or `token_hint` — only ids and type strings.

**D11. DB access**

The later-phase token resolution flow uses a server-only `service_role` client, per `docs/API_CONTRACT.md` §1/§2 and `docs/PHYSICAL_DATABASE_PLAN.md` §1.4/§1.6. The three Task 026 staff mutation actions (`issue_review_link`, `rotate_access_link`, `revoke_access_link`) do not depend on `service_role` at all — each is `SECURITY DEFINER`, self-authorizing via `public.is_staff()`, invoked only by an authenticated staff session, mirroring the `transition_project_status`/`mark_project_paid`/`reassign_project_staff` pattern (migration `0024`, Task 025).

**D12. DB enforcement — least-privilege closing of direct-write bypasses (refined, Phase 1 hardening patch)**

Direct authenticated `INSERT` on `project_access_links` is permitted only for `link_type IN ('INTAKE', 'PORTAL')`, and only carrying the six issuance fields — `project_id`, `link_type`, `token_hash`, `token_hint`, `expires_at`, `created_by`. The `project_access_links_insert_staff` RLS policy's `WITH CHECK` requires all of: `public.is_staff()`, `link_type IN ('INTAKE', 'PORTAL')`, `created_by = auth.uid()` (no spoofing another staff member's attribution), `revoked_at IS NULL`, and `last_used_at IS NULL` (no forging a pre-revoked or pre-used row). This closes the bypass that previously let a direct staff-session `INSERT` create a `REVIEW` row without going through `issue_review_link()` and its `REVIEW_LINK_ISSUED` audit event, and additionally closes the row-content bypasses a plain `is_staff()`-only check left open. Independently of RLS, `authenticated`'s SQL-level `INSERT` privilege is narrowed from table-wide to exactly those same six issuance columns (`GRANT INSERT (project_id, link_type, token_hash, token_hint, expires_at, created_by) ... TO authenticated`) — `id` and `created_at` are never authenticated-INSERT-able and instead come from their column `DEFAULT`s (`gen_random_uuid()`, `now()`), and `revoked_at`/`last_used_at` are not authenticated-INSERT-able at all.

Direct authenticated `UPDATE` no longer permits `revoked_at` or `last_used_at` — the table-wide `authenticated` `UPDATE` grant was replaced with a column-scoped `GRANT UPDATE (expires_at)`, since the existing schema intentionally supports direct staff expiry adjustment. Identity columns (`id`, `project_id`, `link_type`, `token_hash`, `token_hint`, `created_by`, `created_at`) remain protected by the pre-existing `guard_access_link_identity_immutability()` trigger (migration `0014`), unchanged by Task 026.

`service_role`'s `UPDATE` privilege on `project_access_links` — table-wide since migration `0014`, and never narrowed by Task 026's initial authoring — is now narrowed to `last_used_at` only (`GRANT UPDATE (last_used_at) ... TO service_role`), addressed here because this migration is the first to introduce a `service_role` token-resolution consumer for this table. `service_role`'s `SELECT` privilege remains table-wide (required for token-hash lookup during resolution); no `service_role` `INSERT` or `DELETE` grant exists; and none of the three Task 026 trusted RPCs grant `service_role` `EXECUTE`. This closes a real SQL-level capability — under the pre-patch table-wide grant, `service_role` could directly set `revoked_at` (bypassing `revoke_access_link()`'s AL003/AL004 validation and its `ACCESS_LINK_REVOKED` audit event on a first revocation; only a *second* change was blocked by the revocation-monotonicity trigger) or `expires_at`/`last_used_at` (untouched by any trigger) — not merely a defense-in-depth measure. Triggers remain the authoritative backstop for the seven identity columns and for revocation monotonicity on `service_role` too (`BYPASSRLS` bypasses RLS policies, never triggers), but are not relied on as a substitute for SQL-level least privilege on the columns a column-scoped `GRANT` can restrict directly.

**D13. Rate limiting**

Deferred to Task 035, per `docs/API_CONTRACT.md` §7.6 and `docs/SECURITY.md` §11 — not a Task 026 concern.

**D14. Phase 3 — staff issue/rotate/revoke HTTP contract (frozen)**

Authored against migration `0025` (unchanged) and the Phase 2 crypto/resolution foundation (unchanged); see `docs/API_CONTRACT.md` §11 for the full request/response/error contract. This entry records only the decisions, not the wire shapes already spelled out there.

Exactly three internal staff routes, no public token-resolution route:

```text
POST /api/v2/internal/projects/[id]/access-links
POST /api/v2/internal/projects/[id]/access-links/[linkId]/rotate
POST /api/v2/internal/projects/[id]/access-links/[linkId]/revoke
```

All three: active STAFF/ADMIN via the existing `requireStaff` boundary, no ADMIN-only branch — identical to Task 025's Path A. Success statuses: issue `201`, rotate `200`, revoke `200`.

Issue request is `{ linkType: "INTAKE"|"REVIEW"|"PORTAL", expiresAt?: string|null }`; unknown fields (including a caller-supplied `token`/`rawToken`/`tokenHash`/`tokenHint`/`createdBy`/`projectId`) are `BAD_REQUEST`. `expiresAt` omitted or explicit `null` both normalize to `null`; a non-null value must be a valid RFC 3339 timestamp — a valid past, exactly-now, or future timestamp is all accepted without restriction, consistent with D6 (no TTL bound is introduced by Phase 3 either).

Rotate and revoke take **no request-body input at all** — the route never reads the request body, because every mutation input is server-generated. This is not a body-validation rule; there is simply nothing to validate.

Raw-token response field name is `token` (never `accessToken`/`rawToken`). Issue and rotate success responses never include `tokenHint` or `token_hash` — redundant/unsafe once the raw token itself is present in the same payload. Revoke never returns a token field at all. Every issue and rotate response — success or error — carries `Cache-Control: no-store`, so a secret-bearing route can never be cached under any branch; this is stricter than the frozen minimum (successful issue/rotate responses only), applied uniformly because it was simpler and strictly safer to implement that way. Revoke carries no such requirement.

INTAKE/PORTAL issuance: a direct-RLS `projectExists` precheck (mirrors Task 024's `finalizeMedia`/`project-media-repository.ts` precedent for a plain-INSERT path with no RPC to make the check atomic) followed by the direct six-column INSERT (D12), `created_by` bound to the verified `StaffContext.userId`, never request input. A residual FK race after the precheck maps to generic `INTERNAL` (500) — never raw SQLSTATE/message matching. REVIEW issuance performs no pre-read; `issue_review_link`'s own AL002 is the sole authority for a missing Project, mirroring Task 025's "no pre-read before a trusted RPC" convention. Rotation calls `rotate_access_link`; revocation calls `revoke_access_link` — both exactly as specified by D8/D9, no application-level reimplementation of their validation.

Mutation-result identity hardening (independent-review Finding B): beyond shape/cardinality validation, the repository additionally requires the RPC-returned row's `project_id` to match the request for all three RPC paths; `rotate_access_link`'s returned row id must differ from the source (rotation always creates a new row); `revoke_access_link`'s returned row id must equal the requested target (revocation mutates the exact row in place). Any mismatch is a generic `INTERNAL` failure, never forwarded as a false success.

Token collisions (`UNIQUE(token_hash)` or the `token_hash` `CHECK`) remain unmapped, per the migration's own header — a generic `INTERNAL` (500), no retry, no invented business error.

Staff mutation code uses only the staff-scoped Supabase client (never `service_role`, per D11, unchanged). No sibling link is ever auto-revoked (D2, unchanged). The application never calls `log_activity` or writes `activity_logs` directly — all audit rows remain exclusively DB-owned, inside the three trusted RPCs (D10, unchanged).

Implementation: `lib/server/access-links/{access-link-staff-types,access-link-staff-gateway,validate-issue-access-link-input,issue-access-link,rotate-access-link,revoke-access-link}.ts`, `lib/server/supabase/access-link-staff-repository.ts` (isolated from the Phase 2 `access-link-resolution-repository.ts` — no shared import, no shared client), `lib/server/routes/access-links.ts`, and the three route files above.

Verified against DEV/STAGING (`rggmsdnjnfmnzxdaxcra`): unauthenticated issue/rotate/revoke → 401; malformed project/link UUIDs → 400; INTAKE/PORTAL/REVIEW issuance against a verified-absent Project → 404 with no mutation; rotate/revoke against an absent Project → 404 with no mutation; rotate/revoke against an existing legitimate Project with a verified-absent link id → 404 (AL003) with no mutation. `project_access_links` row count was 0 before and after — no synthetic fixture was created. AL004 (already-revoked)/AL005 (expired-source) were not live-verified — no existing revoked/expired record was available in DEV/STAGING to exercise them without creating a fixture, which the frozen runtime strategy forbids; that behavior remains covered by the RPC's own migration-level tests and the repository/use-case unit tests only.

## Task 027 — Intake Workflow (Phase 1 + Phase 2, COMPLETE / FROZEN)

**Status:** Task 027 overall — **FULL PASS, COMPLETE, FROZEN**. Phase 1 (DB trusted actions + privilege hardening): FULL PASS — authoring, independent source review, DEV/STAGING apply, and runtime/security verification all complete; migration `20260911041146_0026_intake_actions.sql` is applied to DEV/STAGING (`rggmsdnjnfmnzxdaxcra`) and is now historical/immutable. Phase 2 (HTTP/application workflow): FULL PASS — authoring, independent source review, and DEV/STAGING safe runtime verification all complete; see `docs/API_CONTRACT.md` §12 for the full frozen wire contract.

**Scope (frozen, Product/Architecture sign-off):** customer INTAKE submission → immutable intake snapshot → staff apply OR reject. The canonical apply target for V1 is `wedding_details` only — no `project_events`/`project_media` field or action, no Task 030 REVIEW, Task 031 publish, or Task 032 PORTAL/guest behavior. Multiple simultaneously-`PENDING` submissions per Project are allowed by design — no partial unique index, no single-pending invariant, no auto-supersede/auto-reject/auto-delete of sibling submissions.

Three new `SECURITY DEFINER` trusted business actions, all `SET search_path = ''`, against the existing `intake_submissions` table (migration 0015, table shape untouched):

- **`submit_intake_submission`** — `GRANT EXECUTE` to `service_role` only. Takes an already-resolved `{ project id, INTAKE access-link id }` context plus the 20 Wedding-Details-shaped fields (mirroring `save_wedding_details`'s own parameter list) — the raw bearer token never enters this RPC; resolution happens once, earlier, in the existing Task 026 Phase 2 resolver. Re-validates the presented access-link context against a fresh `FOR UPDATE` lock (existence/project/INTAKE-purpose collapsed to one outcome, then revoked, then expired) to close the resolution-to-submit race. Inserts exactly one immutable `PENDING` snapshot and logs `CUSTOMER_SUBMISSION_RECEIVED` (ids-only metadata — never the payload, PII, or token material).
- **`apply_intake_submission`** — `GRANT EXECUTE` to `authenticated` only; self-authorizes as active STAFF/ADMIN identically to `save_wedding_details`/the Task 026 trio. Locks the target Project row then the exact submission row (matched on id AND project_id); requires `PENDING`; applies the stored immutable snapshot to canonical `wedding_details` by composing with Task 022's frozen `save_wedding_details()` exactly once, rather than duplicating its upsert/no-op logic. `CANONICAL_DATA_APPLIED` remains entirely owned by `save_wedding_details()` — it is emitted, or correctly suppressed on a true no-op, according to Task 022's existing changed/no-op semantics; `apply_intake_submission` never calls `log_activity` itself. Transitions the submission to `APPLIED` with `reviewed_by`/`reviewed_at`. Touches no sibling submission, no `project_events`, no `project_media`, no project lifecycle.
- **`reject_intake_submission`** — `GRANT EXECUTE` to `authenticated` only; identical self-authorization/locking/PENDING-only pattern. Transitions the submission to `REJECTED` with `reviewed_by`/`reviewed_at`/nullable `staff_note`. Never mutates canonical `wedding_details`. No frozen rejection activity type exists in the Activity Union (`docs/API_CONTRACT.md` §6), and none is introduced — this function never calls `log_activity`.

**Terminal semantics:** `PENDING → APPLIED` or `PENDING → REJECTED` only; both `APPLIED` and `REJECTED` are terminal. Concurrent apply/reject of the same submission serializes on the row lock — the first valid transition wins, the second observes the already-terminal status and fails (`IS008`, no idempotent success on a repeat).

**Privilege hardening on `intake_submissions`** (closing the two direct-write bypasses migration 0015 had left open): `service_role`'s previously table-wide `INSERT` is revoked — a submission now reaches the table only via `submit_intake_submission`. `authenticated`'s previously table-wide `UPDATE` is revoked outright, with no narrower re-grant — unlike `wedding_details`/`project_access_links`, no column on this table remains legitimately staff-direct-editable, since `status`/`reviewed_by`/`reviewed_at`/`staff_note` are now exclusively owned by `apply_intake_submission`/`reject_intake_submission`. `authenticated`'s `SELECT` (RLS-scoped `is_staff()`) is untouched. No `DELETE` grant exists for any role, on any of the three functions' scope — Task 027 creates no intake-submission delete path.

**SQLSTATE contract (new `IS` range, no collision with `AL`/`PL`/`PE`/`WC`/`WD`):** `IS001` caller forbidden (apply/reject) · `IS003` Project not found (apply/reject) · `IS004` access-link context not found/wrong project/wrong INTAKE purpose, collapsed (submit) · `IS005` access link revoked (submit) · `IS006` access link expired (submit) · `IS007` submission not found/wrong project (apply/reject) · `IS008` submission not PENDING (apply/reject). `IS002` is an intentional, permanent gap — an authoring-time in-body service-role self-check (`auth.role()`) was reviewed and rejected in favor of relying solely on the `GRANT EXECUTE` boundary, and the code was left unused rather than renumbering `IS003`–`IS008`.

**Task 022 error propagation:** `apply_intake_submission` does not catch or re-wrap what the nested `save_wedding_details()` call raises — a `WDxxx` SQLSTATE (in practice, only `WD004`, the Gift QR media same-Project FK violation, since `apply_intake_submission`'s own preceding checks make `WD001`/`WD002`/`WD003` unreachable through this path) propagates unchanged. `WD004` is not duplicated into a Task-027 code — Phase 2's apply error-mapping must check the existing `lib/server/wedding-details/wedding-details-rpc-error-codes.ts` map (`SAVE_WEDDING_DETAILS_RPC_ERROR_CODES.WD004 → INVARIANT → 422`) for a propagated code before falling back to generic `INTERNAL`.

**Runtime verification (DEV/STAGING, `rggmsdnjnfmnzxdaxcra`):** migration applied cleanly, exactly once, immediately after 0025, with no drift. Live catalog inspection confirmed all three functions `SECURITY DEFINER`/empty `search_path`, and the exact intended `EXECUTE` grant per function (`submit` → `service_role` only; `apply`/`reject` → `authenticated` only; no `PUBLIC`/`anon`/cross-grant anywhere). Live `intake_submissions` grants confirmed `authenticated: SELECT` only, no `service_role` grant at all. Negative-path runtime: `submit_intake_submission` with fabricated absent project/access-link ids → `IS004`; `apply_intake_submission`/`reject_intake_submission` with a fabricated absent project id → `IS003`; `apply_intake_submission` against a real existing Project with a fabricated absent submission id → `IS007`; an authenticated staff session attempting `submit_intake_submission` → a genuine `42501` permission-denied at the SQL layer (not merely predicted structurally). `intake_submissions` row count and matching `activity_logs` rows were both 0 before and after — no synthetic fixture was created or needed, and no DELETE cleanup was required. Successful submit/apply/reject, `IS005`/`IS006` (resolution-race revoked/expired), `IS008` (terminal-state conflict), the propagated `WD004` path, and a real concurrent apply-vs-reject race remain **not live-verified — fixture-dependent** (manufacturing a permanent, un-deletable successful submission solely for Phase 1 verification was deliberately avoided); these stay covered by the migration's own static/source-review test suite (`lib/server/intake/__tests__/`) and will get end-to-end live coverage once Phase 2's real workflow creates legitimate data.

Implementation: `supabase/migrations/20260911041146_0026_intake_actions.sql`, `lib/server/intake/intake-rpc-error-codes.ts`, `lib/server/intake/__tests__/{intake-rpc-error-codes,static-security-review}.test.ts`.

**Phase 2 — HTTP/application workflow (frozen).** Authored against migration `0026` (unchanged) and the Task 026 Phase 2 resolver (unchanged); see `docs/API_CONTRACT.md` §12 for the full request/response/error wire contract. This entry records only the decisions, not the shapes already spelled out there.

Five routes, none of them new schema/RPC surface — all five call into the three Phase 1 RPCs and the existing Task 026 resolver only:

```text
POST /api/v2/public/intake-submissions
GET  /api/v2/internal/projects/[id]/intake-submissions
GET  /api/v2/internal/projects/[id]/intake-submissions/[submissionId]
POST /api/v2/internal/projects/[id]/intake-submissions/[submissionId]/apply
POST /api/v2/internal/projects/[id]/intake-submissions/[submissionId]/reject
```

Decisions proven live in DEV/STAGING (`rggmsdnjnfmnzxdaxcra`), not merely structurally:

- **Auth/token/body precedence.** For the PUBLIC submit route, transport-auth parsing and Task-026 token resolution always run, and always fail first, before the request body is ever read — a malformed-JSON body never preempts a 401 (missing/wrong-scheme/empty bearer) or a 404 (malformed/unknown/wrong-purpose token). For the STAFF reject route, the equivalent precedence is transport auth → `requireStaff` → body read — a non-staff or unauthenticated caller's malformed body is never read. Both `readBody` parameters are lazy, uninvoked callbacks for exactly this reason (Independent Review Patch 1, Finding A).
- **Direct-RLS staff reads.** List/detail use the staff-scoped client under `is_staff()` RLS, never `service_role` — confirmed live: an authenticated staff session can list/read; the PUBLIC submit route's own `service_role` credential cannot directly `SELECT` `intake_submissions` at all (Phase 1's `42501`, re-confirmed live in Phase 2 runtime verification as the expected least-privilege outcome, not a defect).
- **Exact 20-key snapshot parsing.** The stored `payload` JSONB is mapped back to the Task-022 `SaveWeddingDetailsInput` shape only if its key set is exactly the closed 20-key set (18 nullable-string fields + 2 nullable-UUID fields) — no missing key, no extra key. A shape violation is a generic `INTERNAL` failure that never leaks the malformed content (Independent Review Patch 1, Finding C).
- **Exact-one-row mutation-result hardening.** All three RPC-backed gateways (submit/apply/reject) require the client-library result to be an array of exactly one row, reject any row whose `project_id` (and, for apply/reject, `id`) does not match the request, and never forward a shape/identity mismatch as a false success — mirrors the Task 026 Phase 3 repository pattern.
- **Literal mutation success statuses.** `submit`/`apply`/`reject` each check the returned `status` against the single exact literal they can ever legitimately produce (`"PENDING"`/`"APPLIED"`/`"REJECTED"`) rather than "any recognized status" — an otherwise-well-formed row reporting a different status is treated as untrustworthy, identically to a malformed row (Independent Review Patch 1, Finding B).
- **Task-026 exact consumer allowlists.** `lib/server/access-links/__tests__/token-resolution-static-security-review.test.ts` is narrowed by an exact, two-file `service-role-client.ts` importer allowlist (the existing Task 026 resolution repository plus the new, isolated `lib/server/supabase/intake-submit-repository.ts`) and an exact, one-file authorized-`app/api` allowlist (`app/api/v2/public/intake-submissions/route.ts`) — never a blanket `app/api/v2/public/**` or "any future resolver consumer" carve-out. Every other current and future consumer remains caught, and the underlying Task-026 resolver production code is unchanged.
- **No-store everywhere.** All five Task 027 routes carry `Cache-Control: no-store` on every response, success or error.
- **`service_role` direct `intake_submissions` `SELECT` intentionally denied.** Confirmed both statically (migration `0015` never granted it; migration `0026` additionally revokes the `INSERT` grant it did have) and live (the `42501` above) — this is the frozen least-privilege design, not a gap to close with a `GRANT`.

**Runtime verification (DEV/STAGING, `rggmsdnjnfmnzxdaxcra`):** backend `service_role` credential validated via an authorized capability (`project_access_links` narrow read) rather than the intentionally-forbidden direct `intake_submissions` `SELECT`; STAFF/ADMIN session authenticated and resolved active. Public negative paths — missing auth, wrong auth scheme, malformed bearer, and an unknown-but-syntactically-valid 43-character bearer token — returned `401`/`401`/`404`/`404` respectively, each with `no-store`, with the token-resolution/auth check always winning over a simultaneously malformed JSON body. Staff list/detail/apply/reject were exercised against a real existing Project with generated-and-confirmed-absent submission/project ids: list `200`, detail `404`, apply-with-no-body `404`, apply-with-malformed-bytes still `404` (never `400` — the no-body contract holds), reject unauthenticated `401`, reject-as-staff-with-malformed-body `400`, reject-as-staff-against-an-absent-submission `404`. `intake_submissions` row count, `project_access_links` row count, and `CUSTOMER_SUBMISSION_RECEIVED` activity count were all unchanged before/after — no fixture was created. Successful submit/apply/reject, wrong-purpose/revoked/expired-token paths, the resolution-to-submit race, `IS008` terminal conflict, and the propagated `WD004` path remain **not live-verified — fixture-dependent** (creating a real INTAKE link or a real submission solely for verification was deliberately avoided); these stay covered by the existing unit/integration test suites (`lib/server/intake/__tests__/`, `lib/server/routes/__tests__/intake.test.ts`, the repository test suites) only.

Implementation: `app/api/v2/public/intake-submissions/route.ts`, `app/api/v2/internal/projects/[id]/intake-submissions/{route.ts,[submissionId]/{route,apply/route,reject/route}.ts}`, `lib/server/routes/intake.ts`, `lib/server/intake/{submit-intake-submission,get-intake-submission,list-intake-submissions,apply-intake-submission,reject-intake-submission,validate-submit-intake-input,validate-reject-intake-submission-input,intake-submit-gateway,intake-staff-gateway,intake-types}.ts`, `lib/server/supabase/{intake-submit-repository,intake-staff-repository}.ts`, plus their respective `__tests__` suites.

## Task 028 — Project Design APIs (COMPLETE / FROZEN)

**Status:** **FULL PASS, COMPLETE, FROZEN.** Preflight, contract closure, authoring, independent source review (three patch rounds), and DEV/STAGING safe runtime verification (`rggmsdnjnfmnzxdaxcra`) all complete. No migration was authored or applied — Task 028 is application/API-layer work only, built entirely on the already-frozen `templates`/`template_versions`/`project_design` schema (migrations `0010`/`0011`, Foundation phase). See `docs/API_CONTRACT.md` §13 for the full frozen wire contract; this entry records only the decisions.

**Scope (frozen):** `project_design` get/upsert + template/version catalog reads only — no invitation rendering, no React template implementation, no template catalog seeding, no customer review workflow, no publish workflow, no portal/guests/RSVP, no rate limiting, no project lifecycle mutation. Those remain Task 029+ scope.

**Persistence — existing schema reused, no migration.** `project_design` (migration `0011`) already provided exactly the required shape: one mutable design row per Project (`UNIQUE(project_id)`), pinning an exact immutable `template_versions.id` (not a template family), with `palette_key`/`font_preset_key`/`effect_preset_key`/`section_settings`/`design_settings` validated at the application layer per the migration's own comments. `templates`/`template_versions` (migration `0010`) already provided the catalog with `is_active`/`retired_at` availability flags.

**Direct RLS, never a trusted business action.** No activity type exists for design changes in the frozen Activity Union (`docs/API_CONTRACT.md` §6) — per §3's own rule ("driven by whether this is in the frozen union, not by whether it's a mutation"), `project_design` get/upsert stays on the direct-RLS path. No `service_role`, no RPC, no new DB function anywhere in Task 028.

**`TemplateDesignManifestV1` — a new durable contract.** Before Task 028, `template_versions.manifest` was documented only conceptually (`docs/TEMPLATE_SYSTEM.md` §6, prose word-list, no shape). Task 028 froze the renderer-independent design-config validation subset needed to safely validate a `project_design` write — `schemaVersion`, `palettes`, `fontPresets`, `effectPresets`, `sectionSettingsSchema`, `designSettingsSchema`, with a closed discriminated `ManifestSettingSpec` (`type: "string"|"number"|"boolean"`, optional matching-type `enumValues`). This is explicitly **not** the entire future renderer manifest — extra raw top-level manifest fields remain allowed/ignored Task-029+ extension space. See `docs/TEMPLATE_SYSTEM.md` §6 for the full contract.

**Manifest validation is fail-closed, with a hard ownership boundary.** Every required field of the six-key subset must be an *own* property (`hasOwnProperty`, not `in`) — an inherited value never satisfies a requirement. Section/design schema keys are trim-normalized with duplicate-after-normalization rejected outright (no silent last-write-wins on a colliding key). A malformed manifest is a server-data problem (`500 INTERNAL`, generic message, raw content never echoed); a well-formed client submission that disagrees with an otherwise-valid manifest is a client-input problem (`422 INVARIANT`). No coercion anywhere (a `1`/`0` never satisfies a boolean spec, a numeric string never satisfies a number spec). The same own-property discipline was applied to the PUT body's required/forbidden top-level fields.

**Version pinning and the retired/inactive grandfather rule.** `project_design.template_version_id` pins an exact immutable version, never a template family, for reproducible rendering. A **new or changed** selection targeting a retired version or a version under an inactive template is rejected (`422 INVARIANT`). An **already-selected, unchanged** version may continue receiving config edits even after it becomes retired/inactive — this is not an oversight; `template_versions.retired_at` was always documented (migration `0011`'s own comment, `docs/PHYSICAL_DATABASE_PLAN.md` §2.11) as blocking only *new* selection, never resolution of an already-referenced version.

**Event-type compatibility.** `templates.event_type ≠ projects.event_type` is `422 INVARIANT`, not `400 BAD_REQUEST` — a syntactically valid `templateVersionId` that resolves to an event-type-incompatible template is a business-rule violation on well-formed input, matching `ApiError`'s own `INVARIANT`/`BAD_REQUEST` distinction. This is currently unreachable in practice (V1 has exactly one `event_type` value on both sides) but is deliberate defensive code, not speculative feature work — the same boundary check Task 029 will need regardless.

**Catalog completeness and `selectable`.** `GET /api/v2/internal/templates` returns the complete catalog — active and inactive families, retired and non-retired versions all included, never filtered out — so a Project's historical selection remains displayable even after retirement. `selectable` (`isActive && retiredAt === null`) is computed server-side only, never accepted from a client, and deliberately does not factor in any Project's `event_type` (the catalog route has no Project context; `PUT /design` is the real compatibility authority).

**Raw manifest never exposed.** The catalog DTO carries only the validated `designManifest` subset — never the raw `template_versions.manifest` JSONB, which may carry additional Task-029+ renderer metadata Task 028 has no business exposing.

**Auth/body precedence — the same Task-027-established pattern.** `PUT /design` uses a lazy, uninvoked `readBody` callback: transport-auth parse → `requireStaff` → body read → validation, identical in kind to Task 027 Phase 2's Finding A. A missing/wrong-scheme/expired-token transport failure, or an authenticated-but-non-staff caller, never triggers a body read — confirmed live in DEV/STAGING, not merely structurally (below).

**Result-shape hardening, including query-binding.** Every DB-returned row (Project/Template/TemplateVersion/ProjectDesign/every catalog row) is runtime-validated by explicit type guards before being trusted — never an unguarded cast. Beyond type-shape, each read/write additionally asserts the returned row's identifying column(s) match the id(s) the query was actually scoped by (a type-valid row bound to the wrong project/template/version fails closed just the same as a malformed one). For `.maybeSingle()` reads, only `data === null` is treated as legitimate absence — any other falsy/non-object result (`undefined`, `false`, a non-object) fails closed as an unexpected shape rather than being silently collapsed into "no row." `templates-repository.ts` additionally requires `sort_order`/`version_number` to be true integers (`version_number` further `> 0`, matching migration `0010`'s own `CHECK`), requires both query results to be arrays before mapping, and rejects an orphan template-version row (a `template_id` matching no returned template) rather than silently dropping it.

**Static/security tests remain future-safe.** Frozen Task-028 tests verify only Task-028-owned files/content by name — no global "no migration after N" or "this directory must forever contain nothing else" assertion exists, so a later legitimate task's migration or route addition cannot, by itself, fail a Task-028 test.

**Independent source review:** three patch rounds, all resolved — Patch 1 (Finding A: de-globalized static tests; Finding B: manifest fail-closed own-property/closed-shape/collision hardening; Finding C: PUT own-property semantics; Finding D: repository query-binding checks); Patch 2 (Finding E: `.maybeSingle()` null-vs-falsy semantics). Final authored suite: **12 test files, 301 tests**, all passing; full repository suite **106 files, 2214 tests**.

**Runtime verification (DEV/STAGING, `rggmsdnjnfmnzxdaxcra`):** STAFF session authenticated and resolved active via the real `current_user_role()` RPC. Environment catalog was empty (`templates`/`template_versions`/`project_design` all 0 rows) — no fixtures were created to force positive coverage. Live-confirmed: `GET /templates` 401 (missing auth) / 401 (wrong scheme) / 200 `no-store` (staff, empty catalog); `GET /design` 200 `{data: null}` for a legitimate Project with no design yet, 401 (missing auth), 400 (malformed UUID), 404 (confirmed-absent Project); `PUT /design` auth/body precedence (401/401/400 across missing-auth, wrong-scheme, and active-staff-with-malformed-JSON, each with a confirmed-not-invoked lazy body reader); four structural body-validation negatives (malformed UUID, unknown field, empty-after-trim preset, nested setting value) all 400 before any upsert; a confirmed-absent TemplateVersion against a real Project → 404 (stopping before manifest validation, per the frozen ordering); a confirmed-absent Project → 404. `project_design`/`templates`/`template_versions` row counts were identical before and after — zero mutation, no fixture created, no DELETE cleanup needed. Catalog-content checks (designManifest-only exposure, retired/inactive live behavior, successful upsert, all `422` domain paths) remain **not live-verified — fixture-dependent**, covered instead by the passing unit/repository/route test suites only.

Implementation: `lib/domain/template-design-manifest.ts`; `lib/server/project-design/{project-design-types,project-design-gateway,validate-template-design-manifest,validate-save-project-design-input,validate-design-config-against-manifest,get-project-design,save-project-design}.ts`; `lib/server/templates/{templates-types,templates-gateway,list-templates}.ts`; `lib/server/supabase/{project-design-repository,templates-repository}.ts`; `lib/server/routes/{project-design,templates}.ts`; `app/api/v2/internal/projects/[id]/design/route.ts`; `app/api/v2/internal/templates/route.ts`; plus their respective `__tests__` suites (12 files).

## Draft / Review / Publish

1. Save is not Publish.
2. Review output must be versioned/snapshotted.
3. Customer approval applies to a specific review state/version.
4. Public invitations render a published version/snapshot.
5. Editing mutable draft data must not silently change the published invitation.
6. Republish is explicit.

## Template Product Direction

1. Templates are a core commercial differentiator.
2. V1 should prioritize approximately **3–5 excellent templates** over many mediocre templates.
3. Initial art-direction families:
   - Elegant Editorial;
   - Vietnamese Heritage;
   - Romantic Minimal.
4. Templates must look meaningfully different, not like one layout with recoloring.
5. Public invitation design may be expressive, while internal admin UI should prioritize efficiency and clarity.

## Editor Direction

1. V1 editor is configuration-driven.
2. Do not build Canva-style free-form drag/drop in V1.
3. Staff may select template, curated palette, curated font preset, effects, music, and supported section settings.
4. Template authors retain control over composition and art direction.

## Typography

1. WeddingClick needs a diverse curated font library with multiple visual styles.
2. Production fonts must support Vietnamese correctly.
3. Vietnamese diacritics/uppercase/long names must be tested.
4. Web/commercial licensing must be verified.
5. Invitations should load only the fonts they use, not the complete font catalog.

## Motion / Effects

1. Effects are a core template capability.
2. WeddingClick should support multiple curated motion/effect styles.
3. Shared motion primitives should be reusable, while each template retains unique art direction.
4. Performance and readability take priority over decorative effects.
5. Reduced-motion behavior must be considered.

## Mobile

1. Public invitations are mobile-first.
2. Customer Portal and customer form are mobile-first.
3. Primary test widths include approximately 360, 390, and 430 px.

## Future Extensibility

WeddingClick begins with weddings but the core architecture must support future event types such as:

- birthday;
- baby celebration/thôi nôi;
- anniversary;
- other invitations/events.

Core generic concepts should therefore use names such as `Project`, `EventType`, `Invitation`, `Template`, `Guest`, and `RSVP` rather than forcing the entire platform to be wedding-specific.

Wedding-specific data may live in a wedding-specific detail schema/table.

## V1 Non-Goals

Not required for initial commercial launch:

- online payment gateway;
- subscriptions;
- public self-registration for customers;
- customer self-service design builder;
- Canva-style drag-and-drop editor;
- mobile application;
- Zalo/SMS automation;
- AI-generated invitations;
- marketplace for templates;
- accounting system;
- other event types beyond wedding.

Architecture may leave room for these later, but they must not delay V1.

## Physical Database Plan — Pre-Approved Architecture Decisions (Task 001 in progress)

**Important distinction:** the four items below were approved *before* Task 001's physical planning began and are fixed regardless of how that planning turns out. They are not the same thing as "Task 001 is approved." The full physical schema plan itself, `docs/PHYSICAL_DATABASE_PLAN.md`, is a separate, still-under-external-review deliverable — as of this update it is on Revision 2 after a "REVISION REQUIRED" review of Revision 1, and remains pending review. Do not treat the physical plan document as approved until an external review explicitly says so; treat only the four decisions below as settled.

1. **V2 invitation table naming.** The V1 table `invitations` is untouched and is never renamed. The permanent physical V2 table name is `project_invitations` — this is final, not a placeholder for a later rename back to `invitations`. V1 `invitations`, `weddings`, and `wishes` remain untouched until explicit retirement approval.
2. **Environment strategy.** The currently connected Supabase project is DEV/STAGING (test data only) for V2 development; no local Supabase/Docker requirement for the initial workflow. A separate Production Supabase project is created before real customer launch and receives the same reviewed migrations after staging validation.
3. **Staff authorization.** Supabase Auth remains the authentication provider; `profiles` is the authoritative 1:1 application profile table. Initial staff roles are `ADMIN` and `STAFF` only. Authorization inside RLS policies is centralized in `SECURITY DEFINER` helper functions (`current_user_role()`, `is_admin()`, `is_staff()`) with a safe, schema-qualified `search_path` — never client-supplied role claims.
4. **Token strategy.** Customer access links and personalized guest links use cryptographically secure random tokens, ≥32 raw bytes, URL-safe encoded. Only a SHA-256 hash of the raw token is stored in the database. Raw tokens are never stored or logged. Verification happens server-side; tokens support revocation and rotation. Project IDs and guest display names are never authentication credentials.
