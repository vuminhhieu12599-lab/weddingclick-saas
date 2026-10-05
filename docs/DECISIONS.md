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

**Ceremony-card presentation (Product Owner ruling, 2026-10-01).** The Snapshot's canonical `events` stay complete and in the display order above; no canonical event is deleted, filtered out of persistence or reordered for presentation. The runtime RF-03 ViewModel additionally derives `ceremonyCards` (never persisted, `lib/invitation-rendering/ceremony-cards.ts`): exactly one card per operational side (RF4), always **GROOM before BRIDE** (COMMON: GROOM → BRIDE; GROOM / BRIDE: that side only), regardless of dates or staff `sort_order` between the sides. A side's card is its own rite only, from that side's single-side rule: GROOM-side `THANH_HON`, BRIDE-side `VU_QUY`. No `COMMON`-side event, other rite or other occasion is ever substituted; a side without a matching event has no card. Several same-side candidates resolve by the display order above (`sort_order` → `starts_at` → `id`). Each card carries the rite-derived RF3 business title ("Lễ Thành Hôn" / "Lễ Vu Quy") as its `title`; a template may instead show its own fixed, rite-derived card copy (Elegant Editorial v1, Product Owner ruling: "Tiệc mừng lễ thành hôn" / "Tiệc mừng lễ vu quy"). The event's own `title` is never changed and stays available to other surfaces (venue text such as "Tư gia nhà trai" stays in `venueName`). Templates render `ceremonyCards` as given and still never filter or re-sort `events` themselves. The main ceremony resolution (RF2 tiers, `ceremony`) is unchanged.

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
- **Future schema/content task. Not persisted today, and RF-01+ must not invent storage for it:** love-story milestones (the canonical free-text `wedding_details.love_story` *does* exist and is used as-is); image focal points. Production V1 templates must work gracefully without these.
- **Portrait media roles (Product Owner amendment, 2026-10-01).** Portrait-specific media roles were in the list above; the Product Owner has now explicitly approved exactly two: `PORTRAIT_GROOM` and `PORTRAIT_BRIDE` (`project_media.media_type`, migration 0028). Both are optional, and a Project without either stays fully valid. "At most one per side" is the *effective* rule, exactly like `COVER`: several rows of one role may exist, and the Snapshot uses only the first in RF11 rule C order (`sort_order`, then `id`). There is deliberately no uniqueness constraint, because a portrait referenced by a retained snapshot can be neither deleted nor re-pointed (0013b), so replacing it must stay possible by adding a new row. `COVER`/`GALLERY` are never reused as portraits, and no demo or substitute portrait is ever a production fallback. The payload carries them as an optional, additive `media.portrait: { groomMediaId?, brideMediaId? }` (ids only, never URLs) inside `payloadSchemaVersion: 1`: it is absent in payloads built before it and whenever no portrait exists, so every earlier v1 payload stays valid. Its ids are appended after the bride QR in the RF-02 media-ref extraction order and resolve through the existing injected `MediaResolver`; the RF-03 ViewModel exposes `media.portrait.{groom,bride}` slots (absent side = not referenced; present side = `RESOLVED` or `UNAVAILABLE`). No new `sections` key is added (RF-02 S1).
- **Timeline (Product Owner amendment, 2026-10-01).** The Task029 Timeline / Lịch trình is an approved structured section. It is **not** derived from `project_events` (run-of-show steps such as "Đón khách" are not events) and nothing from events, gallery captions or other text is reused. Canonical home: the `project_timeline_items` table (migration 0029; `docs/PHYSICAL_DATABASE_PLAN.md` §2.9a): zero, one or many rows per Project with `time_of_day` (local wall-clock `TIME(0)`, minute precision, no date or timezone arithmetic), a plain-text `label` (non-blank, ≤ 200 characters) and a staff-authoritative `sort_order`. The Snapshot carries the ordered steps as `content.timeline: [{ id, time: "HH:mm", label }]` (order `sort_order`, then `id`; never by time) and `sections.timeline` = at least one step. Both are additive inside `payloadSchemaVersion: 1`: the builder always sets them, and a v1 payload built before them (no `content.timeline` / `sections.timeline`) stays valid and reads as `[]` / `false`. The ViewModel copies the steps unchanged and templates render them as given (no parsing, sorting or rebuilding). `timeline` is the additive sixth section key (supersedes the "five keys" wording of RF-02 S1, RF-04 R7/R8/R10/R17 and RF-06-0 P16/P19/P21): it flows through `sectionCapabilities`, `design.sectionSettings` (`timeline: false` hides it) and R9 effective visibility like the other five, so the section shows only when the renderer is capable, staff have not turned it off **and** at least one step exists. Elegant Editorial v1 renders it in the Task029 rhythm Events → ✦ → Timeline → tight ✦ → Countdown.
- **Dress Code (Product Owner amendment, 2026-10-01).** The Task029 Dress Code is an approved structured section and configurable project data; it is never inferred from theme/palette settings or CSS, and the renderer never invents it. Canonical home (migration 0030; `docs/PHYSICAL_DATABASE_PLAN.md` §2.9b): at most one `project_dress_codes` row per Project (optional plain-text `description`, non-blank when present, ≤ 1000 characters) and its `project_dress_code_swatches` (zero, one or many; each an explicit canonical lowercase `#rrggbb` colour, so no CSS keyword, function, `url()`, `var()` or gradient can be stored; staff order `sort_order`, then `id`). Task029's four colours are fixture data only, never production defaults. The Snapshot carries `content.dressCode: { description, swatches: [{ id, color }] } | null` and `sections.dressCode` = a description or at least one swatch. Both are additive inside `payloadSchemaVersion: 1` (always set by the builder); a v1 payload built before them stays valid and reads as `null` / `false`. The ViewModel copies them and re-checks every colour against `#rrggbb`, because it becomes an inline CSS value. `dressCode` is the additive seventh section key (same supersession of the "five keys" wording as the Timeline amendment above): it shows only when the renderer is capable, staff have not set `dressCode: false` and useful content exists, so no empty band ever renders. Elegant Editorial v1 renders it after RSVP / Gift and before Gallery.
- **Photo Story / Love Story photo / Gallery count (Product Owner amendment, 2026-10-01).** Two more `project_media.media_type` roles (migration 0031), both image roles under the existing upload/optimization pipeline:
  - `PHOTO_STORY`: the Task029 editorial photo cluster as its own semantic role, independent from `GALLERY` (never fed by or feeding it, nor COVER/PORTRAIT_*). Many ordered rows (`sort_order`, then `id`); the Snapshot keeps all of them as optional, additive `media.photoStoryMediaIds` (absent when none). `photoStory` is an additive section key: content availability = at least one reference; it shows only when the renderer is capable, staff have not set `photoStory: false` and at least one photo resolves. Elegant Editorial v1 restores the approved Task029 Photo Story between the Countdown and the Love Story and displays up to its five-photo composition capacity (first five RESOLVED in order; fewer render only whole Task029 rows; none renders nothing). Extra rows stay valid project media for other/later renderers. *Amended 2026-10-03 (Product Owner APPROVED, "Photo Story two-column correction"): the Task029 mixed cluster (full-width anchor, pair, 58/42 offset row) is replaced in v1 by a uniform two-column grid of 4:5 portrait tiles in the same order. An odd last photo keeps the one-column width, centred. Capacity (first five RESOLVED), ordering and PHOTO_STORY semantics are unchanged.* *Further amended 2026-10-03 (Product Owner APPROVED, "Adaptive Photo Story"):*
- *Rows follow each photo's real orientation (`lib/invitation-rendering/media-orientation.ts`, width/height ratio < 0.9 portrait, > 1.1 landscape, otherwise square).*
- *A landscape photo is its own full-width 3:2 row with a centred focus.*
- *Two consecutive portrait/square photos share a row of 4:5 tiles.*
- *A lone portrait/square photo (before a landscape one, or last) is centred at one-column width.*
- *Rows are built in canonical order and never reordered.*
- *Rows without dimensions (legacy uploads) fall back to portrait. Dimensions are now captured at upload (`API_CONTRACT.md` §3.2).*
- *The Gallery is unaffected.*
  - `LOVE_STORY_PHOTO`: one optional effective photo like `COVER` (first by `sort_order`, then `id`; no uniqueness constraint, so a published one stays replaceable), carried as optional, additive `media.loveStoryPhotoMediaId`. It belongs to the existing `loveStory` section (no new key): with a RESOLVED photo the Task029 full-bleed photo-led Love Story renders; absent or UNAVAILABLE keeps the moss band. Never COVER/GALLERY.
  - Both refs are ids only, appended after the portraits in the RF-02 extraction order, resolved through the injected `MediaResolver`; the ViewModel exposes `media.photoStory` (ordered slots, `[]` for older payloads) and `media.loveStoryPhoto`. Everything stays inside `payloadSchemaVersion: 1`; older v1 payloads remain valid.
  - **Gallery count:** the album renders every GALLERY image the project has, in canonical order. Task029's ten photos are fixture data and its 10-slot arrangement is a repeating layout cycle (images 1–10, 11–20, …, with the existing lone-tail rule), never a business maximum.
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
- RF-01 to RF-05 are pure and unit-testable. For RF-05 this means a deterministic, unit-testable core that may import React types only and never uses browser globals, current time, network or database (RF-05 clarification K3).
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
               qr: { groomMediaId?, brideMediaId?, commonMediaId? },
               portrait?: { groomMediaId?, brideMediaId? } },   // optional, additive (RF7 PO amendment, 2026-10-01)
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
>
> **Forward note (RF-05 clarification, 2026-09-28):** RF-05 does not add these to the ViewModel either. The renderer receives the unchanged ViewModel plus two sibling props: RF-04 effective `sections` and the closed RF-05 `capabilities` object (RSVP, clipboard, music, clock). Formatted date/weekday/time, countdown and the calendar month grid are RF-05 shared pure derivations, not ViewModel fields (RF-05 clarification K6, K14, K27–K34).

**RF13. Media boundary.**
- **URLs.** The payload stores media references only. Signed or private display URLs are resolved per request, while the ViewModel is built, by an **injected media resolver**. Templates never query Supabase, sign URLs, or know storage internals. They receive usable display URLs from the ViewModel. The resolver boundary, its result states, and unavailable-media behavior are defined by the RF-03 clarification below (M1–M13).
- **`QR_COMMON`.** COMMON bank/gift data is never fabricated. Groom and bride gift data comes from the canonical per-side `wedding_details` fields, including `groom_bank_qr_media_id`/`bride_bank_qr_media_id`. `qr.commonMediaId` is filled only through a defined canonical reference. None exists today (`wedding_details` has no common-QR column), and the builder must not infer one from `project_media` rows by `media_type` alone, so it is **absent** in payload V1. The COMMON gift UI uses the existing groom/bride sides, never an invented third account.
- **Dimensions.** `project_media` width/height may be null. The foundation never assumes dimensions exist. Orientation-sensitive logic uses a deterministic neutral fallback: no crash, no fabricated dimensions. Orientation metadata enrichment is a later enhancement.

**RF14. Fonts and renderer-code immutability.**
- **Fonts.** Approving a prototype visually does **not** certify its font imports for production. RF-06 either maps the design onto approved production Font Library entries that closely preserve the approved direction, or stops for an explicit font-library decision before any unapproved font enters a production renderer. RF-00 does not expand the Font Library.
- **Renderer code.** A versioned renderer directory (e.g. `templates/wedding/<family>/v1/`) is **immutable once that version is certified or released**. Visual or behavioral changes, including changes to fixed template copy (RF7), go into `v2/` or another new version. A static registry/regression test that enforces known renderer keys may be added in RF-04+; because RF-04 registers no production key (RF-04 clarification R15), such enforcement can only cover real keys from RF-06 onward. RF-00 adds no enforcement code.

**RF15. Shared client capability boundaries.** (Refined, not reopened, by the RF-05 clarification K15–K25.)
- **RSVP.** The prototype's three attendance options are **not** the persistence contract. Persisted attendance stays `RsvpAttendanceStatus` (`ATTENDING | NOT_ATTENDING`), with party size per `docs/PHYSICAL_DATABASE_PLAN.md` §2.20 (`ATTENDING` 1–20, `NOT_ATTENDING` 0). No `MAYBE` status is added. The RSVP UI does not own persistence: the renderer receives a submit capability/callback. Previews and harnesses never fake a successful persisted RSVP. Actual persistence is still Task 033.
- **RSVP completion (Product Owner amendment, 2026-10-01).** Supersedes the two-status and personalized-null-name rules wherever they appear below (RF15 RSVP bullet, K15/K16, P7 RSVP row, P31, the RSVP baseline line). Attendance is now `ATTENDING | MAYBE | NOT_ATTENDING` (migration 0032; `MAYBE` visible copy "Sẽ cố gắng tham dự", shown between "Sẽ tham dự" and "Tiếc quá, không tham dự được"). Party size: `ATTENDING` and `MAYBE` 1–20, `NOT_ATTENDING` exactly 0. Every new submission, personalized or not, carries a typed response name (`guestName`: required, trimmed, non-blank, ≤ 200 code points), stored in the existing `rsvps.guest_display_name_snapshot` (no new column). The typed name is display data only and is **never** guest identity, which comes solely from the secure guest context (`guest_id`); personalized invitations no longer hide the name input (*amended by the Micro-Checkpoint 10 Product Owner ruling:* the input always starts empty, personalized or not, and is never pre-filled from guest data). The form order is name → attendance → party size (ATTENDING / MAYBE) → message (≤ 500 code points, unchanged) → submit. Rows stored before 0032 (`ATTENDING` / `NOT_ATTENDING`, personalized rows with a guest-display-name copy or NULL) remain valid and keep their meaning. No RSVP count/summary code exists yet; any future summary keeps the three categories separate.
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
| RF-04 | Renderer registry + fail-closed lookup + manifest compatibility (compatibility-manifest registry + effective section visibility only; exact scope in the RF-04 clarification) |
| RF-05 | Shared renderer boundary + minimum shared client capabilities |
| RF-06 | Elegant Editorial v1: first production renderer integration |

No RF-07 is a mandatory foundation requirement. Staff preview (RF10), catalog seeding (RF9), and the Vietnamese Heritage/Romantic Minimal integrations are separate follow-up checkpoints. RF IDs, including `RF-L` IDs, remain checkpoint IDs and never renumber roadmap tasks.

**Order.** RF-L01 → RF-L02 → RF-L03 → RF-01 → … → RF-06. RF-01 domain event types must mirror the extended `ProjectEventRecord` delivered by RF-L03. RF-01 through RF-05 remain pure TypeScript with typed fixtures and make no database contact (RF9). RF-01 through RF-04 are framework-free; RF-05 may import React types only to describe the renderer component contract, with a core that uses no browser globals or current time (RF-05 clarification K3).

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

This is the complete v1 set. No other key is added: not ceremony, events, families, countdown, calendar, directions, dressCode, portraitStory, structured love-story milestones, RSVP, or per-side gift booleans. *Amended 2026-10-01:* the optional, additive `timeline`, `dressCode` and `photoStory` keys (RF7 "Timeline" / "Dress Code" / "Photo Story" Product Owner amendments) are the approved additions.

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

**S10. `design.sectionSettings` boundary.** `design.sectionSettings` is copied into the payload unchanged, per the existing Task 028 JSON contract (`docs/API_CONTRACT.md` §13, `docs/TEMPLATE_SYSTEM.md` §6). RF-02 **must not** apply `sectionSettings` to the `sections` booleans. So `sections` = canonical content availability, and `design.sectionSettings` = persisted design/staff configuration. The final effective renderer section visibility is **not** decided in RF-02. It is resolved later, only once the renderer/manifest capability boundary exists. RF-03 itself does not compute it; effective visibility is owned exactly by RF-04 (RF-03 clarification V6; formula in the RF-04 clarification R9).

**S11. Manifest capability boundary.** RF-02 does not depend on the unfrozen conceptual manifest `sectionCapabilities` (`docs/TEMPLATE_SYSTEM.md` §6) or any equivalent renderer-manifest section-support vocabulary. Manifest/renderer compatibility stays later foundation work (RF-04). RF-02 must be buildable without the RF-04 registry/manifest implementation. (RF-04 `sectionCapabilities` has since been frozen by the RF-04 clarification R7; RF-02 still does not depend on it.)

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

## Invitation Rendering Foundation — RF-04 Registry / Compatibility / Effective Visibility Contract Clarification (FROZEN)

**Status:** docs only, **FROZEN** by Product Owner / Architecture decision (2026-09-28). RF-01 is frozen at `5ee6bd1`, the RF-02 implementation at `f2f9ea2`, the RF-03 clarification at `435bb3d`, and the RF-03 implementation at `260a03f`. RF-04 contract discovery stopped before any code because the docs left the manifest shape, `sectionCapabilities`, effective visibility and the failure model unfrozen. This section closes those gaps and governs what RF-04 builds. Where RF16/RF17, `docs/TEMPLATE_SYSTEM.md` §5–§6 or `docs/ARCHITECTURE.md` §10 describe the registry or manifest more broadly, those passages describe the **eventual** production registry/manifest; this section governs RF-04. It does not reopen any RF-00 through RF-03 decision and does not change the RF-03 `InvitationViewModel`. No RF-04 code exists yet. **Task 030 stays blocked** (RF16).

### Ownership

**R1. RF-04 owns exactly:**
- A. the code-owned renderer **compatibility** manifest contract (R3);
- B. the compatibility-manifest registry machinery (R12–R14);
- C. exact, fail-closed `rendererKey` lookup (R4);
- D. compatibility checks for `payloadSchemaVersion` (R5) and `InvitationVariant` (R6);
- E. effective section visibility (R8–R10);
- F. a pure RF-04 selection/context result layered on top of `SnapshotPayloadV1` and `InvitationViewModel` (R16–R17).

**R2. RF-04 does not own:** a concrete renderer component/function interface; any renderer implementation; the Elegant Editorial production renderer; a Supabase/storage resolver; signing; Review/Publish orchestration; persistence; RSVP; clipboard; browser audio playback; countdown/current-time capability; shared date formatting. **RF-05** owns the shared renderer/client-capability interface boundary. **RF-06** owns the first real production renderer integration.

### Compatibility manifest

**R3. `RendererCompatibilityManifestV1`.** RF-04 freezes a minimal, code-owned compatibility manifest (exact TypeScript name follows repository conventions) with **exactly** these four fields and no others:

```text
RendererCompatibilityManifestV1 {
  rendererKey:                    string                          // R4
  supportedPayloadSchemaVersions: readonly PayloadSchemaVersion[] // R5
  supportedVariants:              readonly InvitationVariant[]    // R6
  sectionCapabilities:            SectionBooleanRecord            // R7
}
```

This is **not** the full production renderer manifest. RF-04 does not freeze display name, template code, marketing name, renderer component, React component type, `supportedFeatures`, layout metadata, fonts, assets, catalog copy, design-setting schemas or renderer implementation. RF-06 may freeze a larger full production manifest that incorporates/extends this contract; the four RF-04 fields must stay consistent in it. RF-04 assigns no future full-manifest fields.

**R4. `rendererKey`.** Non-empty, stable, exact, versioned, code-owned. Lookup is exact string equality: no prefix matching, normalization, display-name lookup, "latest" lookup, version fallback, or default renderer. RF-04 freezes **no** concrete production `rendererKey`; `wedding.elegant-editorial.v1` and similar strings in older docs are conceptual examples only.

**R5. `supportedPayloadSchemaVersions`.** An explicit, non-empty, unique, readonly list whose element type is the supported Snapshot payload-schema-version type. Today `SnapshotPayloadV1.payloadSchemaVersion === 1`, so `1` is the only valid value. Compatibility is explicit membership only: no minimum/maximum, numeric range, `>=`/`<=`, or "latest". A future payload schema version expands the version type and may require new renderer manifests/versions.

**R6. `supportedVariants`.** An explicit, non-empty, unique, readonly list of canonical `InvitationVariant` values (`COMMON`, `GROOM`, `BRIDE`). Compatibility is exact membership. No variant fallback or substitution.

**R7. `sectionCapabilities`.** Supersedes the earlier "still unfrozen" status (`docs/TEMPLATE_SYSTEM.md` §6, RF-02 clarification S11) for RF-04. An exact, closed boolean record over the five Snapshot Sections v1 keys:

```text
{ invitationMessage: boolean, loveStory: boolean, gallery: boolean, music: boolean, gift: boolean }
```

Every key is required; no extra keys. RSVP, countdown, map, calendar, guest personalization, clipboard, playback, directions, families and ceremony are **not** Snapshot Sections v1 visibility keys and do not belong in RF-04 `sectionCapabilities`; they belong to later capability/presentation contracts if needed. The conceptual capability list in `docs/TEMPLATE_SYSTEM.md` §6 ("Example capabilities") describes the eventual full manifest, not RF-04.

### Effective section visibility

**R8. Key vocabulary.** The RF-04 effective-section keys are exactly the Snapshot Sections v1 keys: `invitationMessage`, `loveStory`, `gallery`, `music`, `gift`. RF-04 never creates effective visibility for arbitrary manifest or `sectionSettings` keys. *Amended 2026-10-01:* `timeline`, `dressCode` and `photoStory` are additive keys (RF7 "Timeline" / "Dress Code" / "Photo Story" Product Owner amendments).

**R9. Formula (frozen).** For each of the five keys `k`:

```text
effectiveSections[k] =
     viewModel.sections[k]                              // canonical content availability (RF-02 S2)
  && compatibilityManifest.sectionCapabilities[k]       // renderer capability
  && sectionSettingAllows(k)

sectionSettingAllows(k) =
  TRUE   when viewModel.design.sectionSettings has no own property k
  TRUE   when viewModel.design.sectionSettings[k] === true
  FALSE  when viewModel.design.sectionSettings[k] === false
```

Equivalently `effective = contentAvailable && rendererCapable && setting !== false`, applied only after the reserved-setting value validation in R10.
- **Setting `true` never creates content.** If `viewModel.sections[k] === false`, the effective value is `false` regardless of setting or capability.
- **Renderer capability is a hard limit.** If `sectionCapabilities[k] === false`, the effective value is `false` regardless of content or setting. Staff settings cannot enable a capability the renderer does not have.
- **Staff disable.** `sectionSettings[k] === false` for a reserved key makes the effective value `false`.
- **Absent setting** means "not explicitly disabled", never `false`; the effective value is then content availability AND renderer capability.

**R10. Setting values.**
- **Reserved keys.** The five R8 keys are boolean visibility settings. If a reserved key is present in `design.sectionSettings` with a non-boolean runtime value, RF-04 fails closed with a typed `RendererSelectionError` (R20). No truthy/falsy coercion, no ignoring the key, no interpreting it as enabled. (Task 028's generic setting storage may still hold string/number/boolean values for unrelated renderer settings.)
- **Unknown keys.** A `sectionSettings` key outside the five reserved keys creates no effective section, does not affect `effectiveSections`, is ignored by the RF-04 visibility computation, and is **not** rejected by RF-04. Later renderer-specific design logic may still use it.

**R11. Media `UNAVAILABLE` has no visibility effect.** RF-03 runtime media states (`RESOLVED`/`UNAVAILABLE`) do not enter the formula. Example: `viewModel.sections.gallery === true`, `sectionCapabilities.gallery === true`, gallery setting absent, every gallery item `UNAVAILABLE` → `effectiveSections.gallery === true`. The renderer/shared presentation layer renders that state honestly later (RF-03 V6, V12); RF-04 never silently hides it.

### Registry

**R12. Contents.** The RF-04 registry maps `rendererKey` → `RendererCompatibilityManifestV1` only. It contains no renderer implementation: no `React.ComponentType`, `render()`, renderer function or JSX. The eventual production registry that maps keys to implementations **and** manifests (`docs/TEMPLATE_SYSTEM.md` §5, `docs/ARCHITECTURE.md` §10) is a later renderer-binding layer that extends/composes this compatibility-manifest registry.

**R13. Construction.** RF-04 defines reusable registry machinery/factory. Creation rejects a duplicate `rendererKey` with a typed invariant failure: never last-write-wins, never silent first-write-wins. Lookup is deterministic exact-key lookup. The registry never depends on filesystem scanning, module discovery, the database, `template_versions`, environment, or insertion-order fallback.

**R14. Manifest invariants.** Registry construction (and selection over any registry) treats these as compatibility-manifest invariants: `rendererKey` non-empty; `supportedPayloadSchemaVersions` non-empty and unique; `supportedVariants` non-empty and unique; every `sectionCapabilities` key present; no unknown `sectionCapabilities` keys; every capability value boolean. Even where static types make a state impossible, runtime-mutated/test-fixture data that violates these fails closed with a typed invariant error. Malformed runtime registry data is never accepted silently.

**R15. Production registry state.** RF-04 registers **no** real production renderer and freezes no production key (including `wedding.elegant-editorial.v1`). Registry machinery is proven with typed test fixtures only. RF-04 creates no production registry constant populated with placeholder/fake entries, and adds no shared empty registry value merely for appearance.

### Selection

**R16. Inputs and `payloadSchemaVersion` source.** RF-04 does **not** add `payloadSchemaVersion` (or any other field) to the frozen RF-03 `InvitationViewModel`. The selection boundary receives both, semantically:

```text
selectRendererCompatibility({ snapshot, viewModel, registry })
```

(exact naming follows repository conventions). `SnapshotPayloadV1` is the only source of `payloadSchemaVersion`; the ViewModel is the renderer-facing content/runtime media source (`sections`, `design.sectionSettings`).

**R17. Output.** A separate RF-04 context type, semantically:

```text
RendererSelectionContextV1 {
  rendererKey             // exact selected key
  compatibilityManifest   // the selected RF-04 code-owned manifest
  effectiveSections       // exactly { invitationMessage, loveStory, gallery, music, gift }: boolean
}
```

`effectiveSections` has exactly the five R8 keys, no renderer-specific extra keys. RF-04 never mutates the ViewModel or adds fields to it. This context is where "renderer-friendly section state" (RF12) lives for the foundation; it is compatibility context only, not a callable renderer interface (RF-05).

**R18. Snapshot/ViewModel consistency.** Snapshot and ViewModel must agree on `rendererKey`, `variant` and `templateVersionId`. On disagreement RF-04 throws a typed invariant/selection error. It never reconciles, silently prefers one side, or rebuilds the ViewModel.

**R19. Fail-fast order (frozen).**
1. validate Snapshot/ViewModel consistency invariants (R18);
2. exact `rendererKey` lookup (R4);
3. `payloadSchemaVersion` compatibility (R5);
4. variant compatibility (R6);
5. reserved `sectionSettings` value validation (R10);
6. compute `effectiveSections` (R9);
7. return `RendererSelectionContextV1` (R17).

The first failure throws. RF-04 never aggregates multiple compatibility errors; aggregation belongs to later Review/Publish work.

### Failure model

**R20. Typed exceptions.** RF-04 fails closed by throwing typed exceptions. Normal compatibility/selection failures use a dedicated error family (semantically `RendererSelectionError`) with deterministic, machine-distinguishable codes for at least:
- renderer key not registered (no fallback);
- payload schema version unsupported (no coercion, migration or range matching);
- variant unsupported (no substitution);
- invalid reserved section-setting value (no coercion).

Malformed registry/manifest state (R13, R14) and Snapshot/ViewModel inconsistency (R18) may use a separate typed invariant error, consistent with the existing `WeddingDomainInvariantError` / `SnapshotPayloadInvariantError` / `InvitationViewModelInvariantError` pattern. Exact identifiers follow repository conventions.

**R21. Review/Publish mapping is later.** RF-04 throws typed errors only. It returns no Review/Publish issue arrays, invents no Review/Publish blocking issue codes, and persists nothing. `docs/PRODUCT.md` "Blocking errors" (e.g. "unresolved template renderer/version") is a later orchestration responsibility: Review/Publish integration will catch and map RF-04 typed errors into its blocking validation result.

### Boundaries

**R22. Code manifest vs DB manifest.** The RF-04 code-owned compatibility manifest drives runtime compatibility selection, lives in code, and needs no database lookup. `template_versions.manifest` stays immutable catalog/template-version JSON metadata; Task 028 keeps using its frozen design subset (`TemplateDesignManifestV1`). RF-04 never fetches the DB manifest, compares it to the code manifest, merges them, or treats the DB manifest as runtime renderer behavior.

**R23. Catalog seeding unchanged (RF9).** RF-04 performs no catalog seed, no migration and no database contact. RF-06 freezes the first real key and full manifest; a later explicit data-only catalog-seeding checkpoint follows.

**R24. RF-06 / Elegant Editorial.** RF-06 owns freezing the first real production `rendererKey`, freezing its full production manifest, binding its implementation, and the Elegant Editorial v1 production integration. RF-06 must not infer the key from the UI label "Elegant Editorial", the `GreenIvoryEditorialPrototype` name, or the legacy `_directions/elegant-editorial` path.

**R25. Task 029 boundary.** RF-04 never imports from `app/internal/prototypes` (including `GreenIvoryEditorialPrototype` and legacy elegant-editorial directions). Task 029 remains visual source truth only.

**R26. Immutability and determinism.** Selection never mutates the Snapshot, ViewModel, registry, compatibility manifest, `sectionSettings` or `sectionCapabilities`; its output has safe ownership consistent with repository conventions. The same Snapshot, ViewModel and registry always yield the same semantic selection context: no randomness, current time, locale-dependent sorting, object-identity selection or insertion-order fallback.

## Invitation Rendering Foundation — RF-05 Shared Renderer Boundary / Minimum Shared Client Capabilities Contract Clarification (FROZEN)

**Status:** docs only, **FROZEN** by Product Owner / Architecture decision (2026-09-28). RF-01 is frozen at `5ee6bd1`, the RF-02 implementation at `f2f9ea2`, the RF-03 implementation at `260a03f`, the RF-04 clarification at `c44000a`, and the RF-04 implementation at `fe8b400`. RF-05 contract discovery stopped (BLOCKED) before any code because the docs did not define the callable renderer interface, implementation binding, server/client boundary, renderer input shape, capability shape, RSVP/clipboard/music semantics, clock/countdown ownership, shared date/calendar ownership, or a failure taxonomy. This section closes those gaps and governs what RF-05 builds. Where RF10, RF12, RF15, RF16, RF17, the RF-03 clarification (V2–V5), the RF-04 clarification (R2, R12), `docs/TEMPLATE_SYSTEM.md` §3/§5/§8/§17/§18/§20/§20a or `docs/ARCHITECTURE.md` §8.1/§10/§12 describe capabilities, renderer binding or date derivation more broadly or conceptually, this section governs. It does not reopen any RF-00 through RF-04 decision, does not change the RF-03 `InvitationViewModel`, and does not change the RF-04 `RendererSelectionContextV1`. No RF-05 code exists yet. **RF-06 has not started. Task 030 stays blocked** (RF16).

### Ownership

**K1. RF-05 owns exactly:**
- A. the shared React renderer interface **contract** (K4);
- B. the generic renderer implementation-binding registry **contract and machinery** (K9–K13);
- C. the renderer-facing props contract (K6–K8);
- D. the closed minimum renderer capability contract (K14);
- E. the RSVP renderer/action capability contract, interface only, no persistence (K15–K20);
- F. the clipboard capability contract (K21–K22);
- G. the music capability contract (K23–K25);
- H. the explicit clock capability contract (K26);
- I. shared **pure** countdown derivation semantics (K27–K29);
- J. shared **pure** date/time/weekday presentation semantics (K30–K32);
- K. shared **pure** calendar-month-grid derivation semantics (K33–K34);
- L. the RF-05 binding/capability failure taxonomy (K12, K36).

**K2. RF-05 does not own:** any real production renderer implementation; any real production `rendererKey`; the full production renderer manifest; Elegant Editorial v1; catalog seeding; the RSVP endpoint/persistence (Task 033 / later integration); raw guest/access tokens; Supabase/`service_role`; the media URL signing/storage resolver; Review/Publish orchestration; public route/access-link resolution; the staff-preview route; ICS export; Google Calendar integration; browser-global adapters wired directly to `navigator`/`window`/`Audio`/timers; the application-level React error boundary. **RF-06** owns the first real renderer integration. Later application/integration code owns concrete browser and server adapters.

### Core purity

**K3. "Pure / unit-testable" interpretation.** This supersedes, for RF-05, the wording "RF-01 to RF-05 are pure and unit-testable" (RF10) and "RF-01 through RF-05 remain pure TypeScript" (RF17 "Order"):
- RF-01 through RF-04 remain framework-free pure TypeScript.
- The RF-05 **core** remains deterministic and unit-testable without a database, network or browser globals.
- RF-05 may import React **types only**, to describe the renderer component contract (K4). It renders nothing itself.
- RF-05 core never calls `window`, `document`, `navigator`, `Audio`/`HTMLAudioElement`, `Date.now()` (or `new Date()` for the current time, or `performance.now()`), timers, `fetch`, Supabase, or `service_role`.
- Browser/server behavior is supplied later through injected capabilities/adapters (K35).
- No RF-05 core module requires `"use client"` merely to define the contract.

This supersedes any wording that would require RF-05 itself to perform browser side effects.

### Renderer contract

**K4. Callable renderer = component type.** The shared renderer contract is a React component type, semantically:

```text
InvitationRendererComponentV1 = React.ComponentType<InvitationRendererPropsV1>
```

RF-05 does **not** define the renderer as a `render()` function, an `(input) => ReactNode` function, a server-component-only API, or a JSX-returning registry function. RF-05 freezes the component **type**; the first real component is RF-06.

**K5. Client-compatible renderer boundary.**
- Production invitation renderer components must be **client-compatible**, because their props may contain action capabilities/callbacks (K14).
- They may still be server-pre-rendered through Next's normal Client Component behavior. RF-05 does not require the entire public page to be fully client-rendered.
- Browser-dependent capability objects are created on the **client side** of the React boundary.
- Non-serializable callback capabilities are never passed across a Server Component → Client Component serialization boundary.
- Canonical data construction, Snapshot/ViewModel creation (RF-02/RF-03) and RF-04 compatibility selection stay framework-neutral and may run before that client boundary.
- Renderer implementations never call a database or `service_role` directly.

**K6. Renderer props — exact shape.** Semantically:

```text
InvitationRendererPropsV1 {
  viewModel      // the frozen RF-03 InvitationViewModel, unchanged
  sections       // the frozen RF-04 effective sections (RendererEffectiveSections, the
                 //   effectiveSections value of RendererSelectionContextV1):
                 //   exactly { invitationMessage, loveStory, gallery, music, gift }: boolean
  capabilities   // InvitationRendererCapabilitiesV1 (K14)
}
```

Exactly these three semantic inputs. The renderer never receives `SnapshotPayloadV1`, `RendererSelectionContextV1` as a whole, the compatibility manifest, the RF-04 registry, the binding registry, the DB `template_versions.manifest`, `rendererKey` as a separate behavioral prop, or any raw guest token/access token.

**K7. Effective sections are authoritative.** Props `sections` are the **only** authoritative section-visibility result. Renderer implementations never re-derive visibility from `viewModel.sections`, `viewModel.design.sectionSettings`, the compatibility manifest, or media availability (RF-04 R11 still applies: an `UNAVAILABLE` media result does not hide a section). A renderer may use non-visibility design settings for renderer-specific presentation, but `viewModel.design.sectionSettings` never overrides props `sections`.

**K8. The compatibility manifest is not renderer input.** It is used only by compatibility/binding infrastructure. Renderer implementations never inspect `supportedPayloadSchemaVersions`, `supportedVariants` or `sectionCapabilities`; those checks already happened upstream (RF-04).

### Implementation-binding registry

**K9. Binding entry.** Semantically:

```text
RendererBindingEntryV1 {
  compatibilityManifest   // the frozen RF-04 RendererCompatibilityManifestV1
  component               // InvitationRendererComponentV1
}
```

There is **no** separate external `rendererKey` field. The binding key is derived **only** from `compatibilityManifest.rendererKey`, so "lookup key ≠ `manifest.rendererKey`" cannot be represented by a valid RF-05 binding entry.

**K10. Composition with RF-04.** The RF-05 binding registry **composes** the RF-04 compatibility registry; it does not duplicate or replace it. The RF-05 factory:
- accepts an explicit list of binding entries;
- projects/validates each entry's `compatibilityManifest` with the frozen RF-04 manifest rules (R3, R14);
- creates and owns the RF-04 `RendererCompatibilityRegistry` built from exactly those manifests (used for RF-04 selection, R16–R19);
- owns an exact `rendererKey` → component mapping over exactly the same keys.

RF-05 defines no real production entry. RF-06 supplies the first real binding entry.

**K11. Fail-closed rules.**
- A duplicate `rendererKey` among the entries is an invariant error: never first-write-wins or last-write-wins.
- Lookup is exact-key only.
- No latest/default/fallback renderer, no filesystem discovery, no module scan, no database lookup, no environment discovery, no alias/remapped key.
- A factory-created binding registry can never contain a compatibility manifest without a component, or a component without a compatibility manifest.

**K12. Binding error family.** RF-05 adds a distinct invariant error family, semantically `RendererBindingInvariantError` (exact identifier follows the existing `…InvariantError` convention), used for: a malformed binding entry (not an object, missing `compatibilityManifest`, missing or non-component `component`); a duplicate binding key; a missing component for an otherwise selected renderer (K13); any impossible registry state; a runtime-corrupted binding registry. Validation of the manifest's own contents is RF-04's (R14): the RF-04 `RendererSelectionInvariantError` raised by that projection propagates unchanged. Normal RF-04 `RendererSelectionError` and `RendererSelectionInvariantError` failures from compatibility/selection also propagate **unchanged**. RF-05 never wraps, re-codes or converts RF-04 errors, and never turns them into product issue arrays.

**K13. Missing implementation binding.** For a valid factory-created registry, a selected compatibility key without a component binding is structurally impossible. For a hand-built or runtime-corrupted registry, a selected key with no component throws `RendererBindingInvariantError`. There is never a renderer fallback.

### Capabilities

**K14. Closed capability object.** `InvitationRendererCapabilitiesV1` is a **closed** object with exactly these optional named members:

```text
InvitationRendererCapabilitiesV1 {
  rsvp?:      RsvpCapabilityV1        // K15
  clipboard?: ClipboardCapabilityV1   // K21
  music?:     MusicCapabilityV1       // K23
  clock?:     ClockCapabilityV1       // K26
}
```

No generic `Record<string, unknown>`, no arbitrary capability bag, no other member. The capabilities object itself is **always** provided (it may be empty). A present member means that runtime capability is available; an absent member means it is unavailable. Absence is **never** interpreted as success.

### RSVP capability

**K15. Contract.** RF-05 owns the renderer/action contract only; persistence stays Task 033 / later integration. Semantically:

```text
RsvpCapabilityV1 {
  submit(input: RsvpSubmitInputV1): Promise<RsvpSubmitResultV1>
}

RsvpSubmitInputV1 {
  attendance: RsvpAttendanceStatus   // lib/domain/rsvp-attendance.ts: ATTENDING | MAYBE | NOT_ATTENDING (RSVP completion amendment)
  partySize:  number
  message:    string | null
  guestName:  string | null
}
```

Exactly these four input fields. `attendance` uses the canonical `RsvpAttendanceStatus`; there is no `MAYBE` (RF15). `message` and `guestName` are `string | null`; there is no `undefined`-based semantic distinction.

**K16. Input rules.**
- `ATTENDING` (and `MAYBE`, RSVP completion amendment): `partySize` is an integer 1–20. `NOT_ATTENDING`: `partySize` is exactly 0 (`docs/PHYSICAL_DATABASE_PLAN.md` §2.20). *Amended 2026-10-01:* `guestName` is a required trimmed non-blank string for every submission (RF15 "RSVP completion").
- `message`: `null`, or a string of at most 500 characters (§2.20 `CHECK`).
- `guestName`: when `viewModel.guest` exists (personalized), it may be `null`. When `viewModel.guest` is absent (non-personalized), it must be a non-null string that is non-blank after `trim()`, per the existing canonical rule that a non-personalized RSVP carries a manually entered name (§2.20 `guest_display_name_snapshot`). RF-05 adds no other length or format rule. `guestName` is never identity or authorization (K20).
- A renderer may prevalidate for UX. The capability implementation is authoritative and must validate again.

**K17. Result contract.** `RsvpSubmitResultV1` is a discriminated union over exactly four outcomes (exact discriminant naming follows repository conventions):

| Outcome | Meaning |
|---|---|
| `SUCCESS` | persistence/action really succeeded |
| `INVALID` | input rejected by canonical validation |
| `UNAVAILABLE` | submission cannot currently be performed |
| `FAILED` | submission was attempted but did not succeed |

RF-05 v1 freezes no extra payload on any outcome; none ever carries a token, guest identity or raw error object. Expected business/runtime failures **resolve** to `INVALID`/`UNAVAILABLE`/`FAILED`. Unexpected programming/infrastructure faults may reject/throw. Nothing ever resolves a fake `SUCCESS`.

**K18. RSVP UI state ownership.**
- Pending state is renderer/shared-UI local state.
- Success UI is shown **only** after a resolved `SUCCESS`. `INVALID`, `UNAVAILABLE` and `FAILED` are never shown as success.
- A rejected promise (unexpected fault) is handled as failure, never as success.
- The capability object does not persist UI pending/error state, and does not share it between templates.
- No current-RSVP prefill in v1: RF-05 introduces no "current RSVP response" field.

**K19. RSVP presence / visibility.** RSVP is **not** one of the five RF-04 effective-section keys, and RF-05 introduces no RSVP visibility setting.
- `capabilities.rsvp` presence is the v1 gate for interactive RSVP UI.
- When `rsvp` is absent, the renderer must not present an interactive/submittable RSVP form. It may omit the RSVP block entirely.
- A future preview harness may supply an explicit non-persisting RSVP capability that returns `UNAVAILABLE`, to exercise RSVP UI.
- Preview/review never supplies a capability that fakes `SUCCESS` (RF15).

**K20. RSVP security boundary.** Renderer props and RSVP capability input/output never carry an access-link token, a guest token, a raw guest id used for authorization, `service_role` credentials, or a `?guest=` identity. Guest authorization is encapsulated upstream by the later server/public integration (the capability implementation is already bound to the authorized context). The RF-03 `GuestOverlay` stays `displayName` only (V1).

### Clipboard capability

**K21. Contract.** Semantically:

```text
ClipboardCapabilityV1 {
  copyText(text: string): Promise<ClipboardCopyResultV1>
}
```

`ClipboardCopyResultV1` resolves to exactly one of `SUCCESS`, `UNAVAILABLE`, `FAILED`. `SUCCESS` means the copy operation actually succeeded; there is no false-positive success. Unexpected faults may reject; a rejection is never success.

**K22. Clipboard UI semantics.**
- "Copied" UI is shown only after `SUCCESS`. `UNAVAILABLE` and `FAILED` never produce success UI.
- Copied/timed UI state is renderer/shared-UI local presentation state.
- Renderer code never calls `navigator.clipboard` directly.
- There is no legacy `document.execCommand` fallback in v1.
- RF-05 freezes the contract only; concrete browser adapter wiring is later integration (K35).

### Music capability

**K23. Contract.** Semantically:

```text
MusicCapabilityV1 {
  status: MusicPlaybackStatusV1   // PAUSED | PLAYING | BLOCKED | ERROR
  play():  Promise<void>
  pause(): Promise<void>
}
```

- **Status is authoritative.** `status` is the provider-supplied current state and is the **only** authoritative playback state. A change (`PAUSED`/`PLAYING`/`BLOCKED`/`ERROR`) is delivered to the renderer as a new/updated `MusicCapabilityV1` value on a normal React rerender (the same pattern as the clock, K26). Renderer-local optimistic playback state is never authoritative.
- **Promise = command completion only.** The Promise returned by `play()`/`pause()` means only that the command has completed. It resolves to no value: there is no music result union, no boolean success result, and no returned status. Resolution never means `PLAYING` (for `play()`) or `PAUSED` (for `pause()`). Renderer code never derives playback state from whether `play()`/`pause()` was called, resolved or rejected; it shows playing only when the latest `status === PLAYING`. There is no fake `PLAYING` state.
- **Expected outcomes never reject.** Expected playback outcomes (K25) are reflected only through the current/subsequent `status` value, and the command Promise resolves.
- **Unexpected faults may reject.** An unexpected programming/infrastructure fault may reject the Promise returned by `play()`/`pause()`. This rejection path is distinct from the expected `BLOCKED`/`ERROR` status outcomes.
- **Renderer handling of rejection.** Renderer/shared presentation code that invokes `play()`/`pause()` must handle Promise rejection. On an unexpected rejection it must not show `PLAYING` merely because `play()` was requested, must not show `PAUSED` merely because `pause()` was requested, must not treat the action as success, must not leave an unhandled Promise rejection, and continues to treat the latest capability `status` as authoritative. It does not replace the authoritative status with renderer-local state. RF-05 never converts a rejected event-handler command into a renderer/component render exception, and defines no fallback renderer.

**K24. Availability.** `capabilities.music` is present **only** when `viewModel.media.audio` exists and is `RESOLVED` (RF-03 M9). If there is no audio slot, or the audio slot is `UNAVAILABLE`, `capabilities.music` is absent and the renderer shows no operational music control. Playback is never fabricated.

**K25. Action semantics.**
- One logical invitation-audio instance per rendered invitation.
- No autoplay: the initial status is `PAUSED`, and `play()` is initiated only from an explicit user interaction.
- `play()`: successful real playback → `PLAYING`; a browser/user-agent policy that prevents playback → `BLOCKED`; another expected playback failure → `ERROR`. A rejected/blocked play never becomes `PLAYING`.
- `pause()`: successful pause → `PAUSED`; an expected operational pause failure, if one can occur in an adapter → `ERROR`.
- These expected outcomes are status values only, never Promise rejection (K23). The concrete browser adapter translates real browser behavior into these statuses.
- Retry: a later explicit user gesture may call `play()` again when the status is `BLOCKED` or `ERROR`. There is no automatic, background or autoplay retry. `status` stays authoritative.
- Loop is ON in v1.
- No renderer-exposed volume control and no renderer-exposed mute control in v1.
- The concrete `Audio`/browser adapter is later integration. RF-05 core never instantiates `HTMLAudioElement`.

### Clock and countdown

**K26. Clock capability.** Semantically `ClockCapabilityV1 { nowEpochMs: number }`: an explicit runtime input of epoch milliseconds. No `Date` object, no `Date.now()`, no implicit clock function, no ambient current time. A later client clock adapter refreshes the value.

**K27. Countdown ownership and target.** RF-05 owns a shared **pure** countdown derivation. The only target is the resolved ceremony event's canonical `startsAt` from the ViewModel (`viewModel.ceremony.startsAt`, RF2). No template may choose another target. The derivation receives an explicit `nowEpochMs` (from `capabilities.clock`); it never reads the current time itself. A non-finite `nowEpochMs` or unparseable `startsAt` is a programming/invariant failure and throws; it never produces a fabricated countdown.

**K28. Countdown result.** Semantically `{ days, hours, minutes, seconds, hasPassed }`. All numeric parts are non-negative integers.
- Before the target (`nowEpochMs < target`): the remaining duration is split into whole days (fixed 24-hour periods), hours (0–23), minutes (0–59) and seconds (0–59), each truncated toward zero; `hasPassed = false`. The duration is absolute, so the event timezone does not affect it.
- At or after the target (`nowEpochMs >= target`): `days = hours = minutes = seconds = 0` and `hasPassed = true`.
- Refresh cadence is **1 second**. The cadence belongs to the later clock adapter/provider, never to the pure derivation.

**K29. Countdown presence.** A renderer may render a live countdown only when `capabilities.clock` is present. When it is absent, the renderer never fabricates a current time and may omit the live countdown. There is no neutral/fake clock.

### Date/time presentation

**K30. Ownership.** RF-05 owns shared **pure** date/time/weekday presentation derivation for an event's canonical `startsAt` + `timezone` (the ceremony or any ViewModel event entry). Templates never parse or format canonical event timestamps independently. Locale is `vi-VN`; the timezone is the event's own canonical IANA timezone. The ambient machine timezone is never used, and the admin-only date formatter is never reused (RF-03 V4).

**K31. Presentation semantics (v1).** For an event, all derived in the event timezone from the same canonical instant:

| Output | Convention |
|---|---|
| weekday | full Vietnamese weekday label |
| day | 2 digits (`DD`) |
| month | 2 digits (`MM`) |
| year | 4 digits (`YYYY`) |
| time | 24-hour `HH:mm` |

The full weekday labels are the fixed v1 set `Thứ Hai`, `Thứ Ba`, `Thứ Tư`, `Thứ Năm`, `Thứ Sáu`, `Thứ Bảy`, `Chủ Nhật` (Monday → Sunday), with ASCII digits for all numeric parts. Output must be identical on server and client regardless of the runtime's ICU data. RF-05 does not freeze template typography or layout around these values (a template may, for example, uppercase them in CSS).

**K32. Lunar presentation unchanged.** `event.lunarDateDisplay` stays manually authored presentation text (RF6). RF-05 never calculates, parses, normalizes, reformats or backfills it. If present, it is passed/displayed unchanged; if absent (null), the lunar line is omitted. The legacy `wedding_details.lunar_date_display` stays forbidden.

### Calendar month grid

**K33. Shared month grid (v1).** RF-05 owns a shared **pure** month-grid derivation for the resolved ceremony event only:
- the calendar month is the month containing the resolved ceremony's `startsAt` in the ceremony `timezone`;
- weeks start Monday; columns are Monday → Sunday;
- exactly 6 rows / 42 cells, in row-major order; the first cell is the Monday on or before the 1st of the ceremony month;
- cells outside the ceremony month are included, and each cell states whether it is in the ceremony month;
- real month lengths and leap years are used (no hard-coded month lengths);
- the ceremony-date cell is explicitly marked, and exactly one cell is marked.

Templates may style the grid differently but never derive another month/date independently. Column header wording is template presentation; the column order is fixed.

**K34. No add-to-calendar in the Foundation.** "Calendar" in RF-05 means the visual ceremony month grid only. RF-05 does not implement or contract ICS download, Google Calendar URLs, Apple Calendar integration, or device calendar APIs. Those stay outside the current Foundation unless a later checkpoint explicitly adds them.

### Adapters, failures and boundaries

**K35. Capability adapter ownership.** RF-05 owns capability **types**, expected-result semantics, pure derivations and the renderer/binding contracts. RF-05 core never implements browser-global adapters (`navigator.clipboard`, `HTMLAudioElement`/`Audio`, `window` timers, `Date.now`). Later client integration supplies those capabilities. Any reusable browser adapter added in a later checkpoint must conform exactly to these RF-05 contracts.

**K36. Failure taxonomy.**

| Class | Failure | Handling |
|---|---|---|
| A | RF-04 compatibility/selection failure | RF-04 typed errors (`RendererSelectionError`, `RendererSelectionInvariantError`) propagate unchanged |
| B | RF-05 binding invariant failure | `RendererBindingInvariantError` (K12) |
| C | expected capability operation failure | that capability's frozen expected-failure channel: RSVP → resolved typed result (K17); clipboard → resolved typed result (K21); music → `status` value `BLOCKED` or `ERROR` while the `play()`/`pause()` Promise resolves (K23, K25) |
| D | unexpected capability programming/infrastructure failure | reject/throw according to the capability contract; for music `play()`/`pause()`, Promise rejection is allowed (K23) |
| E | renderer component render exception | **not** caught or converted by RF-05; propagates to the application-level React/Next error boundary |

RF-05 defines no template-level fallback renderer.

**K37. Full manifest boundary.** RF-05 does not define the full production renderer manifest; RF-06 owns it. RF-06's full manifest incorporates the exact RF-04 compatibility fields, and RF-06 **projects** the four `RendererCompatibilityManifestV1` fields before registration. A full manifest object with extra fields is never passed directly to RF-04/RF-05 compatibility registration.

**K38. RF-06 handoff.** After RF-05, RF-06 must provide: 1. the first production `rendererKey`; 2. the full production renderer manifest; 3. its projection to `RendererCompatibilityManifestV1`; 4. an `InvitationRendererComponentV1` implementation; 5. one RF-05 binding entry; 6. production/client capability adapter wiring; 7. the approved font mapping (RF14); 8. a renderer fixture harness (RF10); 9. renderer-specific visual/behavior tests; 10. honest `UNAVAILABLE` media presentation (RF-03 V12). RF-06 still owns Elegant Editorial v1 (RF-04 R24).

**K39. No production key in RF-05.** RF-05 freezes no real production `rendererKey`, including `wedding.elegant-editorial.v1`. Conceptual examples stay examples only.

**K40. Review/Publish boundary.** RF-05 owns no Review/Publish orchestration. It persists no rendering state, aggregates no publish issue arrays, and never converts renderer errors into Task 030 blocking codes; that mapping stays later work (RF-04 R21).

**K41. Media resolver/signing boundary.** RF-05 does not own the concrete media resolver/signing adapter. The RF-03 injected media-resolution architecture (A1–A2, M1–M13) is unchanged; concrete Supabase/storage integration stays later.

**K42. Staff preview / public route boundary.** RF-05 does not own the staff preview route, the public rendering route, the access-link resolver, or the guest-token resolver. It defines only reusable renderer/runtime contracts.

**K43. Task 029 boundary.** Task 029 stays visual source truth only. RF-05 never imports or uses prototype hooks/helpers (`app/internal/prototypes`) as production contracts. These prototype behaviors stay rejected: false clipboard success, fake music playing, `MAYBE` RSVP, fake RSVP persistence, and implicit `new Date()` current time.

### Testing contract

**K44. Future RF-05 tests.** RF-05 implementation tests must run in the existing Node/Vitest environment, without adding jsdom merely to test the core contracts. No production renderer is required: typed fixtures and fixture components suffice. At minimum:
- **Binding:** exact component lookup; duplicate binding key; missing-binding invariant; no fallback; composition with the RF-04 compatibility registry.
- **Props:** exact renderer props contract; effective sections are authoritative; the compatibility manifest is not exposed.
- **RSVP:** canonical input validation contract; `SUCCESS`/`INVALID`/`UNAVAILABLE`/`FAILED` semantics; no token/identity fields; no `MAYBE`; no fake success.
- **Clipboard:** success only after operation success; `UNAVAILABLE`/`FAILED` never success.
- **Music:** `PAUSED`/`PLAYING`/`BLOCKED`/`ERROR`; rejected play never `PLAYING`; absent when audio is missing/unavailable; no autoplay.
- **Clock/countdown:** explicit epoch input; pre-target result; exact target; post-target zero state; no `Date.now`.
- **Date/time:** `vi-VN`; explicit timezone; no machine-timezone dependency.
- **Calendar:** Monday-first; 42 cells; correct month; exactly one ceremony emphasis.

### Superseded / scoped wording

**K45.** For RF-05 this section scopes or supersedes: RF10 "RF-01 to RF-05 are pure and unit-testable" and RF17 "Order" "RF-01 through RF-05 remain pure TypeScript" (both read per K3); RF12's list including "runtime capabilities" and "RSVP callback/capability metadata" in the ViewModel (capabilities are a separate renderer prop, K6/K14; the ViewModel is unchanged); RF-03 V4's "later shared-presentation/client-capability checkpoint" (that checkpoint is RF-05, K27–K34); `docs/TEMPLATE_SYSTEM.md` §5 and `docs/ARCHITECTURE.md` §10 "RF-05/RF-06" binding wording (RF-05 owns the generic machinery, RF-06 supplies the first real binding, K9–K10). RF15 is refined, not reopened, by K15–K25.

## Invitation Rendering Foundation — RF-06-0 First Production Renderer Contract Clarification

**Status:** docs only, **FROZEN** at `ef0b632` (2026-09-29). RF-01 is frozen at `5ee6bd1`, RF-02 at `f2f9ea2`, RF-03 at `260a03f`, RF-04 at `fe8b400`, and RF-05 is complete and frozen at `fc94b30` (RF-05D PASS). RF-06 discovery and planning passed, but the frozen docs left the first production renderer's identity, full manifest, font and asset policy, content adaptations, server/client composition and checkpoint process open. This section is the **single authoritative RF-06 contract**. Where RF9, RF10, RF14, RF15, RF16, the RF-04 clarification (R3, R12, R15, R23–R25), the RF-05 clarification (K5, K19, K35, K37–K39), `docs/TEMPLATE_SYSTEM.md` §5–§7 or `docs/ARCHITECTURE.md` §10 describe these more broadly or conceptually, this section governs RF-06. It does not reopen any RF-00 through RF-05 decision, and it does not change the RF-02 Snapshot, the RF-03 `InvitationViewModel`, the RF-04 `RendererSelectionContextV1` or any RF-05 contract. No RF-06 code exists yet. **RF-06A has not started. Task 030 stays blocked** (RF16).

**Product Owner sign-off (2026-09-29).** Approved: the P16 design keys (`green-ivory`, `editorial-classic`, `STANDARD`); the P3 font families (Great Vibes, Source Serif 4, Inter via `next/font`), with Vietnamese glyph and licence QA still required before any certification claim; and personalized RSVP without a name input, submitting `guestName: null` (P31). Not approved: a music-unavailable indicator. It is replaced by the P35 degraded-state rule (no capability, no control, no indicator). No Product Owner choice in this section remains open.

### Product goal and source of truth

**P1. Goal.** RF-06 delivers the first production invitation renderer, **Elegant Editorial v1**, and with it RF16 item 16 ("at least one production renderer integration that proves the architecture").

**P2. Task 029 is visual reference only.** The UI label "Elegant Editorial" in the Task 029 prototype renders `GreenIvoryEditorialPrototype` (`app/internal/prototypes/invitation/_directions/green-ivory-editorial/`). That component is the approved **visual** reference. `_directions/elegant-editorial/` is legacy, unimported and dead; it is not a reference at all. The production renderer is implemented independently against the frozen RF-01 to RF-05 contracts. No production module (`templates/**`, `lib/**`, and every production composition or route) may import `app/internal/prototypes/**`. No prototype path, hook, helper, data file or CSS module is production authority (RF-04 R25, RF-05 K43).

### D1 — Fonts

**P3. Production font set (explicit font-library decision per RF14; Product Owner APPROVED 2026-09-29, certification still pending).** Elegant Editorial v1 uses exactly three families, each loaded through `next/font/google` (self-hosted by the Next build):

| Role | Family | Maximum permitted weights / styles | Subsets |
|---|---|---|---|
| script / accent | **Great Vibes** | 400 normal | `latin`, `vietnamese` |
| editorial serif | **Source Serif 4** | 400, 600; normal and italic | `latin`, `vietnamese` |
| label / UI sans | **Inter** | 400, 500, 600; normal | `latin`, `vietnamese` |

- **Verified support.** The installed Next.js 16.3.0 font catalog (`node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`) lists all three families with a `vietnamese` subset: Great Vibes (weight 400, normal), Source Serif 4 (200–900 plus variable, normal/italic) and Inter (100–900 plus variable, normal/italic). The recommended defaults were therefore kept. No substitute was needed.
- **Licence basis.** All three are distributed through Google Fonts under the **SIL Open Font License 1.1**, which allows web embedding and commercial use. The OFL basis is recorded here. RF-06B records the upstream licence reference for each family in its checkpoint report.
- **Loading.** Only `next/font` is used. No runtime CSS `@import`, no `<link>` to an external font CDN, no committed font files, and no font catalog loaded globally. The fonts load only in the renderer graph (CLAUDE.md §19). RF-06B loads only the weights/styles its CSS actually uses, within the table's maximum. The table is a ceiling, not a list to load.
- **Isolation from global fonts.** `app/globals.css` currently `@import`s Dancing Script and Playfair Display from Google Fonts at runtime. That is technical debt (P45). It is **not** part of the Elegant Editorial font contract. The renderer's `font-family` declarations reference only its own `next/font` families plus generic fallbacks, and never those globally imported families.
- **Certification.** Vietnamese glyph QA (`docs/TYPOGRAPHY_AND_MOTION.md` §3, §8) is performed in RF-06E. Nothing claims these fonts are "certified" for WeddingClick until those checks pass. A glyph or subset defect found in RF-06E is an RF-06B defect, handled by P44.

### D2 — Decor asset provenance

**P4. Prototype assets are art-direction references.** The Task 029 decor files under `public/prototypes/invitation/decor/` (envelope body/flap/seal, calendar flowers, floral divider strip) are **not** production-certified because they exist or because they were approved visually. Their provenance and production-use rights are not documented today.

**P5. Rule for RF-06B.** A prototype-derived asset may enter production only if its provenance **and** right to production use are explicitly confirmed and recorded before RF-06B is frozen. Otherwise RF-06B uses newly created, WeddingClick-owned replacement artwork, or another asset whose production rights are documented. Every production asset has a provenance record (source, author/owner, rights basis) in the RF-06B report and in a provenance note inside `templates/wedding/elegant-editorial/v1/` (never under `public/`).

**P6. Location and weight.** Production assets live only under the immutable path `public/renderers/wedding/elegant-editorial/v1/`. No production renderer module references `public/prototypes/**`. Assets are optimized for their actual display size: vector (SVG) where the artwork allows, otherwise raster at no more than 2× its largest rendered CSS size inside the ≈480 px column (P12), in a web-efficient format. RF-06B reports each file's size and the total. A total decor payload above about 1 MB needs explicit justification in that report. The roughly 10–11 MB of prototype PNGs that Elegant Editorial references today is technical debt and a reference point only (P45). It is never a production payload.

### D3 — Content and visual adaptations

**P7. Canonical data wins over prototype fiction.** Wherever the prototype shows content that has no canonical ViewModel source, v1 either maps it to the canonical field or removes it. It never invents data, demo media or placeholder text presented as customer content (RF7, RF11 G, RF-03 V12). Only the renderer props are read (RF-05 K6): `viewModel`, `sections` and `capabilities`.

| Area | Elegant Editorial v1 behavior |
|---|---|
| Hero | Uses `viewModel.media.cover` when `RESOLVED`. When the cover is absent **or** `UNAVAILABLE`, it shows an honest typographic hero (names, ceremony title, date) with no image. No hard-coded location (the prototype's "Đà Nẵng" is removed) and no substitute media. |
| Opening card / envelope | May reuse the same resolved cover. No second media role is invented. |
| Portraits | *Amended 2026-10-01 (RF7 Product Owner amendment):* the optional `media.portrait.groom` / `media.portrait.bride` slots carry the canonical `PORTRAIT_GROOM` / `PORTRAIT_BRIDE` media. Rendering them in the Task029 couple composition is a separate, later visual checkpoint. Without a `RESOLVED` portrait the typographic couple block stays. No fake/demo portraits. |
| Editorial image cluster | Removed from v1 (no canonical media roles). |
| Love story | *Amended 2026-10-01 (RF7 "Photo Story / Love Story photo"):* with a RESOLVED `media.loveStoryPhoto` the Task029 full-bleed photo-led treatment renders; otherwise: Text-only, from `viewModel.content.loveStory`, rendered as text (line breaks preserved; never interpreted as HTML). No background media is invented. Shown only when `sections.loveStory`. |
| Gallery | *Amended 2026-10-01:* every GALLERY image renders; the Task029 10-slot arrangement repeats as a layout cycle and is never a maximum. `viewModel.media.gallery` in canonical order, shown only when `sections.gallery`. An `UNAVAILABLE` item keeps its position as a neutral, non-interactive tile carrying fixed template copy saying the image is unavailable. It is never opened in the lightbox, removed, reordered or replaced (RF-03 M8, RF-04 R11). |
| Timeline | *Amended 2026-10-01 (RF7 "Timeline (Product Owner amendment)"):* rendered from `viewModel.content.timeline` when `sections.timeline` is effective, in the Task029 rhythm between the Events ✦ and the tight ✦ (the Countdown now sits in the ceremony band, between the ceremony heading/date and the Calendar — Micro-Checkpoint 10 Product Owner ruling). Canonical steps only, never events. |
| `threePhoto` | Removed from v1. |
| `dressCode` | *Amended 2026-10-01 (RF7 "Dress Code (Product Owner amendment)"):* rendered from `viewModel.content.dressCode` when `sections.dressCode` is effective, after RSVP / Gift and before Gallery. Canonical project data only. |
| Invitation message | *Amended 2026-10-01 (Micro-Checkpoint 10 Product Owner ruling):* not rendered by v1; the manifest declares `sectionCapabilities.invitationMessage: false` (no setting key), so the effective section is always `false`. v1 shows only the two-line block "TRÂN TRỌNG KÍNH MỜI" + guest line (D1 amendment). Formerly: `viewModel.content.invitationMessage` rendered verbatim as text, only when `sections.invitationMessage`. No token substitution, no templating, no HTML. |
| `additional_note` | Never rendered; it is not in the Snapshot or the ViewModel (RF8). |
| Families | `viewModel.families.primary` then `.secondary` (RF4 display order, both shown). Only canonical fields are shown, and a null line is omitted. The side label ("Nhà Trai" / "Nhà Gái", fixed copy) is chosen by the family's explicit `side`, never by position (RF5). No invented address or content. |
| Ceremony | Title is `viewModel.ceremony.title` verbatim (RF3). Date, weekday and time come only from the RF-05C presentation derivation of `ceremony.startsAt` + `ceremony.timezone`. |
| Events | *Amended 2026-10-01 (RF2 "Ceremony-card presentation"):* `viewModel.ceremonyCards` in the given order (one per operational side, GROOM before BRIDE). Each shows the fixed v1 card title for its side's rite ("Tiệc mừng lễ thành hôn" / "Tiệc mừng lễ vu quy", Product Owner ruling 7A) and the card event's canonical `venueName`/`address`, and date/time from RF-05C. A map CTA appears only when that event's `mapUrl` exists. Other canonical events stay in `viewModel.events` and are not cards. No lunar text on non-ceremony events (RF6). |
| Guest line | Personalized: `viewModel.guest.displayName`, shown as presentation text only, never identity or authorization (RF-03 V1, RF-05 K20). Unpersonalized: fixed template copy. |
| RSVP | *Amended 2026-10-01 (RF15 "RSVP completion"):* choices `ATTENDING`, `MAYBE` ("Sẽ cố gắng tham dự"), `NOT_ATTENDING`; the name input is always visible and first. Governed by P31–P33 as amended. |
| Lunar | `viewModel.ceremony.lunarDateDisplay` is shown verbatim, or the lunar line is omitted when it is null or empty (RF6, K32). A fixed label such as "Tức ngày" is allowed only as **separate** template copy placed beside it. The label never parses, alters, concatenates into or replaces the canonical string. |
| Calendar | The RF-05C Monday-first 42-cell month grid is authoritative (K33). Column headers are fixed template copy in Monday → Sunday order. The renderer never computes its own month, weekday or day count. |
| Countdown | RF-05C `deriveCeremonyCountdownV1` over `capabilities.clock` only (K27–K29). No countdown is shown without a clock. A passed ceremony shows fixed copy, never negative values. |
| Gift | Shown only when `sections.gift`. Lists only the sides present in `viewModel.gift`, in `operationalSides` order. It never fabricates a side, a common account or `QR_COMMON` (RF13, S8–S9). Each side shows its non-blank canonical bank text, and its QR from `viewModel.media.qr.<side>`. An `UNAVAILABLE` QR keeps the bank text visible and shows fixed copy saying the QR is unavailable (RF-03 M10). The gift entry point never opens an empty dialog: by RF-02 S7/S8 every present side has bank text or a QR reference, and RF-06 tests assert that no rendered dialog is empty. Copy-to-clipboard follows P34. |
| Music | Governed by P35. A music control renders only when `sections.music` is true **and** `capabilities.music` is present (audio `RESOLVED`). When the audio slot is absent or `UNAVAILABLE`, nothing music-related renders: no control, no disabled button, no broken-music icon, no "music unavailable" text, no placeholder (K24). |
| Media (all) | No fake URL, no demo substitute, no storage lookup, no signing, no `project_media` discovery inside the renderer (RF13, RF-03 A2). |

**P8. Section visibility.** Props `sections` are the only visibility authority for the five optional sections (K7). The renderer never re-derives visibility from `viewModel.sections`, `design.sectionSettings`, the manifest or media availability. Non-optional blocks (hero, couple, families, ceremony, events, calendar) always render from canonical data. For music, the absence of any music UI when `capabilities.music` is absent is the P35 degraded state required by K24, not a re-derivation of visibility.

**P9. Design keys.** Elegant Editorial v1 declares exactly one palette, one font preset and one effect preset (P16). The v1 renderer therefore does not branch on `design.paletteKey`, `fontPresetKey` or `effectPresetKey`, and does not read `design.designSettings` (v1 declares no design settings). Reduced motion is honored regardless of the effect preset (P13).

**P10. Fixed template copy.** Section headings, the default unpersonalized guest salutation, unavailable-media copy, gift intro, countdown "passed" copy, calendar column headers and closing copy are fixed template-owned Vietnamese copy. They are part of the immutable v1 renderer (RF7, RF14). RF-06B authors them and they are reviewed with RF-06B. They are never persisted customer content.

### D4 — Responsive / desktop

**P11. Mobile-first baseline.** Primary design targets are 360 / 390 / 430 px (CLAUDE.md §21). There is no dependency on the prototype `--frame-width` review frame: sizing uses renderer-owned CSS (CSS Modules scoped under the renderer root), and the renderer root sets its own box-sizing, typography and colors instead of relying on global Tailwind preflight (P45). Layouts do not assume `100vh`; `dvh` (with a safe fallback) may be used where appropriate. There is no horizontal page scroll at any supported width.

**P12. Desktop composition (RF-06 production adaptation).** At ≥ 768 px the invitation becomes a centered editorial column of about 480 px on a renderer-owned decorative/background surface. The content column never stretches past that width at wide desktop sizes. This is an RF-06 adaptation, not a claim that Task 029 designed desktop.

**P13. Dialogs and motion.** The gift dialog is a bottom-sheet-like panel on mobile and a centered modal/panel at ≥ 768 px. Every dialog is keyboard-accessible (focus moves in, Escape closes, focus returns), has an accessible name, and never traps the user. The envelope/opening interaction and reveals never block content permanently. They are skippable, work without audio, and under `prefers-reduced-motion: reduce` they show content immediately without large movement or continuous decorative loops (`docs/TYPOGRAPHY_AND_MOTION.md` §12–§15). RF-06 installs no new package (CLAUDE.md §24). Using an already-installed dependency for motion must be justified in the RF-06D report; plain CSS/`IntersectionObserver` is preferred.

### D5 — Production identity

**P14. Frozen identity.**

| Field | Value | Catalog column it will seed (RF9, later) |
|---|---|---|
| event type | `WEDDING` (`EventType`, `lib/domain/event-type.ts`) | `templates.event_type` |
| template code | `elegant-editorial` | `templates.code` |
| version number | `1` | `template_versions.version_number` |
| display name | `Elegant Editorial` | `templates.name` (seed value) |
| renderer key | **`wedding.elegant-editorial.v1`** | `template_versions.renderer_key` |

The key is composed from identity by P18. It is **not** derived from `GreenIvoryEditorialPrototype`, the runtime UI label or the legacy directory (R24). Any future incompatible visual or behavioral change becomes `wedding.elegant-editorial.v2` (a new directory, manifest, binding and catalog version). After the RF-06 final freeze (P22), v1 is never mutated. This supersedes, for this one key, R4/R15/K39 "no production key is frozen": `wedding.elegant-editorial.v1` is now the first real production `rendererKey`. Examples in other docs remain examples.

### Full production manifest

**P15. `RendererProductionManifestV1` — exact closed shape.** Derived from the existing catalog model (`templates.code`/`event_type`/`name`, `template_versions.version_number`/`renderer_key`/`manifest`), the frozen RF-04 `RendererCompatibilityManifestV1` and the frozen Task 028 `TemplateDesignManifestV1`:

```text
RendererProductionManifestV1 {
  readonly identity: {
    readonly eventType:     EventType          // canonical, lib/domain/event-type.ts
    readonly templateCode:  string             // P18 format
    readonly versionNumber: number             // positive safe integer
    readonly displayName:   string             // catalog seed name
  }
  readonly compatibility: RendererCompatibilityManifestV1   // RF-04 R3, reused unchanged
  readonly design:        TemplateDesignManifestV1          // Task 028, reused unchanged
}
```

- Exactly three top-level members and exactly four `identity` members. No others.
- **`rendererKey` exists only once**, as `compatibility.rendererKey`. It is not duplicated in `identity`, because it is fully determined by identity (P18) and a second copy could disagree.
- `compatibility` is exactly the RF-04 projection input (K37). It is the only part given to RF-04/RF-05 registration, after projection by `projectCompatibilityManifest`.
- `design` is exactly the Task 028 subset that the later catalog seed writes into `template_versions.manifest` (P19).
- It contains **no** component, function, React type, runtime capability, database row or id (no `templates.id`, no `template_versions.id`), signed URL, storage path, asset list, mutable project data, `is_active`/`retired_at`/`sort_order`/`description`/`preview_media_path` (mutable catalog presentation, not renderer identity), or `supportedFeatures`.
- The type name carries the version, so there is no separate manifest schema-version field. A future incompatible full-manifest shape is `RendererProductionManifestV2`.
- Readonly semantics: registries hold validated, deeply frozen, registry-owned copies. Later mutation of a caller's object cannot change registry behavior (same discipline as RF-04 R13/R26).

**P16. Elegant Editorial v1 manifest values (exact; design keys Product Owner APPROVED 2026-09-29).**

```text
identity: { eventType: "WEDDING", templateCode: "elegant-editorial",
            versionNumber: 1, displayName: "Elegant Editorial" }
compatibility: {
  rendererKey: "wedding.elegant-editorial.v1",
  supportedPayloadSchemaVersions: [1],
  supportedVariants: ["COMMON", "GROOM", "BRIDE"],
  sectionCapabilities: { invitationMessage: true, loveStory: true, gallery: true,
                         music: true, gift: true }
}
design: {
  schemaVersion: 1,
  palettes: ["green-ivory"],
  fontPresets: ["editorial-classic"],        // = the P3 family set
  effectPresets: ["STANDARD"],
  sectionSettingsSchema: {
    invitationMessage: { type: "boolean" }, loveStory: { type: "boolean" },
    gallery: { type: "boolean" }, music: { type: "boolean" }, gift: { type: "boolean" }
  },
  designSettingsSchema: {}
}
```

`sectionCapabilities` is all `true` because every one of the five sections is rendered by v1 (P7), including love story (text-only) and music (P35). *Amended 2026-10-01 (Micro-Checkpoint 10 Product Owner ruling):* `invitationMessage` is now `false` and its `sectionSettingsSchema` key is removed, so v1 never renders the canonical message (the additive `timeline`, `dressCode` and `photoStory` keys are `true`). `supportedVariants` uses the canonical `INVITATION_VARIANTS` order.

**P17. Placement.** The v1 manifest constant lives in `templates/wedding/elegant-editorial/v1/` in a module with no React import, no `"use client"`, no browser globals and no `lib/server/**` import, so both compositions (P27) can import it. The `RendererProductionManifestV1` type, its validator/projection and its error class live in `templates/core/`. None of them may be added to the RF-04/RF-05 files that the frozen static-boundary tests scan (`renderer-compatibility-manifest.ts`, `renderer-registry.ts`, `renderer-selection*.ts`, the RF-05A/B/C files). Those files must stay free of production keys and `TemplateDesignManifestV1`, and RF-06 must not weaken those tests. Exact file names follow repository conventions.

### Full-manifest invariants

**P18. Key composition.** `compatibility.rendererKey === RENDERER_KEY_EVENT_SEGMENT[identity.eventType] + "." + identity.templateCode + ".v" + identity.versionNumber`, where `RENDERER_KEY_EVENT_SEGMENT` is an exhaustive closed map over `EventType` (today `{ WEDDING: "wedding" }`). It is not a generic lower-casing, so adding an event type forces an explicit decision. `templateCode` matches `^[a-z0-9]+(-[a-z0-9]+)*$` (lower-case kebab, no dots), so composition is injective. `versionNumber` is a JavaScript safe integer `> 0` (mirroring the `template_versions` `CHECK`) printed in plain decimal. `displayName` is a non-empty string equal to its own `trim()`.

**P19. Validation (fail-fast order).** `validateRendererProductionManifest(value)` (exact name per convention) treats the static type as untrusted and checks, in order:
1. `value` is a plain object with exactly the own keys `identity`, `compatibility`, `design`;
2. `identity` is a plain object with exactly its four own keys, each valid per P18 (`eventType` ∈ `EVENT_TYPES`);
3. `compatibility` passes the frozen RF-04 `projectCompatibilityManifest` (R3, R14). An RF-04 `RendererSelectionInvariantError` from this step propagates **unchanged**;
4. the projected `rendererKey` equals the P18 composition;
5. `design` passes the frozen Task 028 `validateTemplateDesignManifest`, **and** no key or string value in `design` is changed by that validator's trim normalization (a code-owned manifest never relies on normalization; an absent optional `enumValues` is not a difference). `palettes`, `fontPresets` and `effectPresets` are each non-empty, because `project_design` requires a non-empty key for each;
6. `design.sectionSettingsSchema`: every key is one of the five RF-04 section keys (`RENDERER_SECTION_KEYS`); every spec is exactly `{ type: "boolean" }` with no `enumValues`; and its key set equals exactly `{ k | compatibility.sectionCapabilities[k] === true }`. Staff can toggle exactly the sections the renderer supports, never an unsupported one or a non-section key (R8–R10).

It returns a fresh validated projection. Nothing is coerced, normalized, deduplicated or repaired. The "compatibility is the RF-04 input" and "design is a valid Task 028 manifest" invariants are steps 3 and 5.

**P20. Error family.** RF-06A adds **`RendererProductionManifestInvariantError`** (existing `…InvariantError` convention) for every RF-06-only full-manifest failure: steps 1, 2, 4, 5 and 6 of P19, a duplicate `rendererKey` in a production composition (P27), and any runtime-corrupted production registry state. A Task 028 validator failure in step 5 is rethrown as this error with a fixed static message, never echoing manifest content (`docs/SECURITY.md`). RF-04 errors (`RendererSelectionInvariantError`, `RendererSelectionError`) and RF-05 `RendererBindingInvariantError` propagate unchanged and are never wrapped or re-coded (K12, K36). Malformed full manifests always fail closed. There is no discovery from the filesystem, database or environment, and no fallback.

**P21. Elegant Editorial exact-value tests.** RF-06A tests assert the P16 values exactly: key `wedding.elegant-editorial.v1`; event type `WEDDING`; code `elegant-editorial`; version `1`; payload schema versions exactly `[1]`; variants exactly `COMMON`, `GROOM`, `BRIDE`; `sectionCapabilities` exactly as in P16; `sectionSettingsSchema` exactly the five boolean specs. RF-06B tests assert that the renderer actually renders each section declared capable (P7). Negative tests cover each P19 step, the duplicate key, and RF-04 error pass-through.

### Immutable directory strategy

**P22. Layout.**

```text
templates/
  core/                                 shared production infrastructure (manifest type/validator,
                                        production compositions, client host, capability adapters)
  shared/                               shared presentation/motion primitives (template-agnostic)
  wedding/elegant-editorial/v1/         Elegant Editorial v1 renderer, manifest constant, CSS, copy
public/renderers/wedding/elegant-editorial/v1/   Elegant Editorial v1 production assets only
```

After the RF-06F PASS freeze, `templates/wedding/elegant-editorial/v1/` and `public/renderers/wedding/elegant-editorial/v1/` are **immutable**. Any visual, copy or behavioral change requires v2 (RF14). This is stricter than RF14's "once certified or released": the freeze applies at RF-06F even though no catalog row exists yet. `templates/core/` and `templates/shared/` may evolve later, but only without changing certified v1 output or semantics. Such changes are regression-sensitive and are tested against every active renderer version (CLAUDE.md §28; `docs/TYPOGRAPHY_AND_MOTION.md` §17).

### Server / client boundary

**P23. Server-safe side.** The server-side composition (a harness page now; staff preview and public routes later, which are not RF-06):
- builds or receives the Snapshot (RF-02);
- resolves media through an injected `MediaResolver` (RF-03 Layer A);
- builds the `InvitationViewModel` (RF-03 Layer B);
- runs `selectRendererCompatibility` (RF-04) against the **server-safe production compatibility registry** (P27 A);
- imports only server-safe production manifest/compatibility modules plus **exactly one** client entry. A **production** composition's client entry is the host (P24). The internal harness's client entry is instead its single harness client wrapper (P25), which then renders the host; the harness Server Component does not also import the host as a parallel client entry. No server composition imports the client binding registry, renderer components or capability adapters;
- passes across the RSC boundary **only** serializable data: `rendererKey` (string), `viewModel` (plain JSON data with runtime URLs), and `sections` (the five booleans from `RendererSelectionContextV1.effectiveSections`).

**P24. Client side: `invitation-renderer-host.tsx`.** A `"use client"` module in `templates/core/`. It is the only client entry a **production** composition imports; in the internal harness it is rendered by the harness client wrapper (P25) instead. It:
- is the client boundary;
- creates the runtime capabilities inside the client graph (P30, P34–P36);
- resolves the component with the RF-05B `resolveInvitationRendererComponent` over the **client binding registry** (P27 B), fail-closed, with no fallback;
- renders `<Component viewModel={viewModel} sections={sections} capabilities={capabilities} />`, which is exactly the RF-05 K6 props.

**P25. No callback crosses Server → Client.** No capability object or callback (`RsvpCapabilityV1`, `ClipboardCapabilityV1`, `MusicCapabilityV1`, `ClockCapabilityV1`) is ever serialized from a Server Component to a Client Component, and no API is frozen in which a Server Component passes one as a prop. A client-graph caller may give the host an already-constructed RSVP capability through a client-to-client prop (P30); a Server Component never does.

Compositions:

```text
PRODUCTION:  Server Component ──(rendererKey, viewModel, sections)──> InvitationRendererHost (client) ──> renderer
HARNESS:     Harness Server Component ──(serializable fixture/render data only)──> HarnessClientWrapper (client)
                 ──(client-to-client: data + harness RSVP UNAVAILABLE capability)──> InvitationRendererHost (client) ──> renderer
```

The **harness client wrapper** exists only in the internal harness (P38). It is exactly one `"use client"` module owned by the harness route, outside `templates/**`. It receives only serializable fixture/render data from the harness Server Component, constructs the harness-only RSVP `UNAVAILABLE` capability (and any other deterministic harness capability inputs) inside the client graph, and renders the host, passing those inputs client-to-client. It is not production-authoritative: no production composition, `templates/**` or `lib/**` module imports it, and it introduces no second production architecture.

**P26. Root renderer client compatibility.** `ElegantEditorialV1` is client-compatible and may be rooted in the client graph under the host. Its section components join the client graph transitively. The invitation **page** does not become client-only: the server composition stays a Server Component and the host is server-pre-rendered by normal Client Component behavior (K5). No production renderer or host module queries Supabase, a database, storage or project/draft state, or reads `process.env`.

### Production registries

**P27. Two compositions from one manifest source.** One ordered, explicit list of production manifest constants (today exactly the Elegant Editorial v1 constant) feeds both:
- **A. Server-safe production manifest/compatibility registry** (`templates/core/`, no React or client code): validates each full manifest (P19), rejects duplicate keys (P20), and builds the RF-04 `RendererCompatibilityRegistry` from the projected compatibility manifests. It may offer exact-key lookup of the validated full manifest. RF-06A.
- **B. Client-graph RF-05 binding registry** (`templates/core/`, client graph): validates the same manifests (P19), and builds `createInvitationRendererBindingRegistry` from `{ compatibilityManifest: <projected>, component: ElegantEditorialV1 }` entries. RF-06B.

Both expose the **same** renderer key set. RF-06A/B tests assert exact key-set equality (for example through a readonly key list derived from the shared manifest list, never hand-typed, and without adding enumeration to frozen RF-04/RF-05 modules). There is no discovery, fallback, default, "latest" lookup, alias, or environment/database influence.

**P28. RF-04/RF-05 modules unchanged.** RF-06 composes the frozen RF-04/RF-05 machinery. It does not modify `lib/invitation-rendering/` contracts. If RF-06 finds that a frozen contract is insufficient, it stops and reports BLOCKED instead of patching around it.

### RSVP ownership

**P29. Not in RF-06.** RF-06 does **not** implement persistent RSVP submission. Task 033 owns guest-token resolution, RSVP submit/read, persistence and authorization.

**P30. Behavior before Task 033.**
- The production host supplies **no** `rsvp` capability. With `capabilities.rsvp` absent, Elegant Editorial renders no interactive or submittable RSVP form (K19). It may omit the RSVP block or show fixed non-interactive copy. It never shows a fake form.
- The internal harness (P38) constructs an explicit **`UNAVAILABLE`** RSVP capability in its harness client wrapper (P25) and passes it to the host through a client-to-client prop. The host never constructs a harness capability, and never reads an environment flag to decide whether one exists.
- Unit tests may use deterministic test doubles for all four K17 outcomes (`SUCCESS`, `INVALID`, `UNAVAILABLE`, `FAILED`) and for rejection. No preview or harness capability ever resolves `SUCCESS` (RF15).
- Later, Task 033 constructs the real capability **inside the client graph**, using its authorized client/API workflow.
- No guest token, access token, guest id or `?guest=` value appears in renderer props or renderer UI (K20).
- *Amended 2026-10-03 (Product Owner APPROVED, "Staff Preview RSVP", realizes K19):* the staff preview frame (`app/admin/preview-frame`) is a third client-graph caller of the host core. Its client wrapper `staff-preview-renderer.tsx` constructs a staff-preview-only RSVP capability that always resolves **`UNAVAILABLE`**, the same as the harness, and passes it client-to-client (P25). Staff can see and inspect the RSVP section. Submitting sends nothing, writes no `rsvps` row, carries no guest identity and never resolves `SUCCESS` (P33 applies). The public production host `InvitationRendererHost` is unchanged and still supplies **no** `rsvp` until Task 033.

**P31. RSVP UI semantics (RF-06D).** *Amended 2026-10-01 by RF15 "RSVP completion": three choices, MAYBE takes party size 1–20, and every invitation shows the required name input first; the original text below is superseded where it differs.* Choices are `ATTENDING` / `NOT_ATTENDING`. Party size is an integer 1–20 for `ATTENDING`; `NOT_ATTENDING` submits 0 with no party-size input. The message is optional, `null` when blank, and at most 500 characters. Personalized (`viewModel.guest` present; Product Owner APPROVED 2026-09-29): no guest-name input is rendered and the capability input sends `guestName: null`. `viewModel.guest.displayName` stays presentation-only and is never sent as, or used as, identity (K20). Non-personalized: a required name input, non-blank after `trim()` (K16). The renderer prevalidates for UX only.

**P32. RSVP state machine.** Idle → pending → one of success / invalid / unavailable / failed. Success UI appears only after a resolved `SUCCESS`. A rejected promise is shown as failure. Pending prevents duplicate submission. There is no prefill (K18).

**P33. RSVP harness honesty.** With the harness `UNAVAILABLE` capability, submitting shows the honest unavailable state. The harness never displays a success message.

### Capability ownership

**P34. Clipboard (RF-06C).** A concrete browser adapter in `templates/core/` implementing `ClipboardCapabilityV1` over `navigator.clipboard.writeText`. It returns `SUCCESS` only after the write promise resolves; `UNAVAILABLE` when the Clipboard API is absent or unusable (for example an insecure context); `FAILED` when the write rejects. There is no `document.execCommand` fallback (K22). "Copied" UI appears only after `SUCCESS`. When `capabilities.clipboard` is absent, no copy control is shown and the bank text stays selectable.

**P35. Music (RF-06C adapter, RF-06D control).**
- The host provides `capabilities.music` only when `isMusicCapabilityPermittedV1(viewModel.media.audio)` is true, meaning the audio is `RESOLVED` (K24).
- **Degraded-state rule (Product Owner decision, 2026-09-29):**
  - audio `RESOLVED` and `sections.music` true → a music control **may** render, operating only through `capabilities.music`;
  - audio absent → no capability, no control, no indicator;
  - audio `UNAVAILABLE` → no capability, no control, no indicator.

  In neither degraded case is a disabled music button, broken-music icon, "music unavailable" text or placeholder control rendered. The honest degraded state is the absence of the feature. It never presents a broken or non-actionable interaction. With `sections.music` false, no music control renders even when the capability is present.
- The controller owns at most one current audio instance at a time (*corrected 2026-10-01 after the RF-06C sticky-`ERROR` patch; previously "one audio instance per rendered invitation"*). A `BLOCKED` (autoplay/policy) retry reuses the current instance. After a genuine `ERROR` the failed instance is discarded, and the next explicit user `play()` creates a fresh one; nothing is retried automatically. Initial status is `PAUSED`, with no autoplay. `play()` runs only from an explicit user gesture, and loop is `true`.
- A browser autoplay/user-agent policy rejection (`NotAllowedError`) → `BLOCKED`. Any other expected playback failure (media error, decode or network failure) → `ERROR`. Expected `BLOCKED`/`ERROR` outcomes resolve the command promise and never reject it. Unexpected faults may reject (K23, K25).
- The current `status` stays authoritative: the renderer shows playing only while `status === "PLAYING"`, handles rejection without showing success, and never leaves an unhandled rejection.
- There is no volume or mute control in v1. A later explicit gesture may retry after `BLOCKED`/`ERROR`, but nothing retries automatically.
- *Amended 2026-10-03 (Product Owner APPROVED, "Opening-gesture music"):* the explicit "Mở thiệp" envelope activation is an approved user gesture that may start the music.
  - In the same click, while the envelope is sealed, the root makes one `play()` attempt through the existing `capabilities.music` and the same toggle path as the music control (`startMusicOnOpen`).
  - It only happens where a music control may render, and never when the status is already `PLAYING`.
  - `BLOCKED` / `ERROR`, the explicit retry from the music control, and the rule against page-load autoplay or any automatic retry are unchanged.
- The adapter creates no `HTMLAudioElement` and touches no browser global during server render. The status is delivered to the renderer by rerendering with an updated capability value.

**P36. Clock (RF-06C).** The host creates `ClockCapabilityV1 { nowEpochMs }` from an explicit client epoch **after mount only**. It is absent during server render and the first client render, so no current time enters SSR output and hydration cannot mismatch. It then refreshes about every 1 second, and the interval is cleared on unmount. The clock is never persisted or shared. RF-05C derivations stay pure; the adapter is the only place that reads the current time.

### Temporal watch items (recorded, not solved here)

**P37.** None of these blocks RF-06-0:
- `Date.parse` behavior for fractional seconds that are not exactly 3 digits can differ across browsers. RF-06 fixtures use only known canonical timestamp forms. The fractional-timestamp case needs manual iOS Safari QA in RF-06E.
- ICU/tzdata differences between the server and client runtimes are a hydration risk for recently changed non-Vietnam zones. `Asia/Ho_Chi_Minh` is the primary target, and RF-06E records any mismatch observed.
- `lib/server/validation/timestamptz.ts` is pure but lives under a server path and is already in the client graph through RF-05C (P45).
- Invalid temporal data must be validated **before** a real public renderer invocation. RF-05C throws on invalid input (K27). The harness uses only valid fixtures. Upstream validation belongs to Review/Publish/public integration, not RF-06.

### Harness boundary

**P38. Internal development harness.** RF-06 may add an internal, fixture-driven harness route (RF10). It is **not** staff preview, not a public invitation route, and not a Review/Publish flow. It must:
- return `notFound()` when `process.env.NODE_ENV === "production"` and be `noindex`/`nofollow` (the same gate as the Task 029 prototype route). This check lives in exactly one dedicated **harness server gate module** (the harness route segment's server `layout.tsx`, as in Task 029), which is the only harness module permitted to read `process.env`, and it reads only `process.env.NODE_ENV` (P39);
- use deterministic, fictional fixtures only, with no real customer data;
- use no Supabase, database, `service_role` or network;
- run the real pipeline: fixture canonical records → RF-02 `buildSnapshotPayload` → RF-03 media resolution with a deterministic fixture `MediaResolver` (covering both `RESOLVED` and `UNAVAILABLE`) → RF-03 ViewModel → RF-04 selection → host;
- cover COMMON/GROOM/BRIDE, personalized/unpersonalized, long and playful guest names, with/without gallery, music and gift, unavailable media, and missing optional content;
- supply only the `UNAVAILABLE` RSVP capability (P30), never a fake success.

Harness fixture images are fictional and rights-safe. They are harness-owned, and never placed under `public/renderers/**` or referenced by renderer code.

**P39. Tests.** Renderer tests run in the existing Node/Vitest environment. Static markup assertions use `react-dom/server`, and interaction logic (RSVP state machine, dialog state, countdown display state) is factored into pure, unit-testable modules. RF-06 adds no jsdom, Playwright or other package (CLAUDE.md §24). Browser, device, visual and accessibility QA in RF-06E is manual evidence at 360/390/430 px and desktop, including iOS Safari and reduced motion. A static boundary test covers `templates/**` and the harness: no `app/internal/prototypes` import, no `public/prototypes` reference, no Supabase/`service_role`/`process.env`, no `navigator`/`Audio`/`Date.now` outside the named RF-06C adapter modules, no `execCommand`, no `MAYBE`, and no external font URL. **Single `process.env` exception:** the harness server gate module (P38) may read `process.env.NODE_ENV`, and nothing else, solely to return `notFound()` in production. No other environment variable, and no `process.env` access in any other harness module, is permitted. The exception never applies to `templates/**`, renderer components, the host, adapters or capability code, where `process.env` stays forbidden without exception (P26).

### RF-06 vs Task 030

**P40. RF-06 delivers and ends with:** the frozen production key (P14); the full production manifest, validator and projection (P15–P21); the server-safe compatibility registry (P27 A); the client binding registry (P27 B); the client host (P24); Elegant Editorial v1 (P7–P13); the clipboard, music and clock adapters (P34–P36); harness-only RSVP `UNAVAILABLE`/test behavior (P30); the deterministic harness and tests (P38–P39); visual, device and accessibility QA (RF-06E); and final verification (RF-06F).

**P41. RF-06 does not own:** catalog seeding (RF9, a later data-only migration checkpoint, whose rows must equal P14/P16 exactly: `templates.code`/`event_type`/`name`, `template_versions.version_number`/`renderer_key`, and a `manifest` whose Task 028 subset equals `design`); a concrete Supabase `MediaResolver`/signing adapter; the staff preview route/API (RF10); `create_review_version`; review orchestration; publish; public `/i/[slug]`; guest-token resolution; the persistent RSVP endpoint (Task 033); template activation or certification beyond the RF-06 renderer gate (`docs/TEMPLATE_SYSTEM.md` §25; full certification also needs real RSVP and music QA on real data); and other renderer families (Vietnamese Heritage, Romantic Minimal). RF-06F PASS satisfies RF16 item 16. **Task 030 begins only after the RF-06F gate passes** and every other RF16 item is met.

### Checkpoint sequence and process

**P42. Sequence.** Dependencies are strictly `RF-06-0 → A → B → C → D → E → F`.

| Checkpoint | Scope |
|---|---|
| RF-06-0 | This docs-only clarification |
| RF-06A | `RendererProductionManifestV1` type, validator/projection, `RendererProductionManifestInvariantError`, the Elegant Editorial v1 manifest constant, the server-safe production compatibility registry (P27 A), and deterministic pipeline fixtures (Snapshot → media → ViewModel → selection) with tests |
| RF-06B | Static Elegant Editorial v1 renderer; production binding registry (P27 B) and host rendering with an **empty** capabilities object; internal harness (P38); production-safe fonts (P3) and assets (P4–P6); key-set equality test |
| RF-06C | Clipboard, music and clock adapters (P34–P36); the harness RSVP `UNAVAILABLE` capability (P30); host capability wiring |
| RF-06D | Interactive islands: envelope/opening, gift dialog, RSVP UI state machine (P31–P33), music control, live countdown, reveal and reduced motion |
| RF-06E | QA execution and evidence (P39) plus final documentation synchronization. No production code |
| RF-06F | Verification-only final gate. No implementation commit |

**P43. Per-checkpoint process.** RF-06-0 and RF-06A–D: author → local checks (lint, typecheck, tests, build) → **true independent review** → commit/push/freeze. RF-06E: QA/docs authoring only → independent review → freeze. RF-06F: verification only, with no implementation commit. No checkpoint absorbs another checkpoint's responsibility.

**P44. Defect handling in RF-06E/F (mandatory; overrides the discovery plan's "QA fixes within RF-06 files").** Once RF-06A/B/C/D has passed independent review and been frozen, neither RF-06E nor RF-06F may modify its production code, even silently. If RF-06E or RF-06F finds a production defect:
1. RF-06E (or F) reports **BLOCKED**;
2. the defect is classified to its owning checkpoint: manifest/foundation → A; static renderer, assets, styles, fonts or copy → B; capability adapter or host wiring → C; interaction/motion → D;
3. a targeted patch is authored under that owning checkpoint;
4. focused and regression tests are run;
5. a **true independent** patch review is performed;
6. the owning checkpoint is committed, pushed and re-frozen;
7. RF-06E is rerun **from the beginning** (and RF-06F after it).

RF-06E owns only QA execution/evidence, final documentation synchronization and non-code reporting.

### Technical debt (non-blocking)

**P45.** Recorded as follow-up debt. RF-06 isolates the production renderer from each item where required (P3, P6, P11), but no RF-06 checkpoint cleans any of them up:
- the global external Google Fonts `@import` in `app/globals.css`;
- global Tailwind preflight dependence outside the renderer scope;
- `lib/server/validation/timestamptz.ts` (pure) living under `lib/server/`, and likewise the pure Task 028 `validateTemplateDesignManifest` under `lib/server/project-design/`, which RF-06 reuses from `templates/core/` (P19);
- the legacy, dead `app/internal/prototypes/invitation/_directions/elegant-editorial/` directory (removal still needs explicit approval, CLAUDE.md §32);
- the large Task 029 prototype PNGs (about 11 MB of Elegant Editorial decor; about 40 MB across all prototype decor);
- the `server-only` package is not installed, so server-only imports are enforced by static tests rather than by the package.

### Superseded / scoped wording

**P46.** Competing-wording review (2026-09-29). For RF-06 this section:
- **Concretizes:** RF14 "Fonts" (P3 is the explicit font-library decision); RF9 "rendererKey and manifest frozen in code and docs first" (P14–P16); RF10 harness (P38); RF-04 R3 "RF-06 may freeze a larger full production manifest" and K37/K38 (P15–P19, P27); R24 (P14); and K19 "future preview harness … `UNAVAILABLE`" (P30).
- **Supersedes, for this key only:** R4/R15/K39 "no production key" (P14).
- **Tightens:** RF14 "immutable once certified or released" (P22 freezes at RF-06F).
- **Leaves unchanged:** conceptual examples such as `wedding.elegant-editorial.v1` in `docs/TEMPLATE_SYSTEM.md` §5, `docs/ARCHITECTURE.md` §10, `docs/DATABASE.md` §12–§13 and `docs/PHYSICAL_DATABASE_PLAN.md` §2.10–§2.11; the conceptual manifest word-list in `docs/TEMPLATE_SYSTEM.md` §6; and the `docs/ROADMAP.md` Week 3 "architecture proving template" wording. All of these are compatible with this section.

No real contradiction was found. Other documents are synchronized with this section in RF-06E (P42).

## Elegant Editorial Production Design Baseline — Task029 Reconciliation + Product Owner Rulings

**Status:** docs only. Frozen after true independent review at commit `f4e76a21c8ffb425b216eb8e42159e68257d075a` (*status corrected 2026-10-01, RF-06E closeout; it previously still read "not yet frozen"*). That freeze makes this addendum frozen historical documentation, not authority over later rulings: Task029 (`GreenIvoryEditorialPrototype`, B1) remains the direct approved visual source, and later explicit Product Owner rulings (for example Micro-Checkpoint 10) override any stale derived interpretation recorded here. Product Owner rulings Design Baseline A1 and Design Baseline D1–D13 dated 2026-09-30. This addendum does **not** rewrite RF-06-0 (P1–P46) or any RF-05 rule (K1–K45); every one of them stays in force. It adds the Product Owner's design decision for Elegant Editorial v1 (`wedding.elegant-editorial.v1`) and the process for remediating the RF-06B/RF-06D output against it.

**Checkpoint state when authored.** Branch `weddingclick-v2`, HEAD `5eee33b`. RF-06D frozen production baseline `ae28dca`. RF-06E: **BLOCKED**. RF-06F: **not started**. Task 030: **not started** and still blocked (RF16, P41).

**Identifier note.** The Product Owner rulings in this addendum have these citation names: **Design Baseline A1** and **Design Baseline D1**, **Design Baseline D2**, … **Design Baseline D13**. They are a separate namespace from the historical RF-06-0 subsection headings "D1 — Fonts" … "D5 — Production identity", which keep their original identifiers and are not renamed. This addendum always cites its own rulings by the full "Design Baseline" name. Later documents, reviews and reports must do the same whenever a bare "A1" or "Dn" could be ambiguous.

### Visual authority

**B1. Visual source of truth.** The Task029 component `GreenIvoryEditorialPrototype` (`app/internal/prototypes/invitation/_directions/green-ivory-editorial/`) at commit `03131816d7966ccd9fad0e135df37bd65af7ee99` is the **visual source of truth** for Elegant Editorial v1. The Product Owner accepted the Task029 reconciliation report as the production design baseline. This makes P2 more specific: Task029 is still reference only for code (no production import of `app/internal/prototypes/**`, no prototype asset, hook, helper, data file or CSS module at runtime, and no prototype path in production). For **visual intent**, however, it is the authority.

**B2. Reconciliation rule.**

```text
TARGET PRODUCTION DESIGN
  = TASK029 APPROVED VISUAL INTENT
  + ONLY THE MINIMUM DIFFERENCES REQUIRED BY THE FROZEN RF-06 / RF-05 CONTRACT
```

Where Task029 and the frozen production contract can coexist, **Task029 wins visually**. Every production deviation from Task029 must cite a specific frozen RF-06-0 / RF-05 rule (B4) or a ruling in this addendum (Design Baseline A1, Design Baseline D1–D13).

**B3. What is not design authority.** The current RF-06B/RF-06D production appearance (`6e558a0`, `ae28dca`) is **not** a design authority. Tests that pin that implementation's drift are **not** evidence of Product Owner design approval. Remediation may update those tests (under the owning checkpoint, P44). It may never use them to justify keeping the drift.

### Required production adaptations — KEEP

**B4. Mandatory differences, not drift.** These stay mandatory. Where they differ from Task029, the difference is required and is **not** design drift:

- no prototype runtime imports or assets (P2, P6);
- WeddingClick-owned production artwork with recorded provenance (P4–P6, Design Baseline A1);
- the approved production font families (P3);
- no hard-coded "Đà Nẵng" (P7);
- Hero media is the cover only, with the required typographic Hero fallback (P7, Design Baseline D4);
- no photo cluster (P7); groom/bride portrait media only through the optional RF7-amended `media.portrait` slots (2026-10-01);
- no Timeline and no Dress Code section (P7);
- Love Story is text-only (P7, Design Baseline D8);
- the canonical invitation message is rendered verbatim, and the guest line is separate (P7, Design Baseline D1);
- canonical family fields and order (P7, RF4, RF5);
- RF-05C ceremony date/time behavior, and a separate lunar label (P7, K32);
- the Monday-first 42-cell calendar (K33);
- canonical event order and data, with no lunar text on events (P7, RF2, RF6);
- the countdown is clock-gated and has the required passed state (P7, K27–K29, Design Baseline D7);
- canonical gallery order, with `UNAVAILABLE` slots kept in place (P7, Design Baseline D9);
- operational-side gift rules and no `QR_COMMON` (P7, RF13);
- truthful clipboard behavior (P34, K22);
- music is capability-gated, with no autoplay (P35, K24–K25);
- RSVP is capability-gated; *amended 2026-10-01 (RF15 "RSVP completion"): choices `ATTENDING` / `MAYBE` / `NOT_ATTENDING`; party size 1–20 for ATTENDING / MAYBE; every RSVP has the required name input first;* success appears only after an actual `SUCCESS` (P30–P33, K16–K19);
- the opening is skippable and never permanently blocks content (P13);
- the gift dialog is a bottom sheet on mobile and a modal on desktop (P13);
- the production desktop column is about 480 px (P12);
- no horizontal overflow (P11);
- no invented customer or media data (P7);
- the reduced-motion rules (P13).

### RESTORE Task029 design

**B5. Restore scope.** Production restores the Task029 visual design, except where B4 or a ruling below requires a difference. "Task029" means the B1 commit. Each item names what to restore, then the constraint that applies to it, if any. The numbers below are item identifiers only. They are **not** the renderer section order, which is fixed by the authoritative target root order after this list.

1. **Opening artwork.** Green envelope, ivory liner, gold 囍 seal and moss opening cover. Artwork follows Design Baseline A1.
2. **Tap target.** The envelope is the primary tap target.
3. **Hint copy.** "Chạm vào thiệp để mở".
4. **Opening choreography.** Seal → flap → cover-photo card rise → dissolve. No-cover behavior follows Design Baseline D3. Skip follows Design Baseline D2.
5. **Photo-led Hero.** "Save the date"; couple names on one line by default (Design Baseline D5); a small inline gold serif "&"; the dotted `DD.MM.YYYY` date, derived by RF-05C, with no location suffix (B4); no ceremony-title line when cover media is resolved. Fallback follows Design Baseline D4.
6. **Couple / story.** The approved Great Vibes quote ("Hôn nhân là chuyện cả đời." / "Yêu người vừa ý, cưới người mình thương."); asymmetric left/right text plates (typographic without portrait media, B4; RF7 amendment 2026-10-01: the optional portrait slots may add the Task029 portraits in a later visual checkpoint); the floral divider (Design Baseline A1 artwork); no visible "Cô dâu & Chú rể" heading.
7. **Families.** The line–❧–line ornament; two columns with a central divider; the approved side labels ("Nhà Trai" / "Nhà Gái", chosen by explicit `side`, P7); no visible section heading; no family address.
8. **Invitation message.** No visible "Thư mời" heading; Task029 message typography. The guest line follows Design Baseline D1.
9. **Ceremony.** The shared sage-gradient ceremony band; the approved two-part date composition; inline "Tức ngày" as separate label copy next to the verbatim `lunarDateDisplay` (P7, K32); `WEEKDAY · HH:mm` presentation from RF-05C.
10. **Calendar.** The approved moss card and bouquet composition (Design Baseline A1 artwork); the two-line intro "Đám cưới của chúng mình" / "Sẽ diễn ra vào"; a Great Vibes month; no visible year; no visible section heading; out-of-month cells of the K33 42-cell grid rendered blank; a pulsing heart on the ceremony day, disabled under reduced motion. Column order is Monday → Sunday (K33), not Task029's Sunday-first order.
11. **Events.** The approved card hierarchy; a 34 px dotted date; "HH:mm - Weekday"; an uppercase venue; a square "Xem chỉ đường" button (only when `mapUrl` exists, P7); no visible "Chương trình" heading; no event lunar text (B4). The side tag follows Design Baseline D6.
12. **Countdown.** Placed after Events; the approved ✦ transition; the kicker is exactly **"Đếm ngược"**; ivory background; unboxed cells with a top rule; unpadded values; labels "Ngày" / "Giờ" / "Phút" / "Giây"; no "Hẹn ngày chung vui". Clock gating follows B4. The passed state follows Design Baseline D7.
13. **Love story.** A dark moss band spanning the full column width; a gold quote mark; white-soft italic text; no visible heading; no bordered light card. Height follows Design Baseline D8.
14. **Gallery.** The approved 4-column editorial grid, 44 px row rhythm and 10-slot cyclic layout (Task029 `GALLERY_LAYOUT`). Tail handling follows Design Baseline D9. Task029 also shows the kicker "Album ảnh cưới" (category A copy).
15. **Gift.** Placed after RSVP and before Gallery; the approved note ("Sự hiện diện của bạn là món quà quý giá nhất. Nếu muốn gửi lời chúc mừng, gia đình xin phép nhận tại đây."); a square moss "Gửi quà cưới" CTA; the Task029 visual language; no visible "Hộp mừng cưới" heading. The dialog uses the Task029 row labels "Ngân hàng" / "Chủ tài khoản" / "Số tài khoản" and "Sao chép" / "Đã sao chép", which appear only after `SUCCESS` (P34). Side rules follow B4.
16. **RSVP.** The approved bordered card; the two-line heading "Xác nhận tham dự" / "& Gửi lời chúc"; Task029 copy where it is compatible with the frozen contract: name placeholder "Nhập tên của bạn" (unpersonalized only, P31), select label "Bạn có thể tham dự không?", choices "Sẽ tham dự" (`ATTENDING`) and "Tiếc quá, không tham dự được" (`NOT_ATTENDING`), and message placeholder "Gửi lời chúc đến cô dâu & chú rể…". Task029's "Sẽ cố gắng tham dự" is `MAYBE` and is excluded (B4). Square controls; submit copy "Gửi lời chúc". Party size follows Design Baseline D10, success/edit follows Design Baseline D11, and input font size follows Design Baseline D12.
17. **Closing.** The dark moss gradient band; a gold ❧; the exact Task029 closing copy ("Sự hiện diện của bạn là niềm hạnh phúc trọn vẹn nhất trong ngày cưới của chúng tôi. Xin chân thành cảm ơn."), rendered as Task029 renders it: **one flowing italic paragraph** in the beige-on-moss treatment that wraps naturally, with no forced line breaks and no `white-space: pre-line` behavior. The newline characters in the Task029 source data do not create a required three-line composition. Then the inline couple names in white-soft and a gold dotted date.
18. **Music.** Top-right; 40 px; ivory/gold idle treatment; ♪ (idle) / ♫ (playing); a pulse only while `status === "PLAYING"`; safe under reduced motion. Presence follows P35.
19. **Section reveals.** In the Task029 style: fade plus a rise of about 22 px, once per element. CSS or `IntersectionObserver` is allowed. Content is visible without JavaScript and under reduced motion (P13). No new package (P13, CLAUDE.md §24).
20. **Square corners.** The square-cornered control language wherever Task029 uses it.
21. **Palette details.** `#4a5240` for body/message text; `#6f7a63` for secondary, lunar and address text; `#d0433a` for the heart; `#5c7052` for the opening highlight; the Task029 gold-alpha hairlines; beige-on-moss treatment. Bronze follows Design Baseline D13.
22. **Great Vibes scope.** Great Vibes is used only for the approved couple quote and the calendar month.

The Task029 cover composition (reading order label → names → date → envelope → hint) is part of the visual reference under B2. Design Baseline D1 keeps the guest line off the cover.

**Target root order (authoritative).** The renderer's root flow is exactly:

```text
Opening → Hero → Couple → Invitation message → Families → Ceremony → Calendar → Events
  → ✦ → ✦ → Countdown → Love Story → RSVP → Gift → Gallery → Closing
```

- Music is a floating control. It is **not** part of the root flow.
- The two consecutive ✦ ornaments are **intentional**. Task029 has Events → ✦ → Timeline → ✦ → Countdown. The frozen production contract removes Timeline (P7), so the faithful reconciled result keeps both ornaments. They are not collapsed into one.
- This statement overrides any ordering implied by the B5 item numbers. In particular, Invitation message comes before Families, Countdown comes after Events, RSVP comes before Gift, and Gift comes before Gallery.

### Design Baseline A1 — Decor asset route (RESOLVED)

**Design Baseline A1.** The existing Task029 prototype PNGs are **not** shipped, because their production provenance and rights are not sufficiently documented (P4). Production uses a **new WeddingClick-owned decor set** created specifically for Elegant Editorial v1. It faithfully reproduces the approved Task029 visual intent **without copying undocumented source pixels**.

- **Required visual targets:** green envelope; green hinged flap; ivory/gold liner; gold 囍 seal; the rising ivory-framed cover-card treatment; the calendar botanical corner bouquets; the couple floral divider; ❧ / ✦ / heart motifs where appropriate.
- **Media type:** original SVG/vector artwork for geometry and symbols, and original raster artwork where photographic or botanical fidelity requires it. Do not force everything into simple SVG if that materially loses the approved Task029 appearance.
- **Requirements:** created and owned by WeddingClick for this renderer; provenance recorded in `templates/wedding/elegant-editorial/v1/PROVENANCE.md` (the P5 location, never under `public/`); production files only under `public/renderers/wedding/elegant-editorial/v1/`; within the P6 payload budget; no Task029 runtime asset dependency; no copied undocumented prototype pixels.
- **Status:** RESOLVED — new WeddingClick-owned, design-matched production artwork. Creating the assets is step 4 of B9. It is not part of this docs addendum.

### Product Owner rulings Design Baseline D1–D13 (all RESOLVED)

**Design Baseline D1 — Guest line.** *Amended 2026-10-01 (Micro-Checkpoint 10 Product Owner ruling): v1 renders a two-line block, line 1 "TRÂN TRỌNG KÍNH MỜI", line 2 the trusted `viewModel.guest.displayName` or "Quý khách"; no invitation message follows (P7 invitation-message row). The original wording below is superseded where it differs.* The separate guest line is exactly:
- **Personalized** (`viewModel.guest` present): **"Trân trọng kính mời {guest.displayName}"**. `{guest.displayName}` is the canonical runtime `viewModel.guest.displayName`, used as presentation only and never as identity or authorization (K20).
- **Unpersonalized** (`viewModel.guest` absent): **"Trân trọng kính mời Quý khách"**.

"Trân trọng kính mời" is the salutation identified during reconciliation. "Quý khách" is the existing approved default guest copy (P7, P10). No new brand wording is introduced.

**Placement.** The guest line is rendered immediately **before** the canonical invitation message, in the same Task029 invitation-message composition and Task029 serif/message visual language. It is **never** on the opening cover and never in the Hero.

**Message and persistence.** The invitation message stays the canonical `viewModel.content.invitationMessage`, rendered **verbatim** (P7). The guest is never interpolated into it. The guest line is presentation only and is never persisted as customer data.

**Design Baseline D2 — Skip control.** A small, understated text link below the Task029 hint. Its exact visible copy is **"Bỏ qua"**. It is in the same family and mood as the hint, visually secondary, and not a pill or button. It must remain accessible and keyboard-operable (P13).

**Design Baseline D3 — No-cover opening.** When `media.cover` is absent or `UNAVAILABLE`, no photo card rises. The envelope flap still opens, the cover dissolves, and the page continues to the Hero fallback (Design Baseline D4). No image media is fabricated.

**Design Baseline D4 — Hero fallback.** When the cover is absent or `UNAVAILABLE`, the fallback uses the same Hero zone and Task029 visual language on a moss-deep background. It shows names, ceremony title and date (P7), keeping Task029 alignment, typographic hierarchy as closely as possible, and the small inline serif "&". The ceremony title appears **only** in this fallback state, never over a resolved cover image.

**Design Baseline D5 — Long names.** Names stay on one line by default. When they genuinely cannot fit at the supported width, they wrap naturally and keep the inline small serif "&". The current stacked-name composition is not forced. Names are never reduced below 18 px, and there is no horizontal overflow. This is a responsive exception, not a new composition.

**Design Baseline D6 — Event side tag.** In `COMMON`, a side tag is shown only for events whose `side` is `GROOM` or `BRIDE`. There is no tag for `COMMON`-side events (since the 2026-10-01 ceremony-card amendment every card is a GROOM or BRIDE card, so each COMMON card carries its "Nhà Trai" / "Nhà Gái" tag). In `GROOM` and `BRIDE`, no redundant side tags are added. (Task029 shows a tag only when more than one operational side exists, which never happens for a side-specific variant.)
Rule of Three: COMMON → tag on GROOM/BRIDE-side events only; GROOM → no tags; BRIDE → no tags.

**Design Baseline D7 — Countdown passed state.** The exact passed-state copy is **"Ngày vui đã đến"**, in the approved countdown kicker typography and visual language. It is **not** Great Vibes. Live countdown values never return after the ceremony has passed, and negative values are never shown (P7, K28).

**Design Baseline D8 — Love Story height.** Production has no Love Story background photo, so the band uses content-driven height with balanced vertical padding derived from Task029, instead of the photo-driven 420 px minimum. It must still read as the Task029 dark moss editorial band.

**Design Baseline D9 — Gallery tail.** The 10-slot Task029 pattern repeats cyclically. A final lone half-width tile that would otherwise leave an awkward empty pair spans the full width instead. Canonical media is never reordered, and an `UNAVAILABLE` item keeps its canonical slot (P7).

**Design Baseline D10 — RSVP party size.** The exact visible label is **"Số người tham dự"**. The control is a numeric select from 1 to 20, shown only for `ATTENDING` (`NOT_ATTENDING` submits 0, P31). It uses Task029 form visual language and square controls.

**Design Baseline D11 — RSVP success / edit.** The exact Task029 success wording is used, with no invented replacement copy:
- `ATTENDING`: "Cảm ơn {name} đã phản hồi — rất mong được đón tiếp!"
- `NOT_ATTENDING`: "Cảm ơn {name} đã phản hồi!"
- a quoted recap of the message when one was sent;
- the edit action "Sửa lại".

`{name}` is **presentation only**. Unpersonalized flows use the name the user typed; personalized flows use `viewModel.guest.displayName`. The frozen submission contract is unchanged: personalized submissions still send `guestName: null` (P31, K16). The success UI appears only after a resolved `SUCCESS` (P32, K18). "Sửa lại" is a local return to the form, not a K18 current-RSVP prefill. Any resubmission goes through `capabilities.rsvp` again.

**Design Baseline D12 — Input font size.** Interactive text inputs, selects and the textarea use **16 px** on mobile to avoid iOS focus zoom. This is an allowed usability adaptation. Everything else keeps Task029 typography.

**Design Baseline D13 — Bronze.** The approved Task029 bronze **`#8c6f4e`** is restored. The implementation value `#7d6243` is not kept merely because the implementation changed it. If RF-06E accessibility certification later shows a mandatory accessibility failure, that specific evidence goes back to the Product Owner before this token changes. There is no pre-emptive redesign.

### Copy authority

**B6. Brand-visible string provenance.** Every brand-visible string in Elegant Editorial v1 must map to exactly one of:

- **A** — exact Task029-approved copy (B1 commit);
- **B** — explicit frozen contract copy (RF-06-0 / RF-05);
- **C** — necessary runtime, error or accessibility copy;
- **D-ID** — one of the Product Owner rulings in this addendum (Design Baseline A1, Design Baseline D1–D13).

No replacement visual or brand copy is invented. Tests never grant design approval. Specific rulings:

- **"Save the date"** — Task029-approved (A). **KEEP.**
- **"Đếm ngược"** — Task029-approved (A). **RESTORE** as the countdown kicker.
- **"Hẹn ngày chung vui"** — implementation-chosen, **not** Product Owner approved. **REMOVE** from the live countdown heading.

Removing a *visible* section heading (B5) does not forbid an accessible name for that section. Such names are category C copy, used only where accessibility needs them.

### Visual acceptance gate (mandatory)

**B7. Rendered evidence for every visual remediation checkpoint.** This applies to the RF-06B and RF-06D remediation checkpoints and the RF-06E rerun. It adds to the P39 manual QA and does not replace it.

- **Widths:** 360 / 390 / 430 px for both Task029 and production. Production is also checked at 768 and 1280 px.
- **Evidence:** full-page screenshots; side-by-side Task029 vs production; crops of every changed section; opening-sequence frames; Gift dialog states; RSVP states; reduced-motion evidence; long-name evidence.
- **Scenarios:** `COMMON`, `GROOM`, `BRIDE`; personalized and unpersonalized.
- **Pass criteria.** A visual checkpoint **cannot PASS solely because automated tests pass**. The reviewer must show that:
  - no unauthorized visual drift remains in the changed scope;
  - every visible string has B6 provenance;
  - every Task029 deviation cites a frozen production constraint (B4) or a Product Owner ruling;
  - there is no horizontal overflow;
  - production decor meets the Design Baseline A1 / P5 / P6 payload and provenance rules.

### Remediation ownership

**B8. Owner patches (P44 classification, made concrete for this remediation).** Owners are never merged into one implementation patch.

| Owner | Scope |
|---|---|
| **RF-06B** | static composition; root section ordering; visible/static copy; static typography; palette; static section appearance (Hero, Couple, Families, Message, Ceremony, Calendar, Events, Love Story, Gallery, Closing); static Gift placement and intro; static opening artwork and markup; production decor and provenance (Design Baseline A1) |
| **RF-06D** | opening overlay activation and choreography; card rise; skip interaction; countdown interactive presentation and passed state; music visual interaction; Gift dialog tabs, copy and interaction; RSVP interaction and presentation; scroll reveal; envelope float; calendar heart pulse; reduced-motion behavior |
| **RF-06C** | **no design remediation**. Only the separately tracked sticky music `ERROR` retry defect |

### Remediation sequence (frozen)

**B9.**

1. Design Baseline addendum authoring (this section)
2. **True independent** Design Baseline review
3. Design Baseline commit / push / freeze
4. WeddingClick-owned production decor creation plus provenance (Design Baseline A1)
5. RF-06B visual remediation — author
6. **True independent** RF-06B remediation review
7. RF-06B remediation commit / push / refreeze
8. RF-06D visual/interaction remediation — author
9. **True independent** RF-06D remediation review
10. RF-06D remediation commit / push / refreeze
11. RF-06C sticky-music-`ERROR` owner patch
12. **True independent** RF-06C patch review
13. RF-06C commit / push / refreeze
14. RF-06E rerun **from the beginning**, including the B7 visual acceptance gate
15. RF-06F final verification
16. Only then is Task 030 unblocked

Each owner patch follows P44 steps 3–6 (targeted patch, focused plus regression tests, true independent review, commit/push/refreeze). Running RF-06D before RF-06C here does not reopen the P42 dependency order. The RF-06C item is an independent defect patch, and RF-06E reruns from the beginning after all three.

### RF-06E closeout — Product Owner process waiver (2026-10-01)

**B11.** The RF-06E rerun (B9 step 14) ran at HEAD `8a2dbc2` (Elegant Editorial freeze `7c066ef`, RF-06C sticky-`ERROR` freeze `8a2dbc2`). Its static contract, security and documentation QA result is **PASS**, with no production blocker. It did not produce B7 rendered evidence or P39 manual-device evidence.

**Decision.** The Product Owner explicitly **waives** producing a **new** B7 visual evidence matrix (360 / 390 / 430 / 768 / 1280 px) and **new** manual-device music evidence before RF-06F. RF-06E may proceed to RF-06F on the basis of this explicit process waiver.

**Context.**
- Elegant Editorial v1 already had direct Product Owner live visual approval before its freeze.
- Final integration ran 390 px primary and 1280 px sanity checks.
- The independent renderer review passed.
- The RF-06C owner tests passed, and so did the true independent RF-06C patch review.
- Another full screenshot/device evidence cycle would duplicate evidence that already exists.

**Limits.** This is a process waiver only. Nothing here claims that:
- B7 evidence at 360 / 390 / 430 / 768 / 1280 px was newly captured during RF-06E;
- a real-device music `ERROR` → explicit retry → `PLAYING` path was observed.

That real-device music check stays a **deferred** manual/operational QA item. No code defect was waived, and production behavior is unchanged.

### Relationship to RF-06-0

**B10.**

- **Preserves unchanged:** P1–P46 and every RF-05 rule.
- **Tightens:**
  - P2, where Task029 becomes the visual source of truth (B1–B3);
  - P5/P6, where the prototype-PNG route is closed and new owned artwork is required (Design Baseline A1);
  - P10, where fixed copy must satisfy B6;
  - P39/P43, where the B7 visual acceptance gate is added.
- **Concretizes:** P7 guest line, Hero fallback, countdown passed copy and gallery `UNAVAILABLE` behavior (Design Baseline D1, Design Baseline D4, Design Baseline D7, Design Baseline D9); P13 skip control (Design Baseline D2); P31 party-size and success presentation (Design Baseline D10, Design Baseline D11); P44 owner classification (B8).

No frozen contract is relaxed.

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


## Social Share Cover (Product Owner decision, 2026-10-03)

- `SOCIAL_SHARE_COVER` is a project-scoped, image-only media role (migration 0035). It is the staff-chosen, replaceable social-share / Open Graph image of a published invitation, used for Zalo, Facebook and other link previews.
- It is independent of `COVER`, portraits, `PHOTO_STORY` and `GALLERY`, and may be a completely different image.
- One effective row is chosen like every single role (`sort_order`, then `id`); older rows stay so it remains replaceable. It is uploaded, replaced and deleted only through the existing Task 024 media workflow.
- It is publication metadata, not invitation-body content. It never enters the Snapshot, the `InvitationViewModel` or any renderer. The Snapshot builder accepts the row and does not project it.
- The future publish / public metadata layer resolves `SOCIAL_SHARE_COVER` → a runtime-signed absolute URL → the Open Graph / social image at metadata-generation time. Nothing is signed or stored at draft time (accessor: `lib/server/media/social-share-cover.ts`).
- When none is chosen, staff see "Chưa chọn ảnh chia sẻ". No fallback (for example to `COVER` or a Gallery image) is decided. That policy belongs to the future public-metadata task. *Decided by Task 032B: no fallback — no `og:image` when none is chosen.*

## Task 030 — Review Snapshot Foundation (2026-10-03)

Product Owner chose Option A: Draft → Review Snapshot → Customer Approval → Ready for Publish → Published. There is no Draft → PUBLISHED shortcut.

- **Required variants** come from the already-approved package rule (above, "Commercial Packages"; `docs/PHYSICAL_DATABASE_PLAN.md` §2.18 [R-Q2]): `COMMON` → `{COMMON}`, `SEPARATE` → `{GROOM, BRIDE}`, keyed by `projects.package_code_snapshot`. An unknown code fails closed. Rows for other variants are ignored by the read model and are never changed.
- **REVIEW is immutable and server-generated.** `create_review_version` (migration 0036) persists the URL-free Snapshot Payload v1 built by the Staff Preview pipeline from the current draft, with the exact `template_version_id` / renderer key the design pins. It pins exactly the extracted media refs and moves `current_review_version_id` to the newest review atomically. Older reviews are never edited.
- **Approval belongs to the exact REVIEW version.** A new review supersedes the pointer, so it needs its own approval (the 0016 `guard_approval_targets_current_review` already rejects approving a non-current version).
- **Double-submit:** compare-and-set on `current_review_version_id`; a duplicate gets 409 and creates nothing.
- **SOCIAL_SHARE_COVER** stays outside the review Snapshot and is not pinned (unchanged "Social Share Cover" decision).
- **Formerly open, now resolved** (both owner decisions are recorded in "Task 030B" below): customer review rendering/media signing, and the project status lifecycle.

## Task 030B — Customer Review, Approval and Review Status Lifecycle (2026-10-03)

Product Owner decisions, authoritative. Implemented by migration `0037_customer_review_feedback.sql`. Migration 0036 is not edited. Wire contract: `docs/API_CONTRACT.md` §17.

**A. Customer review media access: narrow service_role signing exception.** The customer REVIEW page uses the documented REVIEW access-link Path B. A server-side `service_role` Storage signer is approved **only** for runtime signing of review media **after** the opaque REVIEW token is validated:

```text
customer review token
→ Task 026 resolveAccessLink (REVIEW; 404 / 410; last_used_at)
→ get_customer_review (service_role-only SECURITY DEFINER RPC; re-validates the link)
→ only the required variants' CURRENT REVIEW versions
→ only project_media pinned to those exact versions via invitation_version_media
→ only rows the persisted Snapshot references, in the project-media bucket
→ CUSTOMER REVIEW MEDIA SIGNING ONLY signer (lib/server/supabase/customer-review-media-signer.ts)
→ short-lived runtime URLs → InvitationViewModel (never persisted)
```

This is **not** a general service_role business-data path. The signer never runs before token validation, never lists or queries arbitrary media, never reads tables, never reaches browser code, templates, domain logic, admin UI or staff paths, and is never sent in a URL. Static tests pin its single caller chain. Staff preview stays service_role-free (unchanged). `review_feedback` gets **no** service_role table grant. The 0016 `INSERT` grant is revoked, and the customer reads and writes feedback only through the two 0037 RPCs.

**Review status lifecycle (exact):**

- **The saved `projects.status` always equals the aggregate review outcome** over all required variants' CURRENT reviews (any unreplaced REVISION_REQUEST → `REVISION_REQUIRED`; else all approved → `APPROVED`; else `CUSTOMER_REVIEW`). It is recomputed in the same transaction on review creation and on every state-changing feedback.
- `CUSTOMER_REVIEW`: a current review is awaiting the customer's decision. A new current REVIEW version is unapproved, so creating one (including after `REVISION_REQUIRED` or `APPROVED`) results in `CUSTOMER_REVIEW` unless another required variant still has an unreplaced revision request. The new version must be approved again.
- `REVISION_REQUIRED`: a required variant's current review has a requested revision.
- `APPROVED`: every required variant's CURRENT review is approved.
- COMMENT never changes status. After an APPROVAL, all required variants are recomputed: any current revision request → `REVISION_REQUIRED`; else all current reviews approved → `APPROVED`; else `CUSTOMER_REVIEW`. Approving COMMON never approves GROOM/BRIDE, and approving GROOM never approves BRIDE.
- Feedback against a superseded REVIEW version never changes status. State-changing feedback against it is rejected (409). An old review URL can never approve a newer review.
- `APPROVED` does not imply `PAID`, `READY_TO_PUBLISH` or `PUBLISHED`. Task 025 payment/status rules are unchanged. Publication is Task 031.

Feedback insertion and the resulting status change happen in one transaction (`submit_review_feedback`). Review creation, the current pointer and `CUSTOMER_REVIEW` also happen in one transaction (`create_review_version` replacement).

**Implementation choices (fail closed, within the decisions above):**

1. Every customer feedback type, COMMENT included, must target the CURRENT review version of a required variant.
2. Customer feedback is accepted only while the status is `CUSTOMER_REVIEW`, `REVISION_REQUIRED` or `APPROVED`. A customer can never move a Project out of `AWAITING_PAYMENT` / `READY_TO_PUBLISH` or any other state.
3. **The first decision on a review version is final.** A REVISION_REQUEST means the version requires replacement, so an APPROVAL after it is rejected. **APPROVAL is final for that exact version**: a later REVISION_REQUEST or second APPROVAL on it is rejected (409, RV018). There is no approval withdrawal. Changes after an approval require staff to create a NEW REVIEW version, which needs fresh approval. COMMENT stays allowed on the current version and never changes status.
4. COMMENT and REVISION_REQUEST require a message. APPROVAL's message is optional.
5. `create_review_version` rejects `PUBLISHED` / `COMPLETED` / `ARCHIVED` Projects (RV010). Post-publication re-review is Task 031's decision.
6. Review creation persists the recomputed aggregate outcome (see above), so the saved status and the read model's `reviewOutcome` never intentionally disagree.
7. Activity: REVISION_REQUEST → `REVISION_REQUESTED`, APPROVAL → `CUSTOMER_APPROVED`, status change → `PROJECT_STATUS_CHANGED` (actor `CUSTOMER` for feedback, `STAFF` for review creation). Metadata holds ids only. COMMENT logs nothing (no union type).

## Task 031 — Publish Approved Review (2026-10-03)

Implemented by migration `0038_publish_invitation.sql` (`publish_invitation`), `POST|GET /api/v2/internal/projects/[id]/publish` and the Xuất bản tab. See `docs/API_CONTRACT.md` §18.

1. **Publication source is the exact approved REVIEW.** A PUBLISHED version copies the approved current REVIEW row's payload, template version and renderer key verbatim and copies its media pins. The draft is never rebuilt at publish time. `SOCIAL_SHARE_COVER` is not added.
2. **PUBLISHED versions are immutable.** Republishing appends a new PUBLISHED row from a newer approved REVIEW and moves `published_version_id`. Older REVIEW and PUBLISHED rows are never changed.
3. **Publication is per required variant.** Publishing one variant never publishes another.
4. **Lifecycle prerequisite.** Publish requires `READY_TO_PUBLISH` and `payment_status = PAID`. Approval alone never reaches `READY_TO_PUBLISH`. The Task 025 graph (`APPROVED → AWAITING_PAYMENT → READY_TO_PUBLISH` only when PAID) is unchanged.
5. **Aggregate PUBLISHED.** The Project becomes `PUBLISHED` only when every required variant's current publication is sourced from its current review. For SEPARATE that means both GROOM and BRIDE. An obsolete invitation row for an unrequired variant neither blocks nor satisfies this.
6. **Concurrency.** Compare-and-set on both `current_review_version_id` and `published_version_id`, under the Project and invitation row locks. A double submit creates one PUBLISHED row; the second gets 409 `STALE_PUBLISHED_VERSION`. Republishing the same review is 409 `ALREADY_PUBLISHED`.
7. **Open owner decision (not implemented here):** once a Project is `PUBLISHED`, `create_review_version` still rejects a new review (0037 RV010), so a fully published Project cannot be revised and republished yet. Re-opening review after publication needs a Product Owner decision on the status path.
8. The public invitation route `/i/[slug]`, Open Graph metadata, guest tokens and RSVP persistence remain future tasks.

## Task 032A — Public Published Invitation (2026-10-03)

Implemented by migration `0039_public_invitation_read.sql` (`get_public_invitation`) and `app/i/[slug]/page.tsx`. See `docs/API_CONTRACT.md` §19.

1. **`/i/[slug]` renders only the current publication.** The slug resolves to one `project_invitations` row and only the version referenced by its `published_version_id` is rendered. No publication → not-found. There is never a REVIEW or draft fallback.
2. **The PUBLISHED Snapshot is used as persisted.** It must agree with its row (variant, template version, renderer key) and its Project code; any mismatch fails closed. The renderer is selected only from `renderer_key_snapshot`.
3. **Only pinned PUBLISHED media are signed**, at request time, by a dedicated server-only `service_role` signer used after the slug resolved to an exact PUBLISHED version (Product Owner direction). Signed URLs are never persisted.
4. **`service_role` containment.** Two new narrow modules: the read-only RPC repository and the signer, imported only by the public page wiring. The RPC is `EXECUTE` for `service_role` only; `anon`/`authenticated` receive nothing and no table grant is added.
5. **Freshness.** The page is dynamic: a republish moves the slug on the next request.
6. **RSVP hidden** (production host supplies no RSVP capability) until Task 033. Open Graph is Task 032B. Guest personalization remains future work. *Superseded for RSVP by Task 033A below.*

## Task 033A — Public RSVP Foundation (2026-10-05)

Implemented by migration `0040_submit_public_rsvp.sql` (`submit_public_rsvp`), `POST /api/v2/public/rsvp` and the public client wrapper `app/i/[slug]/public-invitation-renderer.tsx`. See `docs/API_CONTRACT.md` §20. Realizes P29/P30 for the public route only.

1. **Identity model.** The public `/i/[slug]` invitation is the canonical **non-personalized** flow: every row has `guest_id` NULL. The typed name (`guest_display_name_snapshot`, RF15 "RSVP completion") is response/display data only and is **never** identity: it never looks up, creates or updates a guest or an existing RSVP. No `?guest=`, guest id, token or Project/invitation/version id is accepted from the browser. Personalized RSVP needs the guest-token issuance/resolution contract, which does not exist yet; it stays future work. *Superseded for personalized links by Task 033B1 below; the generic flow is unchanged.*
2. **Statuses** are exactly `ATTENDING | MAYBE | NOT_ATTENDING` (0032); party size `ATTENDING`/`MAYBE` 1–20, `NOT_ATTENDING` 0; message ≤ 500; name required, trimmed, non-blank, ≤ 200. Validated by the server use case and again in the RPC.
3. **PUBLISHED binding.** The slug is resolved server-side to the invitation's current `published_version_id`, which must be a `PUBLISHED` row of the same invitation and Project; the RSVP is stored against that Project. Unknown or never-published slug → 404, nothing written. No REVIEW or draft path exists. `rsvps` has no invitation/version column, so the binding is Project-level; no column was added.
4. **Duplicates.** Non-personalized submissions are unbounded (§2.20 / §J): each submission, including "Sửa lại", is a new row. The one-current-row rule applies only to personalized guests, which this task never writes.
5. **No fake success.** `SUCCESS` only after a 201 confirming the persisted row; 400 → `INVALID`, 404 → `UNAVAILABLE`, anything else → `FAILED`.
6. **Containment.** One new `service_role` module (the RPC repository), imported only by the route wiring. `EXECUTE` for `service_role` only; no table grant or RLS policy changed.
7. **Unchanged.** Staff Preview and Customer Review stay UNAVAILABLE-only (no write). `InvitationRendererHost` is unchanged and still supplies no RSVP; only the public wrapper does. Elegant Editorial v1 is visually untouched. Open Graph remains Task 032B; rate limiting remains the Task 035 pre-production gate.

## Task 032B — Open Graph + Social Share Cover (2026-10-05)

Implemented by migration `0041_public_social_share_cover.sql` (`get_public_social_share_cover`) and `generateMetadata` on `app/i/[slug]/page.tsx`. See `docs/API_CONTRACT.md` §21.

1. **`SOCIAL_SHARE_COVER` is project-level publication metadata**, independent of `COVER`, the Snapshot, the ViewModel, `invitation_version_media` and every renderer. Staff can change it without republishing; metadata reads the current effective row (`sort_order`, `id`) at request time.
2. **No fallback.** If none is chosen (or the effective row is not an image), the metadata has no `og:image`. `COVER` or Gallery images are never used.
3. **Only a published slug exposes metadata.** The RPC requires the current PUBLISHED version and derives the Project; anything else gets the generic title only.
4. **Runtime signing only.** Exactly the one returned object is signed (1 hour). The URL is never persisted or logged.
5. **Title/description.** Couple names in the canonical primary → secondary order from the PUBLISHED Snapshot, plus a fixed generic Vietnamese description. No `og:url` (no trusted site-URL configuration).
6. **`noindex` stays.** Invitations remain unindexed; Open Graph previews are unaffected.
7. **Crawler validation** needs a public HTTPS deployment. Facebook's crawler gets blocking `<head>` metadata by Next.js default; Zalo's is not in the default HTML-limited bot list, which must be verified then.
8. **Unchanged:** Task 032A rendering, Task 033A RSVP, Elegant Editorial v1, the staff "Ảnh chia sẻ mạng xã hội" control.

## Task 033B1 — Personalized Guest Link Foundation (2026-10-05)

Implemented by migration `0042_personalized_guest_link.sql`, `POST /api/v2/internal/projects/[id]/guests/[guestId]/access-link`, the page `app/i/[slug]/g/[token]/page.tsx` and the personalized branch of `POST /api/v2/public/rsvp`. See `docs/API_CONTRACT.md` §22.

1. **URLs.** `/i/[slug]` stays the generic invitation. `/i/[slug]/g/[token]` is the personalized one. The raw opaque token is the credential; no `?guest=`, guest id or name is ever identity.
2. **Token.** 256-bit CSPRNG, base64url, generated server-side (shared Task 026 crypto). Only the SHA-256 hash is stored. The raw token is returned once, in the issued path, and is never logged or put in metadata.
3. **ISSUE / REGENERATE (Product Owner correction).** `token_hash` stays NOT NULL, so every guest already has a dormant, undelivered hash that is **not** a credential. The explicit `guests.token_issued_at` (0042, nullable, existing rows NULL, no backfill) is the only issuance authority; `token_hint` is a display hint only. ISSUE needs `token_issued_at IS NULL`, REGENERATE needs it set. Both replace hash and hint in place (§2.19 [R14]) and set `token_issued_at` to now, so the old token stops resolving at once. Public resolution and personalized RSVP require `token_issued_at IS NOT NULL`. No history, one active token. Revoked guests get no link. No activity event (§7.5).
4. **Project-bound resolution.** The token resolves only on a slug of the same Project, currently published, with the guest's permitted variant (NULL → COMMON on a COMMON package only; never guessed for SEPARATE). Every failure is the same not-found, with no fallback to the generic invitation and no cross-project oracle. `revoked_at` is respected: the page is not-found, the RSVP endpoint answers 410.
5. **Personalization.** Only `guests.display_name` reaches the renderer, through the existing ViewModel `guest` overlay. Same renderer, same PUBLISHED Snapshot. No RSVP name prefill.
6. **RSVP.** The guest comes only from the token; the typed name stays response data. One logical RSVP per guest via the existing partial unique index `rsvps_guest_id_key`: first submission inserts, later ones update atomically. Generic `guest_id` NULL submissions remain unbounded (accepted limitation).
7. **Metadata.** Personalized pages emit a fixed generic title, `noindex` and `no-referrer`: no Open Graph, guest name or token. Task 032B metadata for `/i/[slug]` is unchanged.
8. **Deferred.** Rate limiting and token brute-force protection (Task 035 gate). Bulk import, messaging, QR codes and analytics are also deferred.
9. **Actors and entitlement (final alignment).** Staff creates, reviews and publishes; customers never log in or edit the Project. Guest management belongs to the **Guest Tool in the Customer Portal**: a later milestone, reached through a `project_access_links` PORTAL link (distinct from REVIEW links and guest tokens) and not implemented here. The staff endpoint is a support/back-office path. Both paths use one actor-neutral `issueGuestLink` use case that takes an already-authorized client and gateway, never a `StaffContext`. New ISSUE/REGENERATE requires an active PERSONALIZED_GUEST entitlement (non-revoked `project_addons` row, server-derived; 403 otherwise). Already-issued links are not invalidated if the add-on is later revoked; that behavior is an **open owner decision (deferred)**, and 0042 is unchanged.

## Task 033C — Private Customer Portal Foundation (2026-10-05)

Implemented by `app/portal/[token]/page.tsx`, `lib/server/customer-portal/*` and `lib/server/supabase/customer-portal-repository.ts`. No migration. See `docs/API_CONTRACT.md` §23.

1. **No customer login.** Holding the Project's PORTAL access link is the authorization. Staff still creates, completes, reviews and publishes; the Portal is not a Project editor.
2. **Existing capability reused.** `project_access_links` with `link_type = 'PORTAL'` and the Task 026 resolver, issue and rotate paths are reused. No new token architecture. Public slugs, guest tokens, REVIEW links and PORTAL links stay four distinct credentials.
3. **Post-publish only.** Content renders only when at least one invitation has a valid current PUBLISHED pointer; otherwise "not ready". ARCHIVED handling is deferred.
4. **Read-only summary from PUBLISHED data.** Couple names, rite and date come from the immutable Snapshot, never the draft. Links are `/i/<public_slug>` for published variants only.
5. **Deferred.** The RSVP list (next) and the Guest Tool (PERSONALIZED_GUEST-gated) both belong in the Portal. Also deferred: a PORTAL link listing/revoke UI and one-active-link enforcement. Several active PORTAL links are currently allowed (D2). **Pre-production requirement (Product Owner, 2026-10-05):** staff must be able to find and revoke older active PORTAL links before production or customer rollout.

## Task 033D — Portal RSVP Owner-Read (2026-10-05)

Implemented by `app/portal/[token]/portal-rsvp-list.tsx`, `lib/server/customer-portal/present-portal-rsvps.ts` and `listPortalRsvps` in `lib/server/supabase/customer-portal-repository.ts`. No migration. See `docs/API_CONTRACT.md` §24.

1. **Read-only.** The customer sees every RSVP response of their Project. The Portal has no RSVP edit/delete, no guest management and no new API.
2. **Authority.** Only the server-resolved PORTAL `projectId` scopes the read. A Project id is never browser authority.
3. **Identity.** For a personalized row, the canonical `guests.display_name` is the identity and the typed snapshot is secondary. A generic row shows its typed snapshot and is never deduplicated.
4. **Not entitlement-gated.** RSVP viewing does not require PERSONALIZED_GUEST. That add-on gates only the future Guest Tool. Reading `guests.display_name`/`invitation_variant` as RSVP context is part of the PORTAL RSVP list (PHYSICAL_DATABASE_PLAN §15), not Guest Tool access.
5. **No migration.** The existing 0018 service_role SELECT grants serve the server-only PORTAL list. A narrow explicit-column repository plus a row guard is the boundary.
6. **Still deferred.** Guest Tool, and the PORTAL link listing/revoke pre-production requirement (Task 033C item 5).

## Task 033E-A — Portal Guest Tool Foundation (2026-10-05)

Implemented by `app/portal/[token]/portal-guest-tool.tsx`, `app/api/v2/public/portal/guests/**`, `lib/server/customer-portal/portal-guest-*.ts`, `lib/server/routes/portal-guests.ts`, `lib/server/supabase/portal-guest-repository.ts`, `lib/server/auth/dormant-guest-token.ts` and `lib/domain/guest-display-name.ts`. No migration (0017 grants and constraints suffice). See `docs/API_CONTRACT.md` §25.

1. **Gated and Project-pinned.** The Guest Tool requires an active PERSONALIZED_GUEST add-on, re-checked on every request. The PORTAL token is the only customer credential; the server-resolved Project id is authoritative and the browser never sends one. A guest id is a target, never authority.
2. **Customer-editable data.** Only `display_name` and, for SEPARATE packages, the explicit GROOM/BRIDE side. COMMON is server-authoritative. A SEPARATE side is never guessed.
3. **Edit rules.** The display name stays editable after a link is issued (no regeneration or invalidation). The side locks once `token_issued_at` is set, enforced in the same conditional UPDATE (no read-then-write).
4. **Revoke.** Soft (`revoked_at`), atomic, with no delete, no restore and no RSVP change. That guest's issued link stops resolving immediately (frozen 0042). RSVP history is preserved.
5. **Link state is read-only** in 033E-A. There is no ISSUE/REGENERATE.
6. **Carry-forward to 033E-B (Owner Option A).** The 033B1 ISSUE-vs-side-change race is fail-closed (at worst a dead link) and accepted here. 033E-B must add an `invitation_variant` predicate, or equivalent race-safe protection, to the issuance replacement write. `replaceGuestToken` is unchanged in 033E-A.
7. **Unchanged deferrals.** The policy for issued links after the add-on is revoked; PORTAL link listing/revoke (pre-production); rate limiting (Task 035).
