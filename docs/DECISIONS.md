# WeddingClick V2 — Approved Product & Architecture Decisions

**Status:** Source of truth for approved decisions  
**Last updated:** 2026-09-26

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

## Task 029 — Invitation Visual Prototypes (COMPLETE / FROZEN)

**Status:** **COMPLETE, FROZEN.** All three visual directions are **approved** and are the visual source of truth for the production templates that come next: **Elegant Editorial**, **Vietnamese Heritage** (final QA PASS) and **Romantic Minimal** (final QA PASS). The final independent source/architecture review passed. So did the targeted re-review of the Elegant Editorial RSVP personalization MUST-FIX repair.

**Relationship to the Rendering Foundation (important).** `docs/API_CONTRACT.md` §7.2/§8 defines Task 029 as the production *Invitation Rendering Foundation*. What was delivered and frozen here is **internal visual prototypes only**. No Wedding Domain Resolver, `InvitationViewModel` builder, template registry, snapshot payload construction or media reference extraction was built, so **Task 030's hard dependency is not yet satisfied** (see the §7.2 status note). **Task 030 must not start** until that foundation is delivered. No task/roadmap renumbering was performed.

**Scope (frozen):** internal visual prototypes only, at `app/internal/prototypes/invitation/`. The route returns `notFound()` when `NODE_ENV === "production"` and is marked `noindex`. The prototypes use local fictional data/config (`_data/wedding-data.ts`) and cover responsive interaction (360/390/430 px review frames); COMMON/GROOM/BRIDE behavior; guest personalization; optional section toggles; album/lightbox interactions; countdown/calendar; a local-state-only RSVP; a Gift modal; and music control UI/state only (no audio playback).

**Data/security boundary:** no database migration, no Supabase access or mutation, no production API, no `service_role` usage, no backend persistence, and no real financial or customer data. Names, venue and bank details are fictional placeholders.

**Architecture notes for the production-renderer phase.** Current prototype flow: prototype wedding data → shared resolvers/derivations (`_shared/`) → selected visual direction. The shared prototype concerns are COMMON/GROOM/BRIDE resolution, invitation wording/personalization, ceremony/calendar/countdown derivation, section visibility, RSVP state, album assignment, lightbox helpers, the reduced-motion helper and music control state. These are *prototype* helpers, not the production `InvitationViewModel`. They are reference material for the future Rendering Foundation. **Naming/mapping:** the UI label "Elegant Editorial" currently renders `GreenIvoryEditorialPrototype` (`_directions/green-ivory-editorial/`). The legacy `_directions/elegant-editorial/` directory still exists but is not imported and is not the active renderer. It was intentionally not renamed or removed during the freeze.

**Deferred (intentionally not addressed in Task 029):**
- Production architecture: `InvitationViewModel`/renderer/template registry; side-identity comparison by explicit role instead of object identity.
- Shared-helper consolidation: album viewer, lightbox, calendar helpers, `useCountdown` subscribe memoization.
- Content/data: generic guest-wording normalization, cleanup of hardcoded demo copy/location, a fully data-driven Elegant Editorial gallery, and local BRIDE presentation checks for Elegant Editorial.
- Interaction hardening: the clipboard false-positive success path, Elegant Editorial Gift modal interaction, reduced-motion handling of infinite animations, real music/audio playback, and production accessibility hardening.
- Internal review page: review-frame scroll-reveal and overlay behavior, font preloading, and the duplicate guest-chip key edge case.
- Assets/cleanup: unused prototype assets, raw PNG texture optimization, and removal of the legacy `_directions/elegant-editorial/` directory (needs explicit approval).

Implementation: `app/internal/prototypes/invitation/{layout,page}.tsx`, `prototype.module.css`, `_data/`, `_shared/`, `_directions/{green-ivory-editorial,vietnamese-heritage,romantic-minimal,elegant-editorial}/`; assets under `public/prototypes/invitation/{decor,demo}/`.

## Invitation Rendering Foundation — RF-00 Contract Closure (FROZEN)

**Status:** RF-00 = contract closure only, docs only, **FROZEN**. RF-00 does not implement anything. RF-01 has not started. Task 030 has not started.

**Contract recovery (2026-09-26).** The independent RF-00 review blocked two rules: B1, the project-level lunar-date ambiguity rule, and B2, a primary-event fallback that could pair the fixed ceremony title with the wrong occasion. Both are resolved here by Product Owner decision. RF2 now selects the ceremony event by matching occasion type. RF6 now uses manual, event-level lunar text. RF11, RF16 and RF17 are updated to match. The earlier RF6 date-comparison rule is withdrawn.

**Final blocker correction (2026-09-28).** A second independent review blocked two remaining items, both corrected here by Product Owner decision: B1, the conditional legacy lunar-date backfill, is withdrawn, so no automatic backfill exists (RF6, RF-L01 scope); B2, the COMMON ceremony tiers, now preserve §2.8's original COMMON semantics (primary `COMMON` → earliest `COMMON` → earliest in the candidate set) with no primary `GROOM`/`BRIDE` tiers (RF2). No other RF-00 decision is reopened.

**RF1. Tracking identity.** The production scope that `docs/API_CONTRACT.md` §7.2 requires (and that Task 029 did not deliver) is tracked under the implementation-track name **Invitation Rendering Foundation**. Its checkpoints are `RF-00`, `RF-01`, `RF-02`, …. **RF IDs are implementation checkpoints, not roadmap task numbers.** No roadmap task is renumbered or newly numbered. Task 029 (Invitation Visual Prototypes) stays **COMPLETE / FROZEN**. **Task 030 stays blocked** until the completion gate (RF16) is met.

**RF2. Variant event visibility.** The Wedding Domain Resolver filters canonical `project_events` by explicit `side` (`EventSide` = `COMMON | GROOM | BRIDE`, `lib/domain/event-side.ts`):

| Variant | Included `side` values | Excluded |
|---|---|---|
| `GROOM` | `GROOM`, `COMMON` | `BRIDE` |
| `BRIDE` | `BRIDE`, `COMMON` | `GROOM` |
| `COMMON` | `GROOM`, `BRIDE`, `COMMON` | — |

**Event display order.** Visible events are ordered for display by `sort_order ASC`, then `starts_at ASC`, then `id ASC` as a deterministic tie-break. This display order is **not** the "earliest" order used by ceremony selection below; the two orderings are separate and must not be conflated. No event is ever duplicated, including `COMMON` events. Only the resolver owns this filtering and ordering. Templates receive the already-ordered visible events and the already-resolved ceremony event; they never decide which canonical events belong to a variant and never run either ordering or the ceremony-selection algorithm themselves.

**Ceremony event selection (product decision, RF-00 contract recovery).** This replaces §2.8's generic primary-event fallback for rendering purposes (`docs/PHYSICAL_DATABASE_PLAN.md` §2.8 [R21] carries a forward note to this rule). The ceremony event is chosen using both variant visibility and the required occasion type:

| Variant | Required `occasion_type` | Ceremony candidates `C` |
|---|---|---|
| `COMMON` | `THANH_HON` | visible events (all sides) with `occasion_type = 'THANH_HON'` |
| `GROOM` | `THANH_HON` | visible events (`GROOM`, `COMMON`) with `occasion_type = 'THANH_HON'` |
| `BRIDE` | `VU_QUY` | visible events (`BRIDE`, `COMMON`) with `occasion_type = 'VU_QUY'` |

- `RECEPTION` and `CUSTOM` events are **never** ceremony candidates. A `VU_QUY` event is never the ceremony for `COMMON`/`GROOM`. A `THANH_HON` event is never the ceremony for `BRIDE`. An event from an invisible side is never a candidate.
- **Ceremony-selection "earliest" order.** Wherever a tier below says "earliest", or a tier could match more than one row, the order is `starts_at ASC`, then `sort_order ASC`, then `id ASC`, and the first row wins. This is deliberately different from the event display order above. No step depends on JavaScript object identity or input array order.
- **Priority tiers (final, RF-00 blocker correction B2).** Tiers are evaluated in order, only within `C`; the first tier that yields a row wins. These are the only active tiers:
  - `COMMON` (`C` = visible `THANH_HON` events from `GROOM`, `BRIDE` and `COMMON` sides), preserving §2.8's original COMMON semantics:
    1. the `is_primary` event with `side = COMMON`;
    2. otherwise, the earliest event with `side = COMMON`;
    3. otherwise, the earliest event in `C`, regardless of `GROOM`/`BRIDE` side.

    There is **no** "primary `GROOM`" or "primary `BRIDE`" tier for `COMMON`. A primary `GROOM`-side or `BRIDE`-side `THANH_HON` event is only reachable through tier 3, and only as the earliest remaining event.
  - `GROOM` (`C` = visible `THANH_HON` events from `GROOM` and `COMMON` sides):
    1. the `is_primary` event with `side = GROOM`;
    2. otherwise, the `is_primary` event with `side = COMMON`;
    3. otherwise, the earliest event with `side = COMMON`;
    4. otherwise, the earliest event in `C`.
  - `BRIDE` (`C` = visible `VU_QUY` events from `BRIDE` and `COMMON` sides):
    1. the `is_primary` event with `side = BRIDE`;
    2. otherwise, the `is_primary` event with `side = COMMON`;
    3. otherwise, the earliest event with `side = COMMON`;
    4. otherwise, the earliest event in `C`.
- The partial unique index `(project_id, side) WHERE is_primary` means an `is_primary` tier normally matches at most one row. If more than one row ever matches a tier, the resolver still picks deterministically by the ceremony-selection "earliest" order.
- **`is_primary` semantics.** `is_primary` is an *input* to ceremony selection, not a statement that the event *is* the resolved ceremony. A primary event is considered only if it is in `C` (visible to the active variant **and** of the required `occasion_type`) and only in the tier that names its side. A primary event of the wrong occasion type, or from a side the variant cannot see, is ignored for ceremony resolution.
- If `C` is empty, there is no ceremony event and the domain result reports the **BLOCKING** validation issue `REQUIRED_CEREMONY_EVENT_MISSING` (`docs/PRODUCT.md` §10). The resolver never borrows the opposite side's ceremony, never substitutes a `RECEPTION`/`CUSTOM` event, and never changes the ceremony title to hide bad source data.
- No snapshot payload may be built from a result that has a BLOCKING issue.
- The resolved ceremony event is the single source for the ceremony's date, time, weekday, month, year, calendar emphasis, countdown target and lunar line (RF6). An `is_primary` flag on a non-candidate event (for example a primary `RECEPTION`) has no effect on ceremony selection.

**RF3. Ceremony title.** Fixed at the domain/ViewModel layer: `COMMON` → **"Lễ Thành Hôn"**, `GROOM` → **"Lễ Thành Hôn"**, `BRIDE` → **"Lễ Vu Quy"**. Templates may style the title but never change its wording. Canonical per-event `title` values are passed through unchanged. Because ceremony selection (RF2) only accepts an event whose `occasion_type` matches the variant (`THANH_HON` for `COMMON`/`GROOM`, `VU_QUY` for `BRIDE`), the fixed title and the ceremony event's data can never contradict each other.

**RF4. Person order and operational sides.** `GROOM`: primary side = `GROOM`, secondary = `BRIDE`. `BRIDE`: primary = `BRIDE`, secondary = `GROOM`. `COMMON`: display order is groom-first (primary = `GROOM`, secondary = `BRIDE`). This matches the approved Task 029 visual source of truth and the COMMON "Lễ Thành Hôn" title. Both sides stay first-class: this is display order only, never exclusion. `operationalSides` (the sides whose gift/operational data render) is `[GROOM]` for `GROOM`, `[BRIDE]` for `BRIDE`, and `[GROOM, BRIDE]` for `COMMON`.

**RF5. Explicit side identity.** Every person, family, gift and operational-side structure carries an explicit stable side role (`GROOM`/`BRIDE`). Production code compares sides by that role, **never by JavaScript object identity**. The Task 029 prototype's `side === data.bride` style must not be carried into production.

**RF6. Lunar date: manual, per event (Product Owner decision, RF-00 contract recovery).** This replaces the earlier RF-00 draft rule, which compared the civil dates of the project's events to decide whether one project-level lunar string was safe to show. That comparison rule is withdrawn and must not be implemented.
- **No calculation.** WeddingClick never calculates a lunar date. Staff (or a future customer workflow) enter lunar-date display text manually for each ceremony event. No lunar-calendar library, service or dependency is required, and timezone is used only to interpret the event's civil date/time.
- **Canonical home: `project_events.lunar_date_display`.** It is nullable `TEXT`, display text only (not a computed lunar-date object), and belongs to exactly one event row. Vu Quy and Thành Hôn carry independent values, for example `"07/09 Âm lịch"` on a 2026-10-17 Vu Quy and `"08/09 Âm lịch"` on a 2026-10-18 Thành Hôn. The column does not exist yet. It is added by checkpoint RF-L01 (RF17); see `docs/PHYSICAL_DATABASE_PLAN.md` §2.8.
- **Rendering.** The ceremony lunar line comes only from the resolved ceremony event's (RF2) `lunar_date_display`. If it is null or empty, the lunar line is omitted gracefully. That is not a BLOCKING issue. The renderer never infers it from another event, never falls back to `wedding_details.lunar_date_display`, never calculates it, and never compares event dates to guess ownership.
- **Non-ceremony events.** The column is permitted on any event row. Production v1 renderers show lunar text only on the ceremony. `RECEPTION`/`CUSTOM` cards never inherit ceremony lunar text. An event's own lunar text may be shown with that same event only under a future explicit UI contract.
- **Legacy project-level field.** `wedding_details.lunar_date_display` is **LEGACY / DEPRECATED** for the production V2 renderer. The Invitation Rendering Foundation must not read it as a lunar-date source, and it never enters the snapshot payload or `InvitationViewModel`. New V2 event editing and rendering use the event-level field. The column is **not** dropped by RF-00, and it stays readable/writable through the existing Task 022 wedding-details API and Task 027 intake paths. It may be dropped only by a later, explicitly approved cleanup task, after a compatibility audit confirms every consumer has migrated.
- **No automatic backfill (final, RF-00 blocker correction B1).** There is **no** automatic backfill from `wedding_details.lunar_date_display` to `project_events.lunar_date_display`, under any condition. The legacy project-level text never recorded which ceremony/event it belongs to, so its ownership cannot be proven safely. Therefore:
  - when the event-level column is introduced, every existing `project_events` row has `lunar_date_display = NULL`;
  - no migration (RF-L01 or any other) copies the legacy value into one or more events, and no value is guessed;
  - staff manually enter the correct lunar text for each relevant ceremony event through the Project Events workflow (RF-L03);
  - `wedding_details.lunar_date_display` is left untouched and stays LEGACY / DEPRECATED for V2 rendering; the V2 renderer never reads it;
  - NULL is always preferred over an uncertain lunar date.

**RF7. Content with no canonical home.** Customer-authored content is **never** hidden inside `designSettings`.
- **Future schema/content task. Not persisted today, and RF-01+ must not invent storage for it:** dress code; love-story milestones/structured timeline (the canonical free-text `wedding_details.love_story` *does* exist and is used as-is); portrait-specific media roles; image focal points. Production V1 templates must work gracefully without these.
- **Fixed template copy (template-owned and versioned):** section headings; closing/thank-you copy; gift intro copy; default salutation; default generic guest label. This copy is part of the immutable renderer version (RF14), so changing it requires a new renderer/template version.
- **Derived from canonical data:** the invitation body/message comes from `wedding_details.invitation_message`. No separate customer-authored "invitation wording template" may exist in `designSettings`. Templates may wrap canonical text in versioned fixed copy but never invent persisted customer content.

**RF8. `additional_note` is internal and not renderable.** `wedding_details.additional_note` is **INTERNAL / NON-RENDERABLE** by default. It never enters the snapshot payload, the `InvitationViewModel`, or any public, review or portal output. Reclassifying it requires a future explicit product decision. `docs/PRODUCT.md` §6 lists "additional note" only as *potential* optional content, which this closes.

**RF9. Template catalog seeding.**
- RF-01 through RF-05 need **no** database catalog rows and make **no** database contact. Domain, payload, ViewModel and registry tests use typed fixtures.
- For the first real production renderer, the `rendererKey` and manifest are frozen in code and docs first. Only then are catalog rows seeded.
- Seeding mechanism: a reproducible **data-only migration** that inserts only the approved immutable `templates`/`template_versions` catalog rows. It is not a schema migration.
- One-off ADMIN UI/RLS insertion is **not** the canonical environment setup, because DEV/STAGING/production must stay reproducible.
- The seed checkpoint happens only after the first renderer key, version and manifest are final. RF-00 performs no seeding.

**RF10. Staff preview scope.**
- The core foundation does **not** need a new staff preview API for RF-01 through RF-06 to proceed.
- RF-01 to RF-05 are pure and unit-testable.
- RF-06 may use a fixture-driven internal rendering harness for implementation QA.
- A production staff preview route/API is a **separate, later checkpoint**, needed before operational staff preview. It is not Task 030, and no preview API is added in RF-00 or RF-01.
- Any future staff preview uses authenticated STAFF/ADMIN RLS (Path A). **`service_role` is never permitted for staff preview.**

**RF11. Snapshot payload, `payloadSchemaVersion: 1`.** The version marker lives **inside the JSON payload**, so the marker itself needs no column or migration. The event-level `lunarDateDisplay` field does depend on the RF-L01 schema change (RF6, RF17). The payload is JSON-serializable, deterministic, pinned to a renderer version, and safe to persist unchanged into `invitation_versions.payload` later. Top-level semantic shape (exact TypeScript types are fixed in RF-01/RF-02 using the existing domain type names):

```text
{
  payloadSchemaVersion: 1,
  project:   { code },                                   // projects.project_code
  template:  { templateVersionId, rendererKey },
  variant:   InvitationVariant,
  people:    { groom, bride, primarySide, secondarySide },   // each person carries side: GROOM|BRIDE
  families:  { groom, bride },                           // each carries side; father/mother/address
  ceremony:  { eventId, occasionType, title, startsAt, timezone, lunarDateDisplay? },
             // eventId = RF2 resolved ceremony event; all fields except title are derived copies of that entry
  events:    [ ...variant-visible events, RF2 order, each with id/side/occasionType/title/
               startsAt/timezone/venueName?/address?/mapUrl?/description?/sortOrder/isPrimary/
               lunarDateDisplay? ],
  operationalSides: EventSide[] (GROOM|BRIDE, RF4),
  content:   { invitationMessage?, loveStory? },
  gift:      { groom?, bride? },                         // field set only: docs/PHYSICAL_DATABASE_PLAN.md §2.7 [R20];
             // side omission / meaningful content: RF-02 clarification S7/S8
  media:     { coverMediaId?, galleryMediaIds[], audioMediaId?,
               qr: { groomMediaId?, brideMediaId?, commonMediaId? } },
  sections:  { invitationMessage, loveStory, gallery, music, gift },
             // booleans = canonical content availability only (see "RF-02 Snapshot Sections Contract Clarification")
  design:    { paletteKey, fontPresetKey, effectPresetKey, sectionSettings, designSettings }
}
```

Payload rules:
- **A.** Side identity is explicit (RF5).
- **B.** Dates are stored as the canonical instant (`starts_at`) plus IANA `timezone`. All display parts (date, weekday, month, year, time, calendar, countdown) are derived deterministically from those two values and are never stored separately.
- **C.** Media is stored as stable `project_media` ids only. **Never** signed URLs, expiring URLs, or storage paths meant for display. Media with several candidates is ordered `sort_order ASC, id ASC`: cover and audio take the first `COVER`/`AUDIO` row, and the gallery takes all `GALLERY` rows. The referenced id set is the input to `invitation_version_media` (media reference extraction).
- **D.** **No guest data:** no guest display name, no token-derived identity, no personalization state.
- **E.** **No RSVP state:** no form state, submission result, or party-size response.
- **F.** **No `additional_note`** (RF8).
- **G.** Missing optional values are omitted or represented exactly as the TypeScript contract says. Demo or placeholder values are never invented.
- **H.** `gift` includes only the variant's `operationalSides`: `GROOM` → groom only, `BRIDE` → bride only, `COMMON` → both. A side with no meaningful canonical gift content is omitted: none of its three bank text fields is non-blank after trim and it has no canonical QR media reference (RF-02 clarification S7/S8).
- **I.** Event entries use the existing `ProjectEventRecord` field names (`lib/server/project-events/project-events-types.ts`), extended in RF-L03 with `lunarDateDisplay`. Each entry's `isPrimary` is the canonical `is_primary` value passed through; it does not mean "is the ceremony". The ceremony is identified only by `ceremony.eventId`.
- **J.** The event entry is the source of truth for event lunar text. `ceremony.lunarDateDisplay` is a derived convenience copy of the referenced entry's value, not a second independently authored value, and the builder guarantees the two are equal. The payload never contains `wedding_details.lunar_date_display` (RF6).

**RF12. Payload vs `InvitationViewModel`.** The **snapshot payload** is the stable canonical rendering snapshot, and it is what gets persisted. The **`InvitationViewModel`** is a render-time object derived from payload + guest overlay + resolved media URLs + runtime capabilities. It may contain normalized primary/secondary ordering, explicit side roles, precomputed deterministic display fields (the ceremony lunar line is taken directly from the resolved ceremony event's `lunarDateDisplay`, never calculated), the guest display-name overlay, resolved media URLs, renderer-friendly section state, and RSVP callback/capability metadata. **The ViewModel is never persisted as the snapshot.**

> **Forward note (RF-03 clarification, 2026-09-28):** the list above is the *eventual* scope of the render-time object across RF-03 → RF-05, not RF-03's output. The RF-03 ViewModel is defined only by "RF-03 InvitationViewModel / Media Resolution Contract Clarification" below: it carries no RSVP callback/capability metadata, no generic runtime-capabilities object, no formatted date/weekday/countdown fields, and no effective section visibility.

**RF13. Media boundary.**
- **URLs.** The payload stores media references only. Signed or private display URLs are resolved per request, while the ViewModel is built, by an **injected media resolver**. Templates never query Supabase, sign URLs, or know storage internals. They receive usable display URLs from the ViewModel. The resolver boundary, its result states, and unavailable-media behavior are defined by the RF-03 clarification below (M1–M13).
- **`QR_COMMON`.** COMMON bank/gift data is never fabricated. Groom and bride gift data comes from the canonical per-side `wedding_details` fields, including `groom_bank_qr_media_id`/`bride_bank_qr_media_id`. `qr.commonMediaId` is filled only through a defined canonical reference. None exists today (`wedding_details` has no common-QR column), and the builder must not infer one from `project_media` rows by `media_type` alone, so it is **absent** in payload V1. The COMMON gift UI uses the existing groom/bride sides, never an invented third account.
- **Dimensions.** `project_media` width/height may be null. The foundation never assumes dimensions exist. Orientation-sensitive logic uses a deterministic neutral fallback: no crash, no fabricated dimensions. Orientation metadata enrichment is a later enhancement.

**RF14. Fonts and renderer-code immutability.**
- **Fonts.** Approving a prototype visually does **not** certify its font imports for production. RF-06 either maps the design onto approved production Font Library entries that closely preserve the approved direction, or stops for an explicit font-library decision before any unapproved font enters a production renderer. RF-00 does not expand the Font Library.
- **Renderer code.** A versioned renderer directory (e.g. `templates/wedding/<family>/v1/`) is **immutable once that version is certified or released**. Visual or behavioral changes, including changes to fixed template copy (RF7), go into `v2/` or another new version. A static registry/regression test that enforces known renderer keys may be added in RF-04+. RF-00 adds no enforcement code.

**RF15. Shared client capability boundaries.**
- **RSVP.** The prototype's three attendance options are **not** the persistence contract. Persisted attendance stays `RsvpAttendanceStatus` (`ATTENDING | NOT_ATTENDING`), with party size per `docs/PHYSICAL_DATABASE_PLAN.md` §2.20 (`ATTENDING` 1–20, `NOT_ATTENDING` 0). No `MAYBE` status is added. The RSVP UI does not own persistence: the renderer receives a submit capability/callback. Previews and harnesses never fake a successful persisted RSVP. Actual persistence is still Task 033.
- **Music.** `AUDIO` media is the canonical input. With no audio, no music control is shown. A fake "playing" state without real playback is not acceptable for a certified template. Real shared playback is required before any template that claims music support is certified, but it does not block RF-01 to RF-04.
- **Clipboard.** Success is shown only after the browser copy operation has actually succeeded. A failure is never swallowed and then presented as success. The shared production capability must fix the prototype's known false-positive path.

**RF16. Foundation completion gate (Task 030 blocker).** The foundation is **not** complete just because RF-01 types exist. Before Task 030 may begin, all of the following must be delivered:
1. production domain types;
2. an explicit-side Wedding Domain Resolver;
3. deterministic variant/event resolution, including occasion-matched ceremony selection and the BLOCKING `REQUIRED_CEREMONY_EVENT_MISSING` result (RF2);
4. the `payloadSchemaVersion: 1` contract;
5. a snapshot payload builder;
6. media-reference extraction;
7. an `InvitationViewModel` builder;
8. an injected media URL boundary;
9. a code-side renderer registry;
10. fail-closed renderer lookup (an unknown `rendererKey`, an unsupported `payloadSchemaVersion` or an unsupported variant is an error, never a fallback to another renderer);
11. manifest/renderer compatibility validation;
12. a shared renderer boundary;
13. an RSVP UI contract boundary;
14. shared clipboard behavior that reports success only after actual success;
15. unit tests for `COMMON`/`GROOM`/`BRIDE`;
16. at least **one** production renderer integration that proves the architecture;
17. canonical event-level manual lunar-date support: RF-L01 migration authored and independently reviewed, RF-L02 applied and runtime-verified, and RF-L03 Project Events domain/API integration delivered (RF6, RF17);
18. the Wedding Domain Resolver, payload builder and `InvitationViewModel` read lunar text only from the resolved ceremony event's `lunarDateDisplay`;
19. no production V2 renderer path reads `wedding_details.lunar_date_display`.

The legacy `wedding_details.lunar_date_display` column does **not** need to be physically dropped for this gate.

The first proving renderer is **Elegant Editorial v1**. This matches `docs/ROADMAP.md` Week 3's "architecture proving template". Vietnamese Heritage and Romantic Minimal do **not** block this gate: no authoritative doc requires all three before Task 030, and ROADMAP places them in Week 5. They follow RF-06 as separate, controlled checkpoints. Template certification (`docs/TEMPLATE_SYSTEM.md` §25) is still a separate, stricter gate before any template becomes active.

**RF17. Checkpoint plan** (recorded, not implemented):

Revised by the RF-00 contract recovery. The corrected design **does** require a database schema migration before the complete foundation can be integrated with canonical data. The lunar schema/API prerequisites are separate `RF-L` checkpoints and come before renderer-domain work.

| Checkpoint | Scope |
|---|---|
| RF-00 | Contract closure (docs only) |
| RF-L01 | Event-level lunar-date schema: migration authoring + static review only, **no database apply** |
| RF-L02 | Apply the RF-L01 migration and verify it at runtime, in DEV/STAGING, following the existing migration workflow, only after the independent RF-L01 review has passed |
| RF-L03 | Project Events domain/API integration: add the event lunar field to the canonical read/write paths, with tests |
| RF-01 | Domain types + pure Wedding Domain Resolver |
| RF-02 | Snapshot payload builder + media reference extraction |
| RF-03 | `InvitationViewModel` builder + injected media resolver boundary |
| RF-04 | Renderer registry + fail-closed lookup + manifest compatibility |
| RF-05 | Shared renderer boundary + minimum shared client capabilities |
| RF-06 | Elegant Editorial v1: first production renderer integration |

No RF-07 is a mandatory foundation requirement. Staff preview (RF10), catalog seeding (RF9), and the Vietnamese Heritage/Romantic Minimal integrations are separate follow-up checkpoints. RF IDs, including `RF-L` IDs, remain checkpoint IDs and never renumber roadmap tasks.

**Order.** RF-L01 → RF-L02 → RF-L03 → RF-01 → … → RF-06. RF-01 domain event types must mirror the extended `ProjectEventRecord` delivered by RF-L03. RF-01 through RF-05 remain pure TypeScript with typed fixtures and make no database contact (RF9).

**RF-L01 scope, from the current write path.** `project_events` has no direct authenticated writes (migration `0022` revoked them). Create and update go only through the `SECURITY DEFINER` business actions `public.create_project_event(...)` / `public.update_project_event(...)`; delete is `public.delete_project_event(uuid, uuid)`. The RF-L01 migration must therefore:
- add nullable `project_events.lunar_date_display TEXT`;
- redefine `create_project_event` and `update_project_event` to accept, write and return the new column;
- include the new column in `update_project_event`'s no-op comparison, so a lunar-only edit counts as a real change and is logged as `CANONICAL_DATA_APPLIED`;
- re-apply the existing `REVOKE`/`GRANT EXECUTE` pattern exactly, keeping `authenticated` only;
- perform **no** lunar-data backfill: existing rows remain `NULL`, and `wedding_details.lunar_date_display` is left untouched (RF6).

Changing a function's parameter list or `RETURNS TABLE` shape cannot be done in place with `CREATE OR REPLACE`. The migration must replace the functions without leaving the old overload callable. `delete_project_event` is unaffected. RF-00 writes no SQL.

**RF-L03 scope, from the current code.**
- `ProjectEventRecord` and `ProjectEventInput` in `lib/server/project-events/project-events-types.ts`.
- `validate-project-event-input.ts`: nullable display text, following the existing optional-text validation convention.
- `project-events-gateway.ts` and `lib/server/supabase/project-events-repository.ts`: the `PROJECT_EVENT_COLUMNS` select and the RPC parameter mapping.
- Create/update/list services and `lib/server/routes/project-events.ts`.
- Staff routes `app/api/v2/internal/projects/[id]/events/route.ts` and `.../events/[eventId]/route.ts`.
- Their `__tests__` suites.

Create/update stay full-resource operations, so `lunarDateDisplay` becomes a required-present (nullable) input field. The path stays Path A (staff auth/RLS plus trusted business action). **No `service_role`, no new public endpoint, and no Task 028 Project Design API change.**

**Intake boundary.** Task 027 intake applies to `wedding_details` only; migration `0026` explicitly touches no `project_events`. Intake therefore keeps capturing the legacy project-level `lunarDateDisplay` unchanged, and that value is never copied automatically to events after RF-L01. Staff enter per-event lunar text through the Project Events API. Adding event or lunar input to intake would be a separate, future scope decision, and any such input must follow the canonical event contract (RF6).

**Frozen-table-shape clarification.** `docs/API_CONTRACT.md` §9 and `docs/PHYSICAL_DATABASE_PLAN.md` §16a describe post-foundation feature migrations as adding functions without changing any frozen table shape. RF-L01 is the one explicitly approved exception, based on the Product Owner decision in RF6: a single additive, nullable, non-destructive column on `project_events`. It does not reopen any other frozen table shape, and it is recorded in §16a when it ships.

## Invitation Rendering Foundation — RF-02 Snapshot Sections Contract Clarification (FROZEN)

**Status:** docs only, **FROZEN** by Product Owner / Architecture decision (2026-09-28). RF-01 is frozen at `5ee6bd1` ("feat: add wedding domain resolver"). RF-02 authoring was blocked because RF11 showed `sections: { ... }` without defined keys or semantics. This section closes that gap. It completes the RF11 placeholder and replaces it; it does not reopen any other RF-00/RF-01 decision.

**S1. Exact `sections` shape (payload v1).**

```text
sections: {
  invitationMessage: boolean,
  loveStory: boolean,
  gallery: boolean,
  music: boolean,
  gift: boolean
}
```

This is the complete v1 set. No other key is added: not ceremony, events, families, countdown, calendar, directions, dressCode, portraitStory, structured love-story milestones, RSVP, or per-side gift booleans.

**S2. Meaning: canonical content availability.** Each boolean records only whether the canonical content that optional section needs is available in the payload, after variant filtering. It does **not** mean final renderer visibility, manifest capability, template support, the result of a staff toggle, or a section rendering decision.

**S3. `invitationMessage`.** `true` only when `payload.content.invitationMessage` is a non-null string whose `trim()` is non-empty. Otherwise `false`.

**S4. `loveStory`.** `true` only when `payload.content.loveStory` is a non-null string whose `trim()` is non-empty. Otherwise `false`.

**S5. `gallery`.** `true` when `payload.media.galleryMediaIds.length > 0`. Otherwise `false`.

**S6. `music`.** `true` when `payload.media.audioMediaId` is present. Otherwise `false`.

**S7. `gift`.** `true` when at least one side in `resolution.operationalSides` (RF4) has meaningful canonical gift content. Otherwise `false`. A side has meaningful gift content when either:
- at least one of its canonical persisted gift/bank text fields (`<side>_bank_name`, `<side>_bank_account_name`, `<side>_bank_account_number`, `docs/PHYSICAL_DATABASE_PLAN.md` §2.7 [R20]) is non-null and non-blank after `trim()`; or
- it has its canonical QR media reference (`<side>_bank_qr_media_id`).

Gift/QR data from a non-operational side never counts. No COMMON gift owner exists or is created.

**S8. Gift side filtering.** `payload.gift` follows `operationalSides`: `COMMON` may contain `groom` and `bride`, `GROOM` may contain `groom` only, `BRIDE` may contain `bride` only. A side object is omitted when that side has no meaningful canonical gift content (S7). Opposite-side gift data is never exposed in a single-side variant, and no common gift account is created. It follows that `sections.gift` is `true` exactly when `payload.gift` contains at least one side object.

**S9. QR ownership and filtering.** `payload.media.qr` also follows `operationalSides`:
- `COMMON`: may include the canonical groom QR (`groomMediaId`) and the canonical bride QR (`brideMediaId`).
- `GROOM`: may include `groomMediaId` only; `brideMediaId` must be absent.
- `BRIDE`: may include `brideMediaId` only; `groomMediaId` must be absent.
- `commonMediaId` is **absent** in payload v1, unless a future explicit canonical persisted common-QR pointer is introduced (RF13). A `project_media` row with `media_type = 'QR_COMMON'` is not enough to establish ownership. Common-QR ownership is never inferred or fabricated.

**S10. `design.sectionSettings` boundary.** `design.sectionSettings` is copied into the payload unchanged, per the existing Task 028 JSON contract (`docs/API_CONTRACT.md` §13, `docs/TEMPLATE_SYSTEM.md` §6). RF-02 **must not** apply `sectionSettings` to the `sections` booleans. So `sections` = canonical content availability, and `design.sectionSettings` = persisted design/staff configuration. The final effective renderer section visibility is **not** decided in RF-02. It is resolved later, only once the renderer/manifest capability boundary exists (RF-03+/RF-04). RF-03 itself does not compute it; effective visibility is RF-04 (RF-03 clarification V6).

**S11. Manifest capability boundary.** RF-02 does not depend on the unfrozen conceptual manifest `sectionCapabilities` (`docs/TEMPLATE_SYSTEM.md` §6) or any equivalent renderer-manifest section-support vocabulary. Manifest/renderer compatibility stays later foundation work (RF-04). RF-02 must be buildable without the RF-04 registry/manifest implementation.

**S12. RF-02 builder BLOCKING issue codes.** These are builder/pre-snapshot validation issues:

| Code | Emitted when |
|---|---|
| `WEDDING_DETAILS_MISSING` | the canonical `wedding_details` row is absent |
| `GROOM_NAME_MISSING` | `wedding_details` exists and `groomName` is null or its `trim()` is empty |
| `BRIDE_NAME_MISSING` | `wedding_details` exists and `brideName` is null or its `trim()` is empty |

- If the canonical `wedding_details` row is absent, the builder-owned source/name validation stage returns exactly `[WEDDING_DETAILS_MISSING]`. It does **not** also emit `GROOM_NAME_MISSING` or `BRIDE_NAME_MISSING`: there is no row to evaluate. The builder never synthesizes an empty record, never infers that both names are missing, and never runs name validators against fake null fields. This does not prevent unrelated upstream/system invariant failures from surfacing outside the normal business-result path.
- `GROOM_NAME_MISSING` and `BRIDE_NAME_MISSING` are evaluated only when `weddingDetails != null`.
- A whitespace-only name counts as missing.
- If both names are missing, the issues are emitted in this deterministic order: 1. `GROOM_NAME_MISSING`, 2. `BRIDE_NAME_MISSING`.
- The builder never synthesizes replacement names and never modifies stored values.
- No snapshot payload is produced when any BLOCKING issue exists (RF2).

**S13. RF-01 issue preservation.** RF-02 preserves RF-01 BLOCKING issues such as `REQUIRED_CEREMONY_EVENT_MISSING`. If `resolveWeddingDomain` returns `BLOCKED`, RF-02 returns `BLOCKED` and produces no snapshot payload. RF-02 never replaces the resolver's issue with a different code.
RF-01 remains the owner of resolver issue semantics. RF-02 never replaces a resolver issue, translates it into a builder issue, silently discards it, or changes its relative order among the resolver-returned issues. This applies to `REQUIRED_CEREMONY_EVENT_MISSING` and to any future RF-01 resolver issue.

**S13a. RF-02 validation flow and issue aggregation.** RF-02 validates in this exact order:

1. **Source presence.** If `weddingDetails` is absent, return `BLOCKED` with `[WEDDING_DETAILS_MISSING]`. No fake `WeddingDetailsRecord` is created. `resolveWeddingDomain` is not called, because its required canonical `WeddingDetailsRecord` input does not exist. Normal snapshot construction stops.
2. **When `weddingDetails` exists.** Evaluate the builder-owned name issues in fixed order (`GROOM_NAME_MISSING`, then `BRIDE_NAME_MISSING`, each only if applicable). Also call `resolveWeddingDomain(...)` with the real canonical `weddingDetails` and events. The resolver is called even when a name is missing.
3. **Aggregate.** The final RF-02 issue list is: A. the builder-owned name issues in their fixed order, then B. the RF-01 resolver issues in exactly the order `resolveWeddingDomain` returned them. Example with all three conditions: `[GROOM_NAME_MISSING, BRIDE_NAME_MISSING, REQUIRED_CEREMONY_EVENT_MISSING]`.
4. **Payload gate.** If the combined list contains any BLOCKING issue, RF-02 status is `BLOCKED`, no payload is produced, and snapshot construction does not continue. Only zero blocking issues may produce a `SUCCESS` payload.

This pipeline order is the entire RF-02 v1 ordering rule. There are no numeric priorities, severity or alphabetic sorting, global issue registry, cross-check deduplication policy, or new issue codes.

**S14. Payload version.** All of the above belongs to `payloadSchemaVersion: 1`. It does not create payload v2. It completes the previously placeholder `sections` contract before any persisted Review/Publish snapshot exists. No migration is required.

## Invitation Rendering Foundation — RF-03 InvitationViewModel / Media Resolution Contract Clarification (FROZEN)

**Status:** docs only, **FROZEN** by Product Owner / Architecture decision (2026-09-28). RF-01 is frozen at `5ee6bd1`, the RF-02 clarification at `9b93b9c`, and the RF-02 implementation at `f2f9ea2`. RF-03 authoring stopped before any code because the frozen docs did not say what happens when a Snapshot media id cannot be resolved to a runtime URL. This section closes that gap and fixes the RF-03 scope. Where RF12/RF13 or `docs/TEMPLATE_SYSTEM.md` §3 / `docs/ARCHITECTURE.md` §8.1 describe the render-time object more broadly, this section governs what RF-03 builds. It does not reopen any RF-00, RF-01 or RF-02 decision. No RF-03 code exists yet. **Task 030 stays blocked** (RF16).

### Architecture

**A1. Two production boundaries.** RF17's "`InvitationViewModel` builder + injected media resolver boundary" is two separate boundaries, not one monolithic async builder:

```text
Layer A — media resolution boundary (async)
  in:  SnapshotPayloadV1 media references + injected MediaResolver
  out: complete set of typed per-media resolution results (M5)

Layer B — pure InvitationViewModel builder (sync)
  in:  SnapshotPayloadV1 + optional authorized GuestOverlay + complete resolution set from Layer A
  out: InvitationViewModel
```

- Layer A may call the injected resolver. It contains no concrete Supabase/storage implementation.
- Layer B is pure, synchronous TypeScript. It never calls Supabase, signs URLs, fetches, queries a database, calls storage, reads environment variables, or uses browser APIs.

**A2. Concrete adapter ownership.** RF-03 defines only the `MediaResolver` interface/contract. The concrete adapter that talks to Supabase Storage, creates signed URLs and handles storage credentials/environment is **not** part of RF-03. It belongs to later integration work. Templates never sign URLs. The Snapshot never stores resolved URLs (RF11 C). ViewModel URLs are runtime-only.

### Media resolution

**M1. Resolver input and order.** Resolution is driven only by the media ids the Snapshot references, as extracted by the frozen RF-02 extractor (`extractSnapshotMediaRefs`): cover → gallery (payload order) → audio → groom QR → bride QR, first-reference deduplication. Layer A never discovers media by `media_type`, `project_media` scans, storage paths or mutable Project state. Each unique id is resolved **once** per resolution operation. When several ViewModel roles reference the same id, they reuse the same result; the same id is never signed separately per role. The exact interface signature is fixed in the RF-03 implementation within these rules.

**M2. Result states.** Each per-media result is exactly one of two normal states:

| State | Carries |
|---|---|
| `RESOLVED` | `mediaId`; `url` (non-empty runtime rendering URL); `width` (number or null); `height` (number or null) |
| `UNAVAILABLE` | `mediaId` only; no URL is fabricated |

RF-03 v1 has no unavailable-reason taxonomy. A result never exposes storage paths, bucket names, signing metadata, credentials, or internal adapter error objects. Exact TypeScript discriminant names follow repository conventions; the two semantic states are frozen.

**M3. Expected per-media failure → `UNAVAILABLE`.** When an individual item cannot currently produce a usable URL (it cannot be found/resolved, signing cannot produce a usable URL for it, or the adapter determines it is unavailable for rendering), the result is `UNAVAILABLE`. Such a failure never fabricates a URL, never silently disappears, never blocks the whole ViewModel, and is never represented as fake image/audio data.

**M4. Unexpected failure → exception.** A genuinely unexpected infrastructure or programming failure may throw and propagate as a request-level system failure. RF-03 core must not convert every unexpected exception into `UNAVAILABLE`. Concrete adapters return `UNAVAILABLE` for expected media-level failures and reserve thrown exceptions for unexpected ones. No larger error taxonomy is defined in RF-03.

**M5. Complete resolution set.** Before Layer B runs, Layer A produces exactly one result for every unique media id the Snapshot references (M1). Layer B therefore always receives a complete set. A referenced id with **no entry** in the supplied set is a builder/integration **invariant violation**, surfaced as an exception (M4). It is **not** `UNAVAILABLE`, and Layer B never treats a missing entry as unavailability.

**M6. Media slots stay observable.** A media reference in the Snapshot remains observable in the ViewModel even when its URL is unavailable. Every referenced slot/item carries its runtime state (`RESOLVED` with `mediaId`/`url`/`width`/`height`, or `UNAVAILABLE` with `mediaId` and no URL). A referenced item is never dropped because resolution failed. This is the RF-03 meaning of "missing/broken media fails gracefully" (`docs/TESTING.md` §14). The renderer can always distinguish **not referenced** from **referenced but unavailable**.

**M7. Cover.** If the Snapshot has `media.coverMediaId` and its result is `UNAVAILABLE`, ViewModel construction still succeeds, the cover slot is present as `UNAVAILABLE`, no fake URL/image is created, and no other Project media is substituted. If the Snapshot has no `coverMediaId`, the ViewModel has no cover slot (per its optional-field contract). "No Snapshot cover" and "referenced cover currently unavailable" are distinct states.

**M8. Gallery.** The ViewModel gallery has exactly one item per `media.galleryMediaIds` entry, in the same order. An `UNAVAILABLE` item keeps its position and `mediaId`; it is not removed, reordered or replaced. Gallery order and cardinality come from the Snapshot, never from resolver success.

**M9. Audio.** If the Snapshot has `media.audioMediaId` and its result is `UNAVAILABLE`, ViewModel construction succeeds, the audio slot is present as `UNAVAILABLE`, and there is no fake audio URL, no fake playing state, and no substitute `AUDIO` media. With no `audioMediaId` there is no audio slot.

**M10. Groom/bride QR.** If the Snapshot references `media.qr.groomMediaId` or `media.qr.brideMediaId` and the result is `UNAVAILABLE`, ViewModel construction succeeds and that QR slot is present as `UNAVAILABLE`. No QR is fabricated, the opposite side's QR is never substituted, and no `QR_COMMON` fallback exists (RF13, S9). Bank/gift text stays available from Snapshot `gift` data, and Snapshot `gift.<side>.bankQrMediaId` is unchanged. How the renderer visibly communicates an unavailable QR is later work.

**M11. QR single reference.** `media.qr.<side>MediaId` is the canonical Snapshot reference for QR resolution. By RF-02 construction, `gift.<side>.bankQrMediaId` holds the same stable id. RF-03 never resolves the two independently: one media id → one result, and every ViewModel QR/gift representation reuses it. No media-type inference, no `QR_COMMON`.

**M12. No media issue vocabulary.** RF-03 has no normal builder issue codes for expected unavailable media (for example `MEDIA_RESOLUTION_FAILED`, `COVER_MISSING`, `GALLERY_ITEM_MISSING`, `AUDIO_MISSING`, `QR_MISSING`). Unavailable media is represented directly in the typed ViewModel slots. It is not a Snapshot validation failure and never makes ViewModel construction `BLOCKED`. Unexpected system/invariant failures remain exceptions outside this normal state (M4, M5).

**M13. Dimensions.** `width`/`height` may be null (RF13). Null dimensions do not make media `UNAVAILABLE`: a `RESOLVED` item may have a URL with `width = null` and `height = null`. RF-03 never fabricates dimensions. Any neutral, deterministic orientation/layout fallback belongs only where a later renderer/shared-presentation contract needs it.

### ViewModel scope

**V1. Guest overlay.** The RF-03 `GuestOverlay` is runtime-only personalization with exactly one field: `displayName`. Its optional/null semantics follow the existing guest contract: the overlay is absent when no personalized guest has been authorized (non-personalized invitation); when present, `displayName` is the authorized guest's free-form `guests.display_name` (NOT NULL, 1–200 characters, `docs/PHYSICAL_DATABASE_PLAN.md` §2.19), passed through as given. RF-03 does not resolve guest identity, never accepts `?guest=` or any display name as identity, and only receives an already-authorized overlay. Guest data never enters `SnapshotPayloadV1` (RF11 D). No other guest field is added in RF-03.

**V2. RSVP → RF-05.** RF-03 contains no RSVP capability placeholder: no `canRsvp`, `submitRsvp`, callbacks, endpoint, mutable RSVP state, or runtime RSVP status. Canonical statuses remain `ATTENDING | NOT_ATTENDING` (RF15). The interactive RSVP capability/UI boundary belongs to RF-05, and RF-03 does not anticipate its shape.

**V3. No generic runtime capabilities.** RF12's "may carry runtime capabilities" does not create an RF-03 field. RF-03 adds no generic capabilities object and no empty placeholders. Capabilities are introduced only by the checkpoint that owns them.

**V4. Temporal data.** RF-03 carries the canonical temporal data already in the Snapshot (`startsAt`, `timezone`, `lunarDateDisplay`). It does not derive or freeze weekday text, locale-formatted date labels, humanized time strings, countdown strings, "days until" values, or calendar download data. No admin-only date formatter may be reused for production invitation rendering. Shared production presentation/date derivation is frozen in a later shared-presentation/client-capability checkpoint before renderer certification. This is not an RF-03 blocker.

**V5. No implicit current time.** ViewModel construction never calls `Date.now()`, `new Date()` for the current time, `performance.now()`, or otherwise depends on the current runtime time. Countdown/current-time behavior later uses an explicit capability/input boundary.

**V6. `sections` and effective visibility.** Snapshot `sections` keeps its RF-02 meaning: canonical content availability (S2). RF-03 may expose/copy it but never combines it with `design.sectionSettings`, manifest `sectionCapabilities`, or renderer support to compute effective visibility. Effective section visibility is RF-04 work. An `UNAVAILABLE` media result never rewrites `sections.gallery`, `sections.music` or `sections.gift`: canonical content availability and runtime media availability are separate. Rendering behavior when content is available but its media is `UNAVAILABLE` is later renderer/shared-presentation work.

**V7. Design.** RF-03 consumes Snapshot `design` only. It never reloads the mutable `ProjectDesignRecord`, applies manifest capabilities, or turns `sectionSettings` into effective visibility.

**V8. Template identity.** RF-03 may carry `templateVersionId` and `rendererKey` from the Snapshot. It never queries the template catalog, selects a latest version, falls back, resolves a renderer component, or inspects a registry. Fail-closed renderer lookup/compatibility is RF-04.

**V9. Snapshot-only canonical source.** The ViewModel derives rendering content only from `SnapshotPayloadV1`. It is never reconstructed from `WeddingDetailsRecord`, `ProjectEventRecord`, `ProjectMediaRecord` or `ProjectDesignRecord`. The only runtime inputs are the ones RF-03 owns: the authorized guest `displayName` (V1) and the typed media results (M2).

**V10. No runtime-input leaks.** The ViewModel explicitly projects only the allowed fields from the guest overlay and the media results. Unknown adapter/runtime fields never leak into it, for example `storagePath`, `bucket`, `signedAt`, `expiresAt` (unless later explicitly frozen), raw provider errors, credential metadata, or internal resolver metadata.

**V11. Determinism.** For the same Snapshot, guest overlay and complete resolution set, Layer B produces the same semantic result: no randomness, no implicit current time, no locale-dependent sorting, no object-identity decisions.

**V12. No renderer fallback UI here.** This clarification freezes data/runtime states only. Placeholder image design, "image unavailable" labels, QR warning copy, gallery skeletons and audio error UI are later renderer/shared-presentation decisions.

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
