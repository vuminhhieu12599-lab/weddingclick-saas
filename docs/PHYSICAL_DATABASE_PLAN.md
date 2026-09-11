# WeddingClick V2 — Physical Database Plan

**Task:** 001 (Revision 4 — final micro patch, two closing integrity corrections after Revision 3's review)
**Status:** Draft for external review — NOT executed. No migration has been created or run.
**Depends on:** `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/TEMPLATE_SYSTEM.md`, `docs/SECURITY.md`, `docs/DEVELOPMENT_RULES.md`, `docs/LEGACY_AUDIT.md`
**Last updated:** 2026-09-11

Revision 2's overall architecture was accepted. Revision 3 was a focused correction pass fixing 18 SQL/integrity blockers, cross-referenced by **[F#]** tags. This Revision 4 is a final micro patch fixing exactly two further items found in Revision 3's review, tagged **[G1]**/**[G2]** (see the closing "Revision 4 — Final Micro Patch" note near the end of this document). No SQL migration exists yet; this plan must pass review before Task 002 authors any `.sql` file.

---

## 0. Decisions Now Fixed (no longer open)

Four decisions were approved before Task 001 started (table naming, environment strategy, staff-authorization approach, token strategy) — unchanged, restated in `docs/DECISIONS.md`.

Five further decisions (Q1–Q5 from Revision 1) were resolved by the external review and are now fixed, not open questions:

- **Q1 — Staff visibility:** all active STAFF see and manage all Projects. `assigned_staff_id` is a responsibility/assignment label only, never an RLS visibility filter. ADMIN retains admin-only capabilities on top of the STAFF baseline. **[R-Q1]**
- **Q2 — REVIEW link liveness:** a REVIEW link is reusable/live across revision rounds; every feedback/approval row still references the exact `invitation_versions` row shown, and an approval for a version that is no longer `project_invitations.current_review_version_id` is rejected — enforced by a trigger, not just application discipline (§13, §F). **[R-Q2]**
- **Q3 — Link expiration:** `expires_at` nullable, `NULL` default, staff-set per link. **[R-Q3]** (unchanged from Revision 1)
- **Q4 — RSVP rate limiting:** no schema table in Task 001/002; recorded as a mandatory pre-production gate in `docs/SECURITY.md`, `docs/TESTING.md`, `docs/ROADMAP.md` instead of an optional consideration. **[R-Q4]**
- **Q5 — Hard delete:** no normal hard-delete UI for Customer/Project; archive/soft-delete operationally; exceptional erasure is a documented ADMIN/`service_role` procedure; no formal self-service erasure workflow required for V1. **[R-Q5]** (unchanged from Revision 1, now stated as fixed rather than open)

No open questions remain in this revision — see §Q for the closing self-check.

---

## 1. Global Conventions

### 1.1 Primary keys — **[R2]**

**Every table except `profiles`:** `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`.

**`profiles` is the sole, explicit exception:**

```text
id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
-- NOT DEFAULT gen_random_uuid() — a profile's id is always exactly
-- the Supabase auth.users id it extends, never a freshly generated one.
```

`invitation_version_media` (§13) is a pure junction table and uses a composite primary key instead of a surrogate `id` (see its definition).

### 1.2 Timestamps, money, dates, RLS

Unchanged from Revision 1: `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` (maintained by a shared `set_updated_at()` `BEFORE UPDATE` trigger); money is `INTEGER` VND with `CHECK (>= 0)`; canonical event date/time is always `TIMESTAMPTZ`, never text; every V2 table has RLS **enabled and forced** (`FORCE ROW LEVEL SECURITY`), so even the table owner is policy-bound — this matters directly for §1.3's recursion analysis.

### 1.3 SECURITY DEFINER hardening — **[R3]**

Every `SECURITY DEFINER` function in this plan (`current_user_role`, `is_staff`, `is_admin`, `log_activity`, `admin_create_profile`, `generate_project_code`, `generate_invitation_slug`, all guard/trigger functions listed per-table) follows one hardened pattern:

```text
SECURITY DEFINER
SET search_path = ''        -- empty, not 'public, pg_temp' — forces every
                             -- reference inside the function body to be
                             -- fully schema-qualified (public.profiles,
                             -- auth.uid(), public.projects, ...). This is
                             -- strictly safer than a non-empty search_path:
                             -- an empty path cannot be hijacked by a
                             -- same-named object created earlier in some
                             -- other schema on the resolution path.
```

- **Owner:** every such function must be owned by the same non-superuser schema-owner role that owns the V2 tables (in Supabase this is effectively the migration-running role), and that role **must carry `BYPASSRLS`**. This is the actual mechanism that avoids the recursion problem below — not clever policy wording alone.
- **Grants:** `REVOKE EXECUTE ON FUNCTION <fn> FROM PUBLIC;` immediately after creation, then `GRANT EXECUTE ON FUNCTION <fn> TO authenticated;` (and additionally `TO service_role` only for the specific functions server code calls from token-validated, non-Auth-session flows: `generate_project_code`, `generate_invitation_slug`, and any guard functions that also run for `service_role`-driven writes). `anon` is never granted `EXECUTE` on any of these. **Exception — `log_activity` ([F13], §2.22):** this one function is deliberately given **no** `GRANT` to any externally-reachable role after its `REVOKE FROM PUBLIC` — not `authenticated`, not `service_role`, not `anon`. It is callable only from within other `SECURITY DEFINER` business-action functions owned by the same role, which need no separate grant to call a sibling owned function. See §2.22 for why a generically-callable audit-log RPC is itself a trust gap.
- **Recursion / RLS interaction on `public.profiles` (the specific risk):** `is_staff()`/`is_admin()` both read `public.profiles`, and `profiles` itself has `FORCE ROW LEVEL SECURITY`. If `profiles`' own SELECT policy were written as `USING (is_staff())` and the helper functions' internal read of `profiles` were *itself* subject to `profiles`' RLS, evaluating the policy would call `is_staff()`, which reads `profiles` under RLS, which re-evaluates the same policy — direct recursion. **The sole mechanism that prevents this is structural, not clever policy wording:** the helper functions' owner has `BYPASSRLS`, so their internal `SELECT ... FROM public.profiles` is never subject to `profiles`' RLS policies at all, regardless of how those policies are worded. Because that is a real, unconditional guarantee (a role with `BYPASSRLS` simply never evaluates RLS on any table, full stop), `profiles`' own policies are free to call `is_staff()`/`is_admin()` directly like every other table's policies do — **[F11]**, corrected from Revision 2, which instead hand-wrote a non-recursive `auth.uid() IS NOT NULL` SELECT policy and an unauthenticated-self-update UPDATE policy as a second "safeguard." That wording was not actually a safeguard: it made `profiles` SELECT/UPDATE (self row) available to *any* authenticated session, including one with no `profiles` row at all or an explicitly deactivated one — directly contradicting §1.6's rule that a session without an active `profiles` row gets no V2 grants. There is now exactly one mechanism (`BYPASSRLS` on the helper functions' owner), and every table's policies, including `profiles`' own, rely on it uniformly.
- **Inactive profile → no authorization:** both `is_staff()` and `is_admin()` include `AND profiles.is_active = true` in their `WHERE` clause. A row existing with `is_active = false` resolves to `is_staff() = false` and `is_admin() = false` — deactivation is a real authorization change, not just a UI flag.

```text
current_user_role() RETURNS text
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  -- NULL if no row, or row exists but is_active = false.

is_staff() RETURNS boolean
  SELECT current_user_role() IN ('ADMIN','STAFF');

is_admin() RETURNS boolean
  SELECT current_user_role() = 'ADMIN';
```

### 1.4 Staff mutation boundary — **[R4]**

This corrects an underspecified point in Revision 1. The rule for every table below:

- **Normal internal business mutations** (create/update a Customer, Project, wedding details, events, media metadata, project design, guests, tasks, catalog admin, review/publish actions) are performed by Next.js Route Handlers/Server Actions using **the staff member's own authenticated Supabase session** (server-side client constructed from their session cookie/access token) — **not** the anon key called directly from a client component (V1's flaw), and **not** `service_role`. RLS (`is_staff()`/`is_admin()` policies) is therefore the real, live enforcement for all of this — not decorative defense-in-depth that's actually bypassed in practice.
- **`service_role` is reserved for exactly three situations**, none of which is "staff convenience":
  1. Customer/guest bearer-token flows (INTAKE/REVIEW/PORTAL/guest resolution) — these actors have no Supabase Auth session at all, so RLS has nothing to key off (§1.6, unchanged from Revision 1).
  2. The exceptional ADMIN/manual procedures explicitly documented as exceptions elsewhere in this plan (hard-delete of a Customer/Project, disabling a freeze trigger for a documented correction, initial admin bootstrap — §P).
  3. Functions that structurally require `BYPASSRLS` to avoid the `profiles` recursion (§1.3) — these are narrow, named, single-purpose functions, not a blanket privilege escalation for arbitrary queries.
- Every table section below states which of these two paths (authenticated-session-with-RLS vs. service-role-with-server-validation) applies to each operation, so this is never ambiguous per-table.

### 1.5 State-as-timestamp convention

Unchanged: `revoked_at`/`retired_at` nullable timestamps are the sole source of truth for active/inactive state on `project_access_links`, `guests`, `template_versions`, `project_addons` — no paired boolean.

### 1.6 Customer/guest tokens are not RLS-scoped

Unchanged from Revision 1 (see `docs/SECURITY.md` §5.2 for the synced summary): `anon` and any `authenticated` session without an active `profiles` row get no RLS grants on any V2 table; all customer/guest-token flows are served by trusted server code validating the token and then querying via `service_role`.

### 1.7 `project_code` generation mechanism — **[F2]**

Revision 2 referenced "§6" for this mechanism, which was wrong (§6 is the Money Model) and never actually defined it. This is the authoritative, complete definition; every other reference to it in this plan and in `docs/DATABASE.md` points here.

```text
CREATE SEQUENCE public.project_code_seq AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;
-- Created once, in migration 0005 alongside `projects`. Never reset — not
-- yearly, not ever. NO CYCLE means it errors rather than wrapping if it
-- somehow reached the BIGINT maximum, which is not a practical concern.

generate_project_code() RETURNS text
  SECURITY DEFINER, SET search_path = '', hardened per §1.3
  SELECT 'WC-' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY')
         || '-' || lpad(nextval('public.project_code_seq')::text, 6, '0');
```

- **`YYYY`** is the creation-time year **in `Asia/Ho_Chi_Minh`**, not UTC and not the database session's timezone — `now() AT TIME ZONE 'Asia/Ho_Chi_Minh'` converts the instant explicitly before extracting the year, so a project created at, say, `2027-01-01 02:00 UTC` (which is `2027-01-01 09:00` in `Asia/Ho_Chi_Minh`, still the same calendar year in this example, but the conversion matters near year boundaries generally) always gets the year as WeddingClick's own timezone would show it.
- **The sequence itself is never reset per year** — it is one continuously incrementing `BIGINT` for the lifetime of the system. The `YYYY` in the formatted code is a **display prefix only**, decoupled from the numeric part; two projects created in different years simply get different `YYYY` prefixes attached to whatever the ever-increasing sequence value happens to be at that moment. This is what "do not reset yearly" means physically: no per-year counter table, no `WHERE year = ...` reset logic anywhere.
- **Left-padded to at least 6 digits** via `lpad(..., 6, '0')`. This guarantees *at least* 6 digits, not exactly 6 forever — `lpad` does not truncate, so once the sequence exceeds 999,999 the numeric part simply grows past 6 digits rather than wrapping or colliding.
- **Gaps from rolled-back transactions are explicitly acceptable.** `nextval()` on a Postgres sequence is never transactional — a value it returns is never returned again, whether or not the transaction that called it commits. If a `projects` INSERT calls this DEFAULT expression and the outer transaction later rolls back, that sequence value is simply skipped forever. This is standard, expected Postgres sequence behavior, not a bug this plan needs to work around, and it does not threaten uniqueness.
- **`projects.project_code` remains `UNIQUE`** (§2.3) as a defense-in-depth constraint — the sequence already guarantees no repeat on its own, but the `UNIQUE` constraint means a mistake elsewhere (e.g., a future manual `INSERT` bypassing the `DEFAULT`) still cannot silently create a duplicate.
- **The client never calculates the next number.** `projects.project_code`'s `DEFAULT` is the `generate_project_code()` function call itself, evaluated by Postgres at `INSERT` time. Unlike `project_invitations.public_slug` (§2.13, **[F1]**), this function takes no arguments derived from sibling columns of the same row — it only reads `now()` and the sequence — so a plain column `DEFAULT` calling it is valid Postgres, with no analogue to the `public_slug` problem.

---

## 2. Complete Physical Table Definitions — **[R1]**

Every table below is fully specified: every column, exact type, nullability, default, keys, `ON DELETE` behavior, constraints, indexes, and RLS/policy intent. No "if stored here," "optional if needed," or "or equivalent" phrasing remains for anything that affects physical schema. Where a rule cannot be expressed as a plain `CHECK`/FK, the exact trigger mechanism is named and its logic given in prose precise enough to implement directly — this plan still stops short of writing the SQL bodies themselves (that is Task 002's job), consistent with "do not write migration SQL."

### 2.1 `profiles`

Purpose: internal WeddingClick identity extending Supabase Auth, 1:1.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | *(none)* | `PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`. See §1.1 — no `gen_random_uuid()` default. |
| `role` | `TEXT` | NOT NULL | *(none)* | `CHECK (role IN ('ADMIN','STAFF'))` |
| `display_name` | `TEXT` | NOT NULL | *(none)* | `CHECK (char_length(display_name) BETWEEN 1 AND 200)` |
| `is_active` | `BOOLEAN` | NOT NULL | `true` | |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | maintained by `set_updated_at()` |

Constraints: none beyond the two `CHECK`s above and the PK/FK.

Indexes: PK index only (no additional index needed — the table is small, and every lookup is by `id`/`auth.uid()`).

Triggers:
- `guard_last_active_admin()` — **[F12]**, concurrency-safe: `BEFORE UPDATE ON profiles FOR EACH ROW WHEN (OLD.role = 'ADMIN' AND OLD.is_active = true AND (NEW.role <> 'ADMIN' OR NEW.is_active = false))`. Revision 2's version counted other active admins without any locking, which is **not** concurrency-safe: under Postgres's default `READ COMMITTED` isolation, two transactions concurrently demoting *different* admins (say, the last two, A and B) each exclude only their own row from the count (`id <> OLD.id`), so transaction 1 counting "others besides A" locks/reads row B, and transaction 2 counting "others besides B" locks/reads row A — these are disjoint rows, so even a `SELECT ... FOR UPDATE` on the counted rows would **not** serialize them, and both transactions could see "1 other active admin" and both commit, leaving zero. The correct fix is a session-independent, transaction-scoped **advisory lock** that every invocation of this guard acquires *before* counting, regardless of which specific rows are involved: `PERFORM pg_advisory_xact_lock(872234501);` (a fixed, reserved constant documented here and nowhere else reused) as the very first statement in the function body. This forces every concurrent last-admin check across the whole database to run one at a time; the second transaction to acquire the lock does so only after the first has committed (or rolled back), and therefore sees the first's already-applied change and correctly computes the count. After acquiring the lock, the function counts rows with `role='ADMIN' AND is_active=true AND id <> OLD.id`; if zero, it raises an exception. See §P.2.
- `guard_self_role_escalation()` — `BEFORE UPDATE ON profiles FOR EACH ROW WHEN (auth.uid() = OLD.id AND NOT is_admin())`: raises an exception if `NEW.role <> OLD.role OR NEW.is_active <> OLD.is_active`. Lets an active non-admin update their own `display_name` (via the RLS UPDATE policy below) without being able to self-promote or reactivate themselves.

RLS: enabled + forced.

- SELECT: `USING (is_staff())` — **[F11]**, corrected from Revision 2 (see §1.3): only an authenticated session backed by an *active* `ADMIN`/`STAFF` profile may read the profile list at all. A session with no `profiles` row, or an explicitly deactivated one, gets zero rows — consistent with §1.6, closing the gap where Revision 2's `auth.uid() IS NOT NULL` wording let any authenticated user (active-profile or not) read it.
- INSERT: **no table-level INSERT policy for any role.** New profile rows are created only via the `admin_create_profile(target_auth_user_id, target_role, target_display_name)` `SECURITY DEFINER` function, which internally requires `is_admin()` (raising otherwise) before inserting — same pattern as `activity_logs` (§2.22/§14, revised per **[F13]**). This is deliberately not a raw INSERT policy so profile creation cannot be forged by a compromised staff session bypassing the admin check.
- UPDATE: `USING ((auth.uid() = id AND is_staff()) OR is_admin()) WITH CHECK ((auth.uid() = id AND is_staff()) OR is_admin())` — **[F11]**: the self-update branch now also requires `is_staff()` (which itself checks `is_active`), so a deactivated user can no longer update even their own row. Further restricted by `guard_self_role_escalation()` above.
- DELETE: no policy for any role (§C — deactivate, never delete).
- Anonymous: none. Guest/customer token: none (not applicable — profiles is purely internal).

### 2.2 `customers`

Purpose: person buying/owning a WeddingClick Project. **[R5]** — never created/linked by an INTAKE token; always staff-created before a Project exists.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `display_name` | `TEXT` | NOT NULL | *(none)* | `CHECK (char_length(display_name) BETWEEN 1 AND 200)` |
| `phone` | `TEXT` | NULL | *(none)* | |
| `email` | `TEXT` | NULL | *(none)* | |
| `contact_note` | `TEXT` | NULL | *(none)* | |
| `created_by` | `UUID` | NULL | *(none)* | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

Constraints: none beyond the `CHECK` above. No uniqueness on `phone`/`email` (a family may legitimately share a phone; not a business identity key).

Indexes: `(created_by)`; `lower(display_name)` btree for staff search (low-volume table, adequate for V1; `pg_trgm` fuzzy search is a future optimization, not required now).

RLS: enabled + forced. SELECT/INSERT/UPDATE: `is_staff()`, via the staff-authenticated-session path (§1.4). DELETE: no policy for any role (§C, §Q5 — exceptional erasure only, by manual `service_role` procedure, never through the app). Anonymous/guest/customer-token: none — the INTAKE token flow reads/writes nothing on this table (§R5, §M).

### 2.3 `projects`

Purpose: one operational customer order/event — the aggregate root.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_code` | `TEXT` | NOT NULL | `generate_project_code()` | `UNIQUE`. See §1.7 for the exact mechanism (sequence, format, timezone). |
| `customer_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES customers(id) ON DELETE RESTRICT` |
| `event_type` | `TEXT` | NOT NULL | `'WEDDING'` | `CHECK (event_type IN ('WEDDING'))` — see §A |
| `status` | `TEXT` | NOT NULL | `'NEW'` | `CHECK (status IN ('NEW','WAITING_FOR_INFO','IN_PROGRESS','INTERNAL_REVIEW','CUSTOMER_REVIEW','REVISION_REQUIRED','APPROVED','AWAITING_PAYMENT','READY_TO_PUBLISH','PUBLISHED','COMPLETED','ARCHIVED'))` |
| `deadline_at` | `TIMESTAMPTZ` | NULL | *(none)* | |
| `assigned_staff_id` | `UUID` | NULL | *(none)* | `REFERENCES profiles(id) ON DELETE SET NULL`. Responsibility label only — **not** an RLS filter (§R-Q1). |
| `service_package_id` | `UUID` | NULL | *(none)* | `REFERENCES service_packages(id) ON DELETE RESTRICT` |
| `package_code_snapshot` | `TEXT` | NOT NULL | *(none)* | |
| `package_name_snapshot` | `TEXT` | NOT NULL | *(none)* | |
| `base_price_vnd` | `INTEGER` | NOT NULL | *(none)* | `CHECK (base_price_vnd >= 0)` |
| `addon_total_vnd` | `INTEGER` | NOT NULL | `0` | `CHECK (addon_total_vnd >= 0)`. Maintained by `sync_project_commercial_totals()` (§7), not written directly by application code in normal operation. |
| `total_price_vnd` | `INTEGER` | NOT NULL | *(none)* | `CHECK (total_price_vnd >= 0)` and `CHECK (total_price_vnd = base_price_vnd + addon_total_vnd)` |
| `payment_status` | `TEXT` | NOT NULL | `'UNPAID'` | `CHECK (payment_status IN ('UNPAID','PAID'))` |
| `paid_at` | `TIMESTAMPTZ` | NULL | *(none)* | `CHECK ((payment_status = 'PAID') = (paid_at IS NOT NULL))` — **[R7]** |
| `internal_note` | `TEXT` | NULL | *(none)* | |
| `created_by` | `UUID` | NULL | *(none)* | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `completed_at` | `TIMESTAMPTZ` | NULL | *(none)* | |
| `archived_at` | `TIMESTAMPTZ` | NULL | *(none)* | |

Indexes: `(customer_id)`; `(assigned_staff_id)`; `(status, deadline_at)` for dashboard queries.

Triggers — **[R7], [F8]**:
- `guard_project_commercial_freeze()` — `BEFORE UPDATE ON projects FOR EACH ROW WHEN (OLD.payment_status = 'PAID')`: raises an exception if `NEW.payment_status <> 'PAID'` **or** any of `service_package_id, package_code_snapshot, package_name_snapshot, base_price_vnd, addon_total_vnd, total_price_vnd` differ between `OLD` and `NEW`. **[F8], corrected from Revision 2:** the `NEW.payment_status <> 'PAID'` check is the fix — Revision 2's trigger only inspected the six commercial columns and never guarded `payment_status` itself, so a plain `UPDATE projects SET payment_status = 'UNPAID' WHERE id = ...` (touching no other column) would have slipped through untouched, after which a *second* statement could freely change the six commercial columns since `OLD.payment_status` would no longer read `'PAID'` for that later statement. The freeze is now monotonic: `UNPAID → PAID` remains normal application flow (this `WHEN` clause doesn't even fire when `OLD.payment_status = 'UNPAID'`), but `PAID → UNPAID` is blocked by this same trigger, for every normal code path, with no separate reversal route. Fires regardless of role (`BEFORE` trigger applies before RLS/grant checks are even relevant to the write path). An exceptional correction/rollback requires a documented DBA/`service_role` procedure that temporarily disables the trigger — the same exceptional-procedure pattern as §Q5, never a normal app feature.

RLS: enabled + forced.

- SELECT: `is_staff()` — **all** Projects, per §R-Q1 (not filtered by `assigned_staff_id`).
- INSERT/UPDATE: `is_staff()`, via the authenticated-session path. UPDATE is further restricted by the freeze trigger above once `PAID`.
- DELETE: no policy for any role (§C, §Q5 — archive via `status`/`archived_at` only).
- Anonymous/guest token: none. Customer INTAKE/REVIEW/PORTAL: none via RLS — server-only reads of minimal display context (couple/project name, status) through `service_role` after token validation (§1.6).

### 2.4 `service_packages`

Purpose: current package catalog. Never used for historical Project pricing — Projects store snapshots.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `code` | `TEXT` | NOT NULL | *(none)* | `UNIQUE` — initial values `COMMON`, `SEPARATE` |
| `name` | `TEXT` | NOT NULL | *(none)* | |
| `description` | `TEXT` | NULL | *(none)* | |
| `price_vnd` | `INTEGER` | NOT NULL | *(none)* | `CHECK (price_vnd >= 0)` |
| `is_active` | `BOOLEAN` | NOT NULL | `true` | Retirement flag — catalog rows are never hard-deleted once referenced (§C) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

Indexes: `code` (covered by the `UNIQUE` constraint).

RLS: enabled + forced. SELECT: `is_staff()`. INSERT/UPDATE: `is_admin()` only (catalog/pricing configuration is admin-only per `docs/PRODUCT.md` §2.1). DELETE: no policy for any role — `projects.service_package_id` is `RESTRICT`, so a used package row cannot be hard-deleted regardless; retire via `is_active = false`. Anonymous/guest/customer token: none (server-only reads for price display where a customer surface needs it, e.g. PORTAL).

### 2.5 `service_addons`

Purpose: add-on catalog. Structurally identical to `service_packages`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `code` | `TEXT` | NOT NULL | *(none)* | `UNIQUE` — initial value `PERSONALIZED_GUEST` |
| `name` | `TEXT` | NOT NULL | *(none)* | |
| `description` | `TEXT` | NULL | *(none)* | |
| `price_vnd` | `INTEGER` | NOT NULL | *(none)* | `CHECK (price_vnd >= 0)` |
| `is_active` | `BOOLEAN` | NOT NULL | `true` | |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

RLS: identical intent to `service_packages`.

### 2.6 `project_addons` — **[R7], [R8]**

Purpose: add-ons purchased for a Project. Rows are per-add-on purchase snapshots; revocation is soft (never deleted), and re-adding after revocation creates a new row.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES projects(id) ON DELETE CASCADE` |
| `service_addon_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES service_addons(id) ON DELETE RESTRICT` |
| `addon_code_snapshot` | `TEXT` | NOT NULL | *(none)* | |
| `addon_name_snapshot` | `TEXT` | NOT NULL | *(none)* | |
| `price_vnd_snapshot` | `INTEGER` | NOT NULL | *(none)* | `CHECK (price_vnd_snapshot >= 0)` |
| `created_by` | `UUID` | NULL | *(none)* | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `revoked_at` | `TIMESTAMPTZ` | NULL | *(none)* | `NULL` = active/entitled |
| `revoked_by` | `UUID` | NULL | *(none)* | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `revoked_reason` | `TEXT` | NULL | *(none)* | |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | No `updated_at` — the only field that ever changes after insert is the revocation trio, which self-timestamps via `revoked_at`. |

Constraints:
- Partial unique index: `CREATE UNIQUE INDEX ON project_addons (project_id, service_addon_id) WHERE revoked_at IS NULL` — at most one **active** row per Project/add-on; a revoked-then-re-added add-on is a new row, and the old row remains as history.

Triggers — **[R7], [F9]**:
- `guard_project_addon_identity_immutability()` — **[F9]**, new: `BEFORE UPDATE ON project_addons FOR EACH ROW`: raises an exception if any of `project_id, service_addon_id, addon_code_snapshot, addon_name_snapshot, price_vnd_snapshot, created_by, created_at` differ between `OLD` and `NEW` — **unconditionally, regardless of the parent Project's `payment_status`.** These seven columns are never mutable through normal application code after insert, full stop; only `revoked_at`/`revoked_by`/`revoked_reason` may ever change, and only while the guard below still permits it. This directly replaces Revision 2's "restricted in practice... by convention" wording with an actual DB guard, and it is also what guarantees `sync_project_commercial_totals()` (below) never needs to reconcile an add-on whose `project_id` moved out from under it mid-flight — an add-on can never be reassigned to a different Project after creation.
- `guard_project_commercial_freeze()` (shared name/intent with the `projects`-table trigger, separate function body) — `BEFORE INSERT OR UPDATE ON project_addons FOR EACH ROW`: looks up `projects.payment_status` for `NEW.project_id`; if `= 'PAID'`, raises an exception. This blocks adding **and** revoking add-ons once paid — so once `PAID`, even the revocation trio becomes frozen (in addition to the identity/snapshot columns already frozen unconditionally by the trigger above).
- `sync_project_commercial_totals()` — `AFTER INSERT OR UPDATE ON project_addons FOR EACH ROW` — **[R8]**: recomputes `SELECT COALESCE(SUM(price_vnd_snapshot), 0) FROM project_addons WHERE project_id = NEW.project_id AND revoked_at IS NULL` and writes it to `projects.addon_total_vnd`, then sets `projects.total_price_vnd = projects.base_price_vnd + projects.addon_total_vnd`, in the same statement/transaction as the triggering `project_addons` write. Because the guard trigger above always runs first and blocks the write entirely when the project is `PAID`, this sync trigger only ever executes while `UNPAID` — the two triggers compose correctly by construction, not by coincidence.

Entitlement (e.g., Guest Tool) is derived as "at least one non-revoked `project_addons` row with the relevant `service_addon_id`" — never a client-supplied boolean.

RLS: enabled + forced. SELECT: `is_staff()`. INSERT: `is_staff()` (subject to the freeze trigger). UPDATE: `is_staff()` — **[F9]**: the RLS policy itself still just grants "staff may attempt an UPDATE"; which columns actually succeed is now enforced by `guard_project_addon_identity_immutability()` (identity/snapshot columns, always) and `guard_project_commercial_freeze()` (the revocation trio, once `PAID`), not by convention. DELETE: no policy for any role — revoke, never delete. Anonymous/guest/customer token: none.

### 2.7 `wedding_details` — **[R20]**

Purpose: one canonical wedding-specific detail record per wedding Project.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | `UUID` | NOT NULL | *(none)* | `UNIQUE`, `REFERENCES projects(id) ON DELETE CASCADE` |
| `groom_name` | `TEXT` | NULL | *(none)* | Nullable at the DB level — a project may exist before intake completes. Required-before-publish is enforced by the application publish-validation layer (`docs/PRODUCT.md` §10), not a DB `NOT NULL`. |
| `bride_name` | `TEXT` | NULL | *(none)* | Same rationale as `groom_name`. |
| `groom_father` | `TEXT` | NULL | *(none)* | |
| `groom_mother` | `TEXT` | NULL | *(none)* | |
| `bride_father` | `TEXT` | NULL | *(none)* | |
| `bride_mother` | `TEXT` | NULL | *(none)* | |
| `groom_family_address` | `TEXT` | NULL | *(none)* | |
| `bride_family_address` | `TEXT` | NULL | *(none)* | |
| `invitation_message` | `TEXT` | NULL | *(none)* | |
| `love_story` | `TEXT` | NULL | *(none)* | |
| `lunar_date_display` | `TEXT` | NULL | *(none)* | Display-only text; not canonical date data (§E) |
| `additional_note` | `TEXT` | NULL | *(none)* | |
| `groom_bank_name` | `TEXT` | NULL | *(none)* | **[R20]** groom-side gift account, shown on GROOM invitations and (alongside the bride-side fields) on COMMON |
| `groom_bank_account_name` | `TEXT` | NULL | *(none)* | |
| `groom_bank_account_number` | `TEXT` | NULL | *(none)* | `TEXT`, not numeric — account numbers may carry leading zeros/non-numeric formats |
| `groom_bank_qr_media_id` | `UUID` | NULL | *(none)* | QR image is a media reference, never a raw URL. Composite FK, see below — **[F6]**. |
| `bride_bank_name` | `TEXT` | NULL | *(none)* | **[R20]** bride-side gift account, shown on BRIDE invitations and on COMMON |
| `bride_bank_account_name` | `TEXT` | NULL | *(none)* | |
| `bride_bank_account_number` | `TEXT` | NULL | *(none)* | |
| `bride_bank_qr_media_id` | `UUID` | NULL | *(none)* | Composite FK, see below — **[F6]**. |

**`groom_bank_qr_media_id`/`bride_bank_qr_media_id` composite FKs — [F6]:** a plain single-column FK to `project_media(id)` (Revision 2's design) cannot prevent a QR image from a *different* Project's media inventory being pointed to — application validation alone is not a DB guarantee, per the review's explicit instruction. Corrected to:

```text
FOREIGN KEY (groom_bank_qr_media_id, project_id) REFERENCES project_media (id, project_id) ON DELETE RESTRICT
FOREIGN KEY (bride_bank_qr_media_id, project_id)  REFERENCES project_media (id, project_id) ON DELETE RESTRICT
```

requiring `project_media` to carry `UNIQUE (id, project_id)` (§2.9, added by **[F5]**/**[F6]** together — trivially true since `id` is already `project_media`'s PK, but Postgres requires the exact constraint to exist to serve as a composite FK target). Both columns are nullable, so `MATCH SIMPLE` bypasses the check when `NULL`. `RESTRICT`, not `SET NULL`, for the same structural reason given throughout this plan (§4/§B): a composite `SET NULL` would null `project_id` too, conflicting with `wedding_details.project_id`'s own separate `NOT NULL`/`UNIQUE`/`CASCADE` FK to `projects`. Effect: staff must clear a gift QR reference before deleting that `project_media` row — the same "clear the reference first" pattern already used for `guests.invitation_variant` (§2.19).
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

**Resolved design (§R20):** a small, fixed two-slot shape (groom/bride) directly on `wedding_details`, not a separate normalized "gifts" table. A normalized table would be justified for a variable-cardinality collection; here the cardinality is permanently exactly two (one per side), so a dedicated table would be pure structure without benefit. Variant resolver rule: `GROOM` invitation renders `groom_bank_*` only; `BRIDE` renders `bride_bank_*` only; `COMMON` renders both (whichever side has data — omit a side's gift section entirely if all four of that side's fields are null, per the optional-content rule in `docs/TEMPLATE_SYSTEM.md` §10).

RLS: enabled + forced. SELECT/INSERT/UPDATE: `is_staff()`. DELETE: no policy (cascades only with the parent Project). Anonymous/guest token: none. Customer INTAKE: none via RLS — a submission lands in `intake_submissions.payload`, never written directly here (§R5, §M); staff applies it. Customer REVIEW: server-only read (rendering the review payload, which is itself a frozen `invitation_versions.payload` copy, not a live read of this table — see §F).

### 2.8 `project_events` — **[R21]**

Purpose: date/time/venue records for wedding ceremony occasions.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES projects(id) ON DELETE CASCADE` |
| `occasion_type` | `TEXT` | NOT NULL | *(none)* | `CHECK (occasion_type IN ('VU_QUY','THANH_HON','RECEPTION','CUSTOM'))` — named `occasion_type`, not `event_type`, to avoid colliding with `projects.event_type` (§A) |
| `side` | `TEXT` | NOT NULL | `'COMMON'` | `CHECK (side IN ('COMMON','GROOM','BRIDE'))` |
| `title` | `TEXT` | NOT NULL | *(none)* | |
| `starts_at` | `TIMESTAMPTZ` | NOT NULL | *(none)* | Canonical instant — weekday/month/year/countdown are always derived from this, never stored (§E) |
| `timezone` | `TEXT` | NOT NULL | `'Asia/Ho_Chi_Minh'` | IANA name |
| `venue_name` | `TEXT` | NULL | *(none)* | |
| `address` | `TEXT` | NULL | *(none)* | |
| `map_url` | `TEXT` | NULL | *(none)* | `CHECK (map_url IS NULL OR map_url ~ '^https://')` — HTTPS-only, per `docs/SECURITY.md` §13 |
| `description` | `TEXT` | NULL | *(none)* | |
| `sort_order` | `INTEGER` | NOT NULL | `0` | |
| `is_primary` | `BOOLEAN` | NOT NULL | `false` | **[R21]** |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

Constraints:
- Partial unique index: `CREATE UNIQUE INDEX ON project_events (project_id, side) WHERE is_primary = true` — at most one primary event per Project/side. **[R21]**

Indexes: `(project_id)`; `(project_id, starts_at)`.

**Primary-event resolution rule (domain logic, documented here so Task 002/the domain layer doesn't have to invent it) — [R21]:**

- `COMMON` variant: the `is_primary = true` row with `side = 'COMMON'` for the Project; if none is marked primary, fall back to the earliest `starts_at` row with `side = 'COMMON'`; if none exists at all, fall back to the earliest `starts_at` row for the Project regardless of side.
- `GROOM` variant: the `is_primary = true` row with `side = 'GROOM'`; if none, fall back to the `COMMON` primary event (same rule as above); if neither exists, earliest `starts_at` for the Project.
- `BRIDE` variant: mirrored with `side = 'BRIDE'`.

This selection feeds countdown target, primary calendar emphasis, and the template's primary-event display — it is resolver/domain-layer logic, not a database constraint, because "which side is relevant for a given variant" is a presentation concern; the partial unique index only guarantees the *input* to that logic is unambiguous per side.

RLS: enabled + forced. SELECT/INSERT/UPDATE/DELETE: `is_staff()`. Anonymous/guest/customer-token: none (server-only reads for display/countdown, §M).

### 2.9 `project_media` — **[R15], [R16]**

Purpose: normalized media inventory for a Project.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES projects(id) ON DELETE CASCADE` |
| `media_type` | `TEXT` | NOT NULL | *(none)* | `CHECK (media_type IN ('COVER','GALLERY','AUDIO','QR_GROOM','QR_BRIDE','QR_COMMON'))` |
| `storage_bucket` | `TEXT` | NOT NULL | *(none)* | New V2-only bucket (e.g. `project-media`), never V1's `wedding-photos` (§O) |
| `storage_path` | `TEXT` | NOT NULL | *(none)* | Non-guessable object key (includes `project_id` + a random segment) |
| `mime_type` | `TEXT` | NULL | *(none)* | |
| `size_bytes` | `INTEGER` | NULL | *(none)* | `CHECK (size_bytes IS NULL OR size_bytes >= 0)` |
| `width` | `INTEGER` | NULL | *(none)* | `CHECK (width IS NULL OR width > 0)` |
| `height` | `INTEGER` | NULL | *(none)* | `CHECK (height IS NULL OR height > 0)` |
| `alt_text` | `TEXT` | NULL | *(none)* | |
| `sort_order` | `INTEGER` | NOT NULL | `0` | |
| `created_by` | `UUID` | NULL | *(none)* | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

Constraints: `UNIQUE (storage_bucket, storage_path)` — no two rows may claim the same object. `UNIQUE (id, project_id)` — **[F5]/[F6]**, added as the composite-FK target for `invitation_version_media.project_media_id` (§2.15) and `wedding_details`' gift-QR columns (§2.7); trivially true since `id` is already the PK, but Postgres requires the exact constraint declared to serve as a composite FK target.

Indexes: `(project_id, media_type, sort_order)`.

Triggers — **[R16], placement per [F16]**:
- `guard_project_media_asset_immutability()` — `BEFORE UPDATE ON project_media FOR EACH ROW WHEN (NEW.storage_bucket <> OLD.storage_bucket OR NEW.storage_path <> OLD.storage_path)`: raises an exception if `EXISTS (SELECT 1 FROM invitation_version_media WHERE project_media_id = OLD.id)`. Once any immutable snapshot references this row, its asset identity (bucket/path) can never change in place — replacing an asset means uploading a new object and creating a **new** `project_media` row, then (if desired) pointing future drafts at the new row. Other fields (`alt_text`, `sort_order`, `media_type`) remain editable regardless of reference state. **[F16], decided (no longer "create now or defer"): this trigger's function body is created in migration `0013b`, the same migration that creates `invitation_version_media` — not in the migration that creates this table (`0007`, per the corrected order in §16/[F7]) — because the function body's `EXISTS` check queries `invitation_version_media`, which does not exist yet at `0007`. See §16 for the exact migration placement.**

Deletion (**[R15]**, cross-referenced from §K): a `project_media` row can only be deleted while **no** `invitation_version_media` row references it — enforced by that junction table's `ON DELETE RESTRICT` toward `project_media` (§2.15), not by a bespoke trigger here. This protects media needed by **any** retained snapshot (current published, superseded published, or review), not only the currently-live published one (§22).

RLS: enabled + forced. SELECT/INSERT/UPDATE/DELETE: `is_staff()` (DELETE additionally gated by the RESTRICT FK described above). Anonymous: signed-URL issuance for published media happens server-side (`service_role`), never a direct anon table/bucket read. Guest/customer token: none via RLS.

### 2.10 `templates`

Purpose: template family/catalog entry.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `code` | `TEXT` | NOT NULL | *(none)* | `UNIQUE`, e.g. `elegant-editorial` |
| `event_type` | `TEXT` | NOT NULL | `'WEDDING'` | `CHECK (event_type IN ('WEDDING'))` — same domain as `projects.event_type` |
| `name` | `TEXT` | NOT NULL | *(none)* | |
| `description` | `TEXT` | NULL | *(none)* | |
| `is_active` | `BOOLEAN` | NOT NULL | `true` | |
| `sort_order` | `INTEGER` | NOT NULL | `0` | |
| `preview_media_path` | `TEXT` | NULL | *(none)* | |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

RLS: enabled + forced. SELECT: `is_staff()`. INSERT/UPDATE: `is_admin()`. DELETE: no policy — `template_versions.template_id` is `RESTRICT`.

### 2.11 `template_versions`

Purpose: immutable logical version metadata for one template implementation.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `template_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES templates(id) ON DELETE RESTRICT` |
| `version_number` | `INTEGER` | NOT NULL | *(none)* | `CHECK (version_number > 0)` |
| `renderer_key` | `TEXT` | NOT NULL | *(none)* | `UNIQUE`, e.g. `wedding.elegant-editorial.v1` |
| `manifest` | `JSONB` | NOT NULL | *(none)* | Supported features/presets metadata |
| `retired_at` | `TIMESTAMPTZ` | NULL | *(none)* | `NULL` = selectable for new projects/designs; sole source of truth (no separate `is_active_for_new_projects`) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

Constraints: `UNIQUE (template_id, version_number)`; `UNIQUE (renderer_key)`.

Triggers — **[F10]**, new:
- `guard_template_version_immutability()` — `BEFORE UPDATE ON template_versions FOR EACH ROW`: raises an exception if any of `template_id, version_number, renderer_key, manifest, created_at` differ between `OLD` and `NEW`. **[F10], corrected from Revision 2:** Revision 2 said `manifest` was updatable "in practice, by convention" alongside `retired_at` — the review is right that a changed `manifest` on an already-used version is exactly the kind of silent visual/capability-contract change §9/`docs/CLAUDE.md` §9 forbids ("do not edit v1 to become visually different... create v2"). `manifest` is now frozen at creation like every other column here. **`retired_at` is the only column a normal `UPDATE` may ever change.**

RLS: enabled + forced. SELECT: `is_staff()`. INSERT: `is_admin()`. UPDATE: `is_admin()`, restricted by the trigger above to `retired_at` only. DELETE: no policy — `RESTRICT` FKs from `project_design`/`invitation_versions` mean a referenced version can never be hard-deleted regardless.

### 2.12 `project_design`

Purpose: one shared design configuration per Project.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | `UUID` | NOT NULL | *(none)* | `UNIQUE`, `REFERENCES projects(id) ON DELETE CASCADE` |
| `template_version_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES template_versions(id) ON DELETE RESTRICT` |
| `palette_key` | `TEXT` | NOT NULL | *(none)* | Validated against the template manifest at the application layer, not a DB `CHECK` (manifest-defined sets vary per template/version) |
| `font_preset_key` | `TEXT` | NOT NULL | *(none)* | Same validation note |
| `effect_preset_key` | `TEXT` | NOT NULL | *(none)* | Same validation note |
| `section_settings` | `JSONB` | NOT NULL | `'{}'::jsonb` | |
| `design_settings` | `JSONB` | NOT NULL | `'{}'::jsonb` | Template-approved options only, validated at the application layer |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

RLS: enabled + forced. SELECT/INSERT/UPDATE: `is_staff()`. DELETE: no policy (cascades with the Project). Anonymous/guest token: none. Customer REVIEW: none via RLS — the frozen `invitation_versions.template_version_id`/`renderer_key_snapshot`/design settings inside the payload are what render, not a live read of this table (§G).

### 2.13 `project_invitations` — **[R9], [R10], [R18]**

Purpose: logical invitation variant belonging to a Project. Physical name permanently `project_invitations` (§0, §DECISIONS.md).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES projects(id) ON DELETE CASCADE` |
| `variant` | `TEXT` | NOT NULL | *(none)* | `CHECK (variant IN ('COMMON','GROOM','BRIDE'))` |
| `public_slug` | `TEXT` | NOT NULL | *(none — set by a `BEFORE INSERT` trigger, not a column `DEFAULT`; see below)* | `UNIQUE`. **[R18], mechanism corrected by [F1].** |
| `current_review_version_id` | `UUID` | NULL | *(none)* | See §2.13.1 — no plain FK in the migration that creates this table (§R10) |
| `published_version_id` | `UUID` | NULL | *(none)* | Same |
| `created_by` | `UUID` | NULL | *(none)* | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

Constraints: `UNIQUE (project_id, variant)` — the core rule preventing duplicate variants and serving as the target of `guests`' composite FK (§2.18). `UNIQUE (id, project_id)` — **[F3]**, new: trivially true since `id` is already the PK, but required as the exact declared target for `invitation_versions`' new composite FK to this table (§2.14, **[F3]**).

**`public_slug` — [R18], mechanism corrected by [F1]:** Revision 2 specified this as a column `DEFAULT generate_invitation_slug(project_id, variant)`. **That is invalid PostgreSQL** — a column's `DEFAULT` expression is evaluated independently of the row's other columns and cannot reference sibling columns such as `project_id`/`variant` from the same `INSERT`. Corrected mechanism:

- `public_slug` has **no column `DEFAULT`** at all.
- A trigger, `set_invitation_public_slug()` — `BEFORE INSERT ON project_invitations FOR EACH ROW WHEN (NEW.public_slug IS NULL)` — sets `NEW.public_slug := generate_invitation_slug(NEW.project_id, NEW.variant)`. A `BEFORE INSERT` row-level trigger legitimately has access to `NEW.*` for every column of the row being inserted (unlike a column `DEFAULT` expression), which is exactly why this is the correct mechanism where a `DEFAULT` is not.
- `generate_invitation_slug(p_project_id uuid, p_variant text)` itself is unchanged in behavior from Revision 2: it looks up the parent `projects.project_code` and returns `lower(project_code) || '-' || lower(p_variant)` (e.g. `wc-2026-000001-groom`) — a `STABLE`, `SECURITY DEFINER`, schema-qualified function per §1.3. The `WHEN (NEW.public_slug IS NULL)` guard means the trigger only fills the value in when the inserting code hasn't already supplied one, matching normal practice for trigger-computed defaults.
- **Migration placement:** this trigger is created in migration `0012`, alongside `project_invitations` itself (§16) — it only depends on `projects.project_code` (already present since `0005`) and the row's own `NEW.project_id`/`NEW.variant`, so there is no ordering hazard here (unlike the `invitation_versions` pointer graph, §F3/§F10 below).
- It remains a **routing identifier, not an authorization credential** — the published content it resolves to is meant to be shared, so a somewhat-guessable, human-legible slug is intentional and matches "stable public invitation URL" in `docs/PRODUCT.md` §12. **Stable after first publish** — enforced by the same trigger that blocks deletion after publish (below), unchanged from Revision 2.

**§2.13.1 — Pointer integrity — [R9]:** the schema must prevent Invitation A's pointers from resolving to Invitation B's version, and must ensure each pointer's target has the correct `version_type`. Mechanism (composite FK for "same invitation," trigger for "correct literal type," because a plain FK can constrain *which row* is referenced but not a literal value of a non-key attribute on that row):

- `invitation_versions` carries `UNIQUE (invitation_id, id)` (§2.14).
- Composite FKs, added in migration `0013` after `invitation_versions` exists (§10/§N):
  - `ALTER TABLE project_invitations ADD CONSTRAINT fk_current_review_same_invitation FOREIGN KEY (id, current_review_version_id) REFERENCES invitation_versions (invitation_id, id) ON DELETE RESTRICT;`
  - `ALTER TABLE project_invitations ADD CONSTRAINT fk_published_same_invitation FOREIGN KEY (id, published_version_id) REFERENCES invitation_versions (invitation_id, id) ON DELETE RESTRICT;`
  - (Composite FKs in this plan always use `RESTRICT`, never `SET NULL`/`CASCADE` — see the explanation in §11 for why mixing a multi-column `SET NULL` with an already-`NOT NULL` shared column creates an unresolvable conflict; `RESTRICT` sidesteps it entirely and is safe here because `invitation_versions` rows are never deleted in normal operation anyway.)
- Trigger `guard_invitation_pointer_types()` — `BEFORE INSERT OR UPDATE ON project_invitations FOR EACH ROW`: when `NEW.current_review_version_id IS NOT NULL`, looks up that `invitation_versions` row and raises an exception unless `version_type = 'REVIEW'`; when `NEW.published_version_id IS NOT NULL`, raises unless `version_type = 'PUBLISHED'`. (The composite FKs above already guarantee the row belongs to the same invitation and exists at all; this trigger only adds the literal-type check.)

Triggers — slug assignment, deletion, slug freeze:
- `set_invitation_public_slug()` — **[F1]**, new (see above): `BEFORE INSERT` only, fills `public_slug` when not already supplied.
- `guard_invitation_immutable_after_publish()` — `BEFORE DELETE ON project_invitations FOR EACH ROW WHEN (OLD.published_version_id IS NOT NULL)`: raises an exception (cannot delete once ever published — `published_version_id` is only ever reassigned to a newer published row, never nulled, so `IS NOT NULL` correctly means "has been published at least once"). Same function additionally handles `BEFORE UPDATE ... WHEN (OLD.published_version_id IS NOT NULL AND NEW.public_slug <> OLD.public_slug)`: raises an exception — the slug is frozen after first publish. **Note ([F3]):** the new composite FK from `invitation_versions` (§2.14) independently means this row cannot be deleted while it has *any* `invitation_versions` row at all (published or not), which is a stricter, FK-enforced condition than "no `published_version_id`" alone — see §2.14/§4.

RLS: enabled + forced. SELECT/INSERT/UPDATE: `is_staff()` (UPDATE subject to the triggers above). DELETE: `is_staff()`, but only succeeds while no `invitation_versions` row references this invitation at all (enforced by the `RESTRICT` FK from `invitation_versions`, §2.14/§F3 — the policy grants the attempt, the FK/trigger decide whether it's allowed). Anonymous: server-only resolution of the published route by `public_slug` (§M). Guest token: server-only. Customer REVIEW/PORTAL: server-only (link display, review render).

### 2.14 `invitation_versions` — **[R9], [R10], [R11-D], [R15]**

Purpose: stable, fully immutable Review/Published snapshots.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `invitation_id` | `UUID` | NOT NULL | *(none)* | Composite FK, see **[F3]** below — no plain single-column FK on this column alone |
| `project_id` | `UUID` | NOT NULL | *(none)* | Denormalized copy of the parent invitation's `project_id`, set once at INSERT and never updated (row is immutable). Composite FK, see **[F3]** below. Independently useful for "all versions for project X" queries and for `review_feedback`'s composite FK (§2.16, §11-D). **[R11-D]** |
| `version_number` | `INTEGER` | NOT NULL | *(none)* | `CHECK (version_number > 0)` |
| `version_type` | `TEXT` | NOT NULL | *(none)* | `CHECK (version_type IN ('REVIEW','PUBLISHED'))` |
| `source_review_version_id` | `UUID` | NULL | *(none)* | Self-referencing. See the strengthened combined `CHECK` below — **[F4]**. |
| `template_version_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES template_versions(id) ON DELETE RESTRICT` |
| `renderer_key_snapshot` | `TEXT` | NOT NULL | *(none)* | Redundant safety copy of `template_versions.renderer_key` at snapshot time |
| `payload` | `JSONB` | NOT NULL | *(none)* | Normalized render snapshot |
| `created_by` | `UUID` | NULL | *(none)* | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `published_at` | `TIMESTAMPTZ` | NULL | *(none)* | See the strengthened combined `CHECK` below — **[F4]**. |

`media_refs UUID[]` from Revision 1 is **removed** — replaced entirely by the `invitation_version_media` junction table (§2.15, §R15).

Constraints:
- `UNIQUE (invitation_id, version_number)`; `UNIQUE (invitation_id, id)` (target for `project_invitations`' composite FKs, §2.13.1); `UNIQUE (id, project_id)` (target for `review_feedback`'s composite FK, §2.16, §11-D, and for `invitation_version_media`'s composite FK, §2.15, **[F5]**).
- **[F4], strengthened (replaces Revision 2's two separate, weaker checks):** `CHECK ( (version_type = 'REVIEW' AND source_review_version_id IS NULL AND published_at IS NULL) OR (version_type = 'PUBLISHED' AND source_review_version_id IS NOT NULL AND published_at IS NOT NULL) )`. Revision 2's version only forbade a `REVIEW` row from *having* a `source_review_version_id` — it never required a `PUBLISHED` row to *have* one, so a `PUBLISHED` row with `source_review_version_id IS NULL` was, incorrectly, a valid state under Revision 2's constraint. This combined `CHECK` makes that state impossible: a `PUBLISHED` row without a source `REVIEW` version cannot exist, closing the exact gap the review identified (§F4's title: "published version must come from review").

**`invitation_id`/`project_id` same-parent integrity — [F3]:** Revision 2 declared `invitation_id` and `project_id` as two independent, unrelated FKs, which meant nothing in the schema stopped a row from carrying `invitation_id` from Project A's invitation together with `project_id` pointing at Project B — exactly the gap the review flagged. Corrected to one composite FK replacing both independent ones:

```text
FOREIGN KEY (invitation_id, project_id) REFERENCES project_invitations (id, project_id) ON DELETE RESTRICT
```

requiring `project_invitations` to carry `UNIQUE (id, project_id)` (added in §2.13, **[F3]**). **Consequence for `project_invitations`' deletability (re-checked per the review's instruction):** Revision 2's simple `invitation_versions.invitation_id ON DELETE CASCADE` is now gone — replaced by this composite `RESTRICT` FK — so a `project_invitations` row can no longer be deleted while it has *any* `invitation_versions` row at all (`REVIEW` or `PUBLISHED`), not merely while `published_version_id IS NULL` as Revision 2 stated. This is a **tightening**, not a loosening: it means an invitation variant can only be deleted before a single review snapshot has ever been created for it. Given `project_invitations` deletion was already restricted to the never-published case, and creating even a first `REVIEW` snapshot is itself a deliberate staff action, this is an acceptable, safe narrowing of an already-rare operation, not a new limitation on any documented product flow. §2.13's deletion RLS/trigger notes are updated to match (see above).

**Downstream `review_feedback` re-check ([F3]'s required re-check):** `review_feedback`'s composite FK `(invitation_version_id, project_id) REFERENCES invitation_versions (id, project_id)` (§2.16, §11-D) does not need to change structurally, but its *guarantee* is now actually sound rather than resting on an unenforced assumption: previously, `invitation_versions.project_id` was "a denormalized copy" with nothing forcing it to equal its true parent invitation's project — so `review_feedback`'s FK, while syntactically composite, was only as trustworthy as that unenforced copy. With `[F3]`'s new composite FK in place, `invitation_versions.project_id` is now guaranteed correct for every row, which is what makes `review_feedback`'s (and `invitation_version_media`'s, §2.15/**[F5]**) same-project guarantees actually hold rather than merely appear to.

Pointer integrity for `source_review_version_id` — **[R9]**: composite FK `FOREIGN KEY (invitation_id, source_review_version_id) REFERENCES invitation_versions (invitation_id, id) ON DELETE RESTRICT` (self-referential; ensures the promoted-from row belongs to the *same* invitation) plus a trigger `guard_source_review_version_type()` — `BEFORE INSERT ON invitation_versions FOR EACH ROW WHEN (NEW.source_review_version_id IS NOT NULL)`: raises unless the referenced row's `version_type = 'REVIEW'`. (The `[F4]` `CHECK` above already guarantees a `REVIEW` row never has a `source_review_version_id` and a `PUBLISHED` row always does; this trigger adds the "and it's specifically a `REVIEW`-type row" check that a `CHECK` alone cannot express against another row.)

Immutability: **no UPDATE, no DELETE policy for any role.** Rows are created once by trusted server code and never touched again — this is the physical mechanism behind §F.

RLS: enabled + forced. SELECT: `is_staff()`. INSERT: `is_staff()` via the authenticated-session path (§1.4) — creating a review/publish snapshot is a normal staff-triggered business action, not a privileged-only operation; its integrity comes from the immutability + trigger/FK rules, not from restricting who may insert. UPDATE/DELETE: none. Anonymous: server-only published-payload render. Guest token: server-only. Customer REVIEW: server-only review-payload render.

### 2.15 `invitation_version_media` (new table beyond the original 20 — introduced specifically to satisfy **[R15]**)

Purpose: normalized junction recording exactly which `project_media` rows an immutable `invitation_versions` snapshot depends on, replacing the denormalized `media_refs UUID[]` from Revision 1.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `invitation_version_id` | `UUID` | NOT NULL | *(none)* | Composite FK, see **[F5]** below |
| `project_media_id` | `UUID` | NOT NULL | *(none)* | Composite FK, see **[F5]** below |
| `project_id` | `UUID` | NOT NULL | *(none)* | **[F5]**, new — denormalized, used only to make the two composite FKs below transitively force same-project integrity |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

**Project isolation — [F5]:** Revision 2's plain single-column FKs (`invitation_version_id → invitation_versions(id)`, `project_media_id → project_media(id)`) could not stop a `PUBLISHED`/`REVIEW` snapshot from Project A referencing `project_media` that belongs to Project B — the review's flagged gap. Corrected to two composite FKs sharing the new `project_id` column:

```text
FOREIGN KEY (invitation_version_id, project_id) REFERENCES invitation_versions (id, project_id) ON DELETE CASCADE
FOREIGN KEY (project_media_id, project_id)       REFERENCES project_media (id, project_id)       ON DELETE RESTRICT
```

requiring `UNIQUE (id, project_id)` on both `invitation_versions` (already added, §2.14/**[F3]**) and `project_media` (added, §2.9/**[F5]**/**[F6]**). Together, both FKs force `junction.project_id = invitation_versions.project_id` **and** `junction.project_id = project_media.project_id` for the same row — which transitively forces `invitation_versions.project_id = project_media.project_id`, i.e. the snapshot and the media it references must belong to the same Project. The first FK (`invitation_version_id`) may safely stay `ON DELETE CASCADE` here — unlike the composite FKs elsewhere in this plan, `project_id` on this junction table has no *other*, independent FK of its own to `projects` that a `CASCADE` could conflict with (§4/§B's "why composite FKs use RESTRICT" reasoning doesn't apply to this particular column on this particular table). The second FK (`project_media_id`) remains `RESTRICT` — that is the entire point of this table (§K, §R15/§R22): protecting referenced media from deletion.

Primary key: composite `(invitation_version_id, project_media_id)` — `project_id` is a plain (non-key) column on this table, present solely to support the two composite FKs above.

Indexes: `CREATE INDEX ON invitation_version_media (project_media_id, project_id)` — Postgres does not automatically index the referencing side of a FK, and this index is required both for the `RESTRICT` check's performance and for "which snapshots use this media" queries.

Rows are inserted by the same trusted server action that creates the parent `invitation_versions` row, in the same transaction, one row per media item the resolved payload actually references, with `project_id` set to that invitation_version's own `project_id`.

RLS: enabled + forced. SELECT/INSERT: `is_staff()` (created alongside its immutable parent). UPDATE/DELETE: no policy — nothing about a junction row is ever meant to change once written, and normal operation never deletes an `invitation_versions` row so the `CASCADE` from that side is theoretical, not a real deletion path.

### 2.16 `intake_submissions` — **[R5], [R11-C], [G2]**

Purpose: customer-submitted information awaiting staff review/application. **Never** writes directly to `wedding_details`/`project_events` — those remain staff-applied only.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES projects(id) ON DELETE CASCADE`. **Immutable after INSERT — [G2]**, see below. |
| `access_link_id` | `UUID` | NULL | *(none)* | See §11-C below. **Immutable after INSERT — [G2]**, see below. |
| `payload` | `JSONB` | NOT NULL | *(none)* | **Immutable after INSERT, DB-guarded — [G2]**, see below. This is an audit-integrity rule, not a convention. |
| `status` | `TEXT` | NOT NULL | `'PENDING'` | `CHECK (status IN ('PENDING','APPLIED','REJECTED'))` |
| `submitted_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | **Immutable after INSERT — [G2]**, see below. |
| `reviewed_by` | `UUID` | NULL | *(none)* | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `reviewed_at` | `TIMESTAMPTZ` | NULL | *(none)* | `CHECK ((status = 'PENDING') = (reviewed_at IS NULL))` |
| `staff_note` | `TEXT` | NULL | *(none)* | |

**`access_link_id` — [R11-C]:** composite FK `FOREIGN KEY (access_link_id, project_id) REFERENCES project_access_links (id, project_id) ON DELETE RESTRICT` (nullable `access_link_id` means `MATCH SIMPLE` bypasses the check entirely when it's `NULL` — the desired behavior). Plus trigger `guard_intake_link_type()` — `BEFORE INSERT ON intake_submissions FOR EACH ROW WHEN (NEW.access_link_id IS NOT NULL)`: raises unless the referenced `project_access_links.link_type = 'INTAKE'`.

Indexes: `(project_id, status)`.

**Payload immutability — [G2], new, DB-guarded (not convention):** `intake_submissions` is meant to be a permanent, exact record of what the customer actually submitted — an audit-integrity rule, not a soft preference. Enforced by:

- `guard_intake_submission_immutability()` — `BEFORE UPDATE ON intake_submissions FOR EACH ROW`: raises an exception if any of `project_id, access_link_id, payload, submitted_at` differ between `OLD` and `NEW`. **Only `status`, `reviewed_by`, `reviewed_at`, and `staff_note` may ever change through a normal `UPDATE`** — exactly the staff review-workflow fields, and nothing else.

RLS: enabled + forced. SELECT: `is_staff()`. INSERT: **server-only** via `service_role` (the customer INTAKE token flow — no Supabase Auth session exists for that actor, §1.6). UPDATE: `is_staff()`, enforced to `status`/`reviewed_by`/`reviewed_at`/`staff_note` only by `guard_intake_submission_immutability()` above — not by convention. DELETE: no policy (audit trail of what the customer actually sent). Anonymous/guest: none.

### 2.17 `project_access_links`

Purpose: secure capability links for customers. Types: `INTAKE`, `REVIEW`, `PORTAL`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES projects(id) ON DELETE CASCADE` |
| `link_type` | `TEXT` | NOT NULL | *(none)* | `CHECK (link_type IN ('INTAKE','REVIEW','PORTAL'))` |
| `token_hash` | `BYTEA` | NOT NULL | *(none)* | `UNIQUE`, `CHECK (octet_length(token_hash) = 32)` — SHA-256 digest of the raw ≥32-random-byte, URL-safe-encoded token. Raw token is never stored. |
| `token_hint` | `TEXT` | NULL | *(none)* | Non-sensitive fragment for staff display only |
| `expires_at` | `TIMESTAMPTZ` | NULL | *(none)* | `NULL` = no expiration (§R-Q3) |
| `revoked_at` | `TIMESTAMPTZ` | NULL | *(none)* | Sole source of truth for active/revoked; rotation = new row + revoke old, never an in-place token swap |
| `created_by` | `UUID` | NULL | *(none)* | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `last_used_at` | `TIMESTAMPTZ` | NULL | *(none)* | Updated by server code on each successful resolution |

Constraints: `UNIQUE (token_hash)`; `UNIQUE (id, project_id)` — declared explicitly as the target for `intake_submissions`' and `review_feedback`'s composite FKs (trivially true since `id` is already the PK, but Postgres requires the exact unique constraint to exist to be referenced by a composite FK).

Indexes: `(project_id, link_type, revoked_at)` for staff "list active links for this project."

No REVIEW-specific version-pinning column: approval anchors per-version through `review_feedback.invitation_version_id` instead (§F, §R-Q2).

Triggers — **[F14]**, new:
- `guard_access_link_identity_immutability()` — `BEFORE UPDATE ON project_access_links FOR EACH ROW`: raises an exception if any of `project_id, link_type, token_hash, created_by, created_at` differ between `OLD` and `NEW`. Rotation is defined as creating a **new** row and revoking the old one (§2.17, unchanged) — it was never intended to mutate `token_hash` in place, but Revision 2 only said so in prose ("restricted in practice"). This trigger makes it an actual guard: only `revoked_at`, `expires_at`, and `last_used_at` may ever change through a normal `UPDATE`.

RLS: enabled + forced. SELECT/INSERT: `is_staff()`. UPDATE: `is_staff()`, enforced to `revoked_at`/`expires_at`/`last_used_at` only by the trigger above (not by convention). DELETE: no policy (soft-revoke only). Anonymous/guest: none — token verification happens server-side via `service_role` (§H).

### 2.18 `review_feedback` — **[R11-D], [R13]**

Purpose: customer review feedback and approval events — a fully append-only log.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES projects(id) ON DELETE CASCADE` |
| `access_link_id` | `UUID` | NULL | *(none)* | Composite FK, see below |
| `invitation_version_id` | `UUID` | NOT NULL | *(none)* | Composite FK, see below — **not nullable**, a change from Revision 1: every feedback row, including `COMMENT`, references the exact `REVIEW` version shown (§R13 recommendation) |
| `feedback_type` | `TEXT` | NOT NULL | *(none)* | `CHECK (feedback_type IN ('COMMENT','REVISION_REQUEST','APPROVAL'))` |
| `message` | `TEXT` | NULL | *(none)* | `CHECK (message IS NULL OR char_length(message) <= 2000)` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

**`access_link_id`:** composite FK `FOREIGN KEY (access_link_id, project_id) REFERENCES project_access_links (id, project_id) ON DELETE RESTRICT`, nullable (bypassed when `NULL`), plus trigger `guard_review_link_type()` checking `link_type = 'REVIEW'` when non-null.

**`invitation_version_id` — [R11-D]:** composite FK `FOREIGN KEY (invitation_version_id, project_id) REFERENCES invitation_versions (id, project_id) ON DELETE RESTRICT` — this is exactly why `invitation_versions.project_id` was denormalized (§2.14): it lets this constraint guarantee the referenced version belongs to the *same project* as the feedback row without a two-hop join.

Triggers — **[R13]**:
- `guard_feedback_targets_review_version()` — `BEFORE INSERT ON review_feedback FOR EACH ROW`: looks up the referenced `invitation_versions` row; raises unless `version_type = 'REVIEW'`. This applies to **all** `feedback_type` values (not just `APPROVAL`), per the recommendation that all review-flow feedback references the exact `REVIEW` version shown — it also has the side effect of structurally preventing approval (or any feedback) of a `PUBLISHED` row, satisfying that requirement directly.
- `guard_approval_targets_current_review()` — `BEFORE INSERT ON review_feedback FOR EACH ROW WHEN (NEW.feedback_type = 'APPROVAL')` — **[R-Q2]**: joins to `invitation_versions` to find `invitation_id`, then to `project_invitations` to read `current_review_version_id` for that invitation; raises an exception unless it equals `NEW.invitation_version_id`. This is the concrete mechanism that rejects "approval of a stale version" server-side — enforced at the database level, not merely by application discipline.

Constraints: partial unique index `CREATE UNIQUE INDEX ON review_feedback (invitation_version_id) WHERE feedback_type = 'APPROVAL'` — at most one approval event per version (a new review round gets a new version and hence a fresh opportunity to approve). **[R13]**

**Project-level approval completeness (documented domain rule, not a single-table DB constraint) — [R-Q2]:** for a Project with multiple required variants (e.g., `SEPARATE` package → `GROOM` + `BRIDE`), Project-level approval is complete only when, for **every** `project_invitations` row belonging to that Project, its `current_review_version_id` has a corresponding `review_feedback` row with `feedback_type = 'APPROVAL'`. This spans multiple `project_invitations` rows for one project and is evaluated by the publish-eligibility domain service, not expressible as a single-table constraint — documented here precisely so Task 002/the domain layer implements this exact rule rather than inventing one.

RLS: enabled + forced. SELECT: `is_staff()`. INSERT: **server-only** via `service_role` (the customer REVIEW token flow — no Auth session for that actor). UPDATE/DELETE: no policy for any role (append-only). Anonymous/guest: none.

### 2.19 `guests` — **[R11-B], [R14], [G1]**

Purpose: personalized guest records. `display_name` remains single free-form `TEXT`, never decomposed into honorific/legal-name fields.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES projects(id) ON DELETE CASCADE`. **Immutable after INSERT — [G1]**, see below. |
| `display_name` | `TEXT` | NOT NULL | *(none)* | `CHECK (char_length(display_name) BETWEEN 1 AND 200)` |
| `invitation_variant` | `TEXT` | NULL | *(none)* | `CHECK (invitation_variant IN ('COMMON','GROOM','BRIDE'))`. Composite FK, see below. |
| `group_name` | `TEXT` | NULL | *(none)* | |
| `phone` | `TEXT` | NULL | *(none)* | |
| `note` | `TEXT` | NULL | *(none)* | |
| `created_by` | `UUID` | NULL | *(none)* | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `token_hash` | `BYTEA` | NOT NULL | *(none)* | `UNIQUE`, `CHECK (octet_length(token_hash) = 32)` |
| `token_hint` | `TEXT` | NULL | *(none)* | |
| `revoked_at` | `TIMESTAMPTZ` | NULL | *(none)* | `NULL` = active/resolvable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

**`invitation_variant` composite FK — [R11-B]:** `FOREIGN KEY (project_id, invitation_variant) REFERENCES project_invitations (project_id, variant) ON DELETE RESTRICT` — when non-null, guarantees the variant identifies a real `project_invitations` row belonging to the *same* project; nullable column means `MATCH SIMPLE` bypasses the check when `NULL`. `RESTRICT` (not `SET NULL`) is used here for the same structural reason given in §11: a composite FK's `SET NULL` action would null every column listed in the FK, including `project_id`, which conflicts with `project_id`'s own separate `NOT NULL`/`CASCADE` FK to `projects`. Practical effect: staff must clear (`UPDATE ... SET invitation_variant = NULL`) a guest's variant before deleting a never-published `project_invitations` row it points to — a sensible operational order, not a real limitation.

Indexes: `(project_id)`; `UNIQUE (token_hash)`.

**`project_id` immutability — [G1], new:** `rsvps`' `guard_rsvp_guest_same_project()` (§2.20, §11-A) only validates the guest/project relationship at the moment an `rsvps` row is inserted or updated — it does nothing to stop `guests.project_id` itself from later being changed, which would silently invalidate that already-checked invariant for every RSVP already linked to that guest (Guest belongs to Project A → RSVP created for Project A → `guests.project_id` later changed to Project B → the existing RSVP still says Project A, and no trigger fires to catch the mismatch because the RSVP row itself was never touched). Fixed with a dedicated guard:

- `guard_guest_project_immutability()` — `BEFORE UPDATE ON guests FOR EACH ROW WHEN (NEW.project_id <> OLD.project_id)`: raises an exception. `project_id` cannot be changed by any normal application `UPDATE`, full stop.
- **Moving a Guest to another Project is not a supported operation.** If a guest was genuinely created under the wrong Project, staff creates a new `guests` row under the correct Project (and revokes/deletes the old one per §C) — there is no "move" operation, by design, consistent with how every other project-scoped entity in this plan treats its `project_id` as fixed at creation (`project_addons`, `project_access_links`, per **[F9]**/**[F14]**).
- `display_name`, `group_name`, `phone`, `note`, `invitation_variant`, `token_hash`/`token_hint` (rotation), and `revoked_at` remain mutable exactly as already documented — this guard touches only `project_id`.
- `rsvps.guard_rsvp_guest_same_project()` (§2.20) is unchanged and remains as defense-in-depth on the `rsvps` side — with `guests.project_id` now itself immutable, the two guards jointly guarantee the invariant holds both at RSVP-write time and for the entire remaining lifetime of the guest row, not merely at the moment the RSVP was created.

**Rotation vs. revocation — [R14]:** `revoked_at` disables the guest/link entirely (Guest A's token must fail resolution the moment this is set, per `docs/SECURITY.md` §10). **Rotation** is a distinct, defined operation: if a guest's link is lost/compromised but the guest should remain invited, trusted server code generates a **new** random token, computes its hash, and performs `UPDATE guests SET token_hash = <new hash>, token_hint = <new hint> WHERE id = <guest id>` — an in-place update of only those two columns. Because `id` never changes, `rsvps.guest_id` linkage, `display_name`, and `project_id` association are all preserved automatically; there is no need to delete/recreate the guest to rotate its token. This is simply the defined meaning of "rotation" for this table — no additional schema is required beyond the staff-`UPDATE` policy that already exists.

RLS: enabled + forced. SELECT/INSERT/UPDATE/DELETE: `is_staff()`, with `UPDATE` further restricted by `guard_guest_project_immutability()` above (**[G1]** — `project_id` cannot change; every other column may). Anonymous: none. Guest token: server-only resolution of exactly one row by `token_hash` (§I). Customer PORTAL: server-only (Guest Tool, entitlement-gated).

### 2.20 `rsvps` — **[R11-A], [R12]**

Purpose: attendance response, personalized or not.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES projects(id) ON DELETE CASCADE` |
| `guest_id` | `UUID` | NULL | *(none)* | `REFERENCES guests(id) ON DELETE SET NULL` — plain (non-composite) FK. See §11-A for why a composite FK isn't used here. |
| `guest_display_name_snapshot` | `TEXT` | NULL | *(none)* | Required (see `CHECK` below) when `guest_id IS NULL` (non-personalized flow's manually entered name); for personalized flow, a copy of `guests.display_name` at submission time so the response stays legible even if the guest row is later deleted |
| `attendance` | `TEXT` | NOT NULL | *(none)* | `CHECK (attendance IN ('ATTENDING','NOT_ATTENDING'))` |
| `party_size` | `INTEGER` | NOT NULL | `0` | See combined `CHECK` below — **[R12]** |
| `message` | `TEXT` | NULL | *(none)* | `CHECK (message IS NULL OR char_length(message) <= 500)` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

Constraints:
- `CHECK (guest_id IS NOT NULL OR guest_display_name_snapshot IS NOT NULL)`
- `CHECK ( (attendance = 'ATTENDING' AND party_size BETWEEN 1 AND 20) OR (attendance = 'NOT_ATTENDING' AND party_size = 0) )` — **[R12]**, corrected from Revision 1: `ATTENDING` now requires `party_size >= 1` (Revision 1 incorrectly allowed `ATTENDING` with `party_size = 0`).
- Partial unique index: `CREATE UNIQUE INDEX ON rsvps (guest_id) WHERE guest_id IS NOT NULL` — one current RSVP per personalized guest (resubmission is an `UPDATE` of that row, never a second `INSERT`).
- Non-personalized flow (`guest_id IS NULL`) intentionally has **no** uniqueness constraint — multiple genuine submissions from different anonymous people are expected and not deduplicated. This is an accepted, documented limitation (§R12), not resolved further in this task.

**`project_id` vs. `guest_id` project match — [R11-A]:** rather than a composite FK (which would force an unresolvable conflict between a multi-column `SET NULL` on `(guest_id, project_id)` and `project_id`'s own separate `NOT NULL`/`CASCADE` FK to `projects` — see §11), this is enforced by trigger `guard_rsvp_guest_same_project()` — `BEFORE INSERT OR UPDATE ON rsvps FOR EACH ROW WHEN (NEW.guest_id IS NOT NULL)`: raises unless `(SELECT project_id FROM guests WHERE id = NEW.guest_id) = NEW.project_id`. Retained unchanged as defense-in-depth alongside `guests.guard_guest_project_immutability()` (§2.19, **[G1]**) — the guest-side guard prevents the invariant from being invalidated *after* an RSVP already exists by making `guests.project_id` immutable in the first place; this trigger independently guards the moment an RSVP itself is written.

RLS: enabled + forced. SELECT: `is_staff()`. INSERT/UPDATE: **no** staff RLS grant — all writes, personalized and non-personalized alike, go through the trusted server RSVP use case (`service_role`, after guest-token validation where applicable), never a direct client `INSERT`/`UPDATE` and never a raw staff-authenticated table write either (this keeps a single validated code path for the business rules in this section, rather than two divergent ones). DELETE: `is_admin()` only (spam/duplicate cleanup). Anonymous: none directly — the trusted server endpoint, not the anon table policy, is what a public RSVP form calls. Guest token: server-only, resolved to exactly one guest's own row (§J).

### 2.21 `project_tasks` — **[R19]**

Purpose: lightweight operational task/deadline items.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES projects(id) ON DELETE CASCADE` |
| `title` | `TEXT` | NOT NULL | *(none)* | `CHECK (char_length(title) BETWEEN 1 AND 200)` |
| `status` | `TEXT` | NOT NULL | `'TODO'` | `CHECK (status IN ('TODO','IN_PROGRESS','DONE','CANCELLED'))` — **[R19]** |
| `due_at` | `TIMESTAMPTZ` | NULL | *(none)* | |
| `assigned_staff_id` | `UUID` | NULL | *(none)* | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `sort_order` | `INTEGER` | NOT NULL | `0` | |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

RLS: enabled + forced. SELECT/INSERT/UPDATE/DELETE: `is_staff()`.

### 2.22 `activity_logs` — **[R17]**

Purpose: audit-oriented record of meaningful domain events. Not a keystroke/telemetry log.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | `UUID` | NOT NULL | *(none)* | `REFERENCES projects(id) ON DELETE CASCADE` |
| `actor_type` | `TEXT` | NOT NULL | *(none)* | `CHECK (actor_type IN ('STAFF','CUSTOMER','GUEST','SYSTEM'))` |
| `actor_profile_id` | `UUID` | NULL | *(none)* | `REFERENCES profiles(id) ON DELETE SET NULL` — set only when `actor_type = 'STAFF'` |
| `action_type` | `TEXT` | NOT NULL | *(none)* | Short stable code (e.g. `PROJECT_PUBLISHED`); centralized as a TypeScript union in the domain layer rather than a DB `CHECK` list, because new action types are expected frequently as features ship — the one deliberate exception to the "CHECK for controlled vocabularies" rule in §A |
| `summary` | `TEXT` | NOT NULL | *(none)* | `CHECK (char_length(summary) BETWEEN 1 AND 500)` |
| `metadata` | `JSONB` | NULL | *(none)* | Must never contain a raw token/secret — a code-review discipline, not a DB constraint (a constraint cannot reliably detect "this JSON contains a secret") |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |

**Write path — [R17], further corrected by [F13]:** there is **no** table-level INSERT policy for `authenticated`/`is_staff()`, unchanged from Revision 2. However, Revision 2's `log_activity(...)` was a *generic*, directly client-callable RPC granted to `authenticated` — and the review correctly points out that this is still forgeable in an important sense: even though `actor_profile_id` is set server-side from `auth.uid()` (so *who* is logged can't be spoofed), any authenticated staff session could still call this generic RPC directly with an arbitrary `project_id`/`action_type`/`summary` of its own choosing, logging events that never actually happened (e.g. `PROJECT_PUBLISHED` for a project they never published) — *what* gets logged was never actually verified against a real business action.

**Corrected design ([F13]):** `log_activity(...)` is **not** granted `EXECUTE` to `authenticated` or `service_role` at all — `REVOKE EXECUTE ... FROM PUBLIC;` with **no subsequent `GRANT`** to any externally-reachable role. It becomes a private, internal-only helper, callable only from *within* other `SECURITY DEFINER` business-action functions owned by the same schema-owner role (e.g. `publish_invitation(...)`, `apply_intake_submission(...)`, `mark_project_paid(...)`, `revoke_access_link(...)` — one narrowly-scoped function per meaningful domain action, each individually reviewed). This works because a `SECURITY DEFINER` function's body executes with the *owner's* privileges, and a role always has implicit `EXECUTE` on functions it owns regardless of `GRANT`/`REVOKE` state for other roles — so one owned function calling a sibling owned function needs no separate grant, while an external client (even an authenticated staff session) has no path to invoke `log_activity` directly at all.

Server code (Next.js Route Handlers/Server Actions) never calls `log_activity` itself; it calls the actual business-action function for whatever it's doing (e.g. the publish action), and *that* function performs the real mutation **and** calls `log_activity` internally, atomically, in the same transaction, using values it derived from what it actually validated and did — not values a client handed it for the log entry specifically. This satisfies every part of the review's request: audit logging is invoked only from trusted server business use cases (the business-action functions, not a generic RPC); the generic log function is not executable by ordinary `authenticated`/`anon` roles (no grant exists); the business-action function supplies the verified actor identity via `auth.uid()` internally, exactly as before; `activity_logs` still has no direct INSERT/UPDATE/DELETE policy. Defining the full family of business-action functions themselves is Task 002+ implementation work, not this planning task — what this plan fixes is the *architectural pattern* (private internal logger, never a public RPC) so Task 002 does not build the forgeable version.

RLS: enabled + forced. SELECT: `is_staff()`. INSERT: no table policy, and (per **[F13]**) no directly-callable function either — only reachable as a side effect of a trusted business-action function. UPDATE/DELETE: no policy for any role, ever — immutable audit trail.

---

## 3. A. Enum / Constant Strategy

Unchanged general rule from Revision 1: `TEXT` + `CHECK` for controlled vocabularies, catalog tables where a value carries real metadata (price/description/active flag), native Postgres `ENUM` avoided entirely (one mechanism, not two). Full table restated with the two additions from this revision:

| Domain | Table.column | Strategy | Values | Why |
|---|---|---|---|---|
| ProjectStatus | `projects.status` | CHECK | 12 values, §2.3 | Most likely to be refined; CHECK is a cheap `ALTER` |
| EventType | `projects.event_type`, `templates.event_type` | CHECK | `WEDDING` | V1 non-goal to support other types now |
| Occasion type | `project_events.occasion_type` | CHECK | `VU_QUY, THANH_HON, RECEPTION, CUSTOM` | Distinguished from `EventType` in name (§2.8) |
| Event side | `project_events.side` | CHECK | `COMMON, GROOM, BRIDE` | Reuses InvitationVariant vocabulary |
| InvitationVariant | `project_invitations.variant`, `guests.invitation_variant` | CHECK | `COMMON, GROOM, BRIDE` | Foundational, but CHECK's flexibility costs nothing |
| AccessLinkType | `project_access_links.link_type` | CHECK | `INTAKE, REVIEW, PORTAL` | Stable capability set |
| PaymentStatus | `projects.payment_status` | CHECK | `UNPAID, PAID` | Room for richer statuses later |
| MediaType | `project_media.media_type` | CHECK | `COVER, GALLERY, AUDIO, QR_GROOM, QR_BRIDE, QR_COMMON` | Anticipated future types |
| ProjectAddon status | *(none — revocation via `revoked_at`, §2.6)* | N/A | N/A | Entitlement = non-revoked row existence |
| Review feedback type | `review_feedback.feedback_type` | CHECK | `COMMENT, REVISION_REQUEST, APPROVAL` | Stable event-type tag |
| IntakeSubmissionStatus | `intake_submissions.status` | CHECK | `PENDING, APPLIED, REJECTED` | |
| StaffRole | `profiles.role` | CHECK | `ADMIN, STAFF` | More roles may come later |
| RSVP attendance status | `rsvps.attendance` | CHECK | `ATTENDING, NOT_ATTENDING` | Self-documenting; room for a future `MAYBE` without a type migration |
| Invitation version lifecycle | `invitation_versions.version_type` | CHECK | `REVIEW, PUBLISHED` | |
| **Task status** | `project_tasks.status` | CHECK | `TODO, IN_PROGRESS, DONE, CANCELLED` | **[R19]** — new this revision; kept minimal per "V1 should remain lightweight" |

---

## 4. B. Foreign Key Graph (updated for composite FKs and the new junction table)

```text
auth.users (Supabase-managed)
   └── profiles (id = auth.users.id, no default)

profiles
   ├── customers.created_by, projects.assigned_staff_id, projects.created_by,
   │   project_media.created_by, project_invitations.created_by,
   │   invitation_versions.created_by, intake_submissions.reviewed_by,
   │   project_access_links.created_by, guests.created_by,
   │   project_tasks.assigned_staff_id, activity_logs.actor_profile_id,
   │   project_addons.created_by, project_addons.revoked_by      (all SET NULL)

customers ── projects.customer_id (RESTRICT)
service_packages ── projects.service_package_id (RESTRICT)
service_addons ── project_addons.service_addon_id (RESTRICT)
templates ── template_versions.template_id (RESTRICT)
template_versions ── project_design.template_version_id (RESTRICT)
template_versions ── invitation_versions.template_version_id (RESTRICT)

projects (aggregate root, CASCADE to all direct children)
   ├── wedding_details.project_id            1:1
   ├── project_events.project_id             1:N
   ├── project_media.project_id              1:N
   ├── project_design.project_id             1:1
   ├── project_addons.project_id             1:N
   ├── project_invitations.project_id        1:N  (≤3 via UNIQUE(project_id,variant))
   ├── invitation_versions.project_id        1:N  (denormalized, [R11-D])
   ├── intake_submissions.project_id         1:N
   ├── project_access_links.project_id       1:N
   ├── review_feedback.project_id            1:N
   ├── guests.project_id                     1:N  (immutable after INSERT — [G1])
   ├── rsvps.project_id                      1:N
   ├── project_tasks.project_id              1:N
   └── activity_logs.project_id              1:N

project_invitations  (now carries UNIQUE(id, project_id) as an [F3] composite-FK target)
   ├── (id, current_review_version_id) → invitation_versions(invitation_id, id)   composite, RESTRICT [R9]
   └── (id, published_version_id)      → invitation_versions(invitation_id, id)   composite, RESTRICT [R9]

invitation_versions
   ├── (invitation_id, project_id) → project_invitations(id, project_id)   composite, RESTRICT [F3] —
   │     replaces Revision 2's independent invitation_id/project_id FKs; also means
   │     project_invitations can no longer be deleted while it has ANY invitation_versions
   │     row (tighter than Revision 2's "only while never published")
   ├── (invitation_id, source_review_version_id) → invitation_versions(invitation_id, id)  composite self-ref, RESTRICT [R9]
   ├── invitation_version_media.(invitation_version_id, project_id) 1:N  (CASCADE) [F5]
   └── (id, project_id) → target for review_feedback / invitation_version_media composite FKs  [R11-D]/[F5]

invitation_version_media  (carries project_id, [F5])
   ├── (invitation_version_id, project_id) → invitation_versions(id, project_id)   composite, CASCADE [F5]
   └── (project_media_id, project_id)      → project_media(id, project_id)        composite, RESTRICT [F5] —
         protects any referenced media, current or historical, AND forces the
         snapshot and its media to belong to the same Project

project_media  (now carries UNIQUE(id, project_id) as an [F5]/[F6] composite-FK target)

wedding_details
   ├── (groom_bank_qr_media_id, project_id) → project_media(id, project_id)   composite, RESTRICT [F6]
   └── (bride_bank_qr_media_id, project_id) → project_media(id, project_id)   composite, RESTRICT [F6]

project_access_links
   └── (id, project_id) → target for intake_submissions / review_feedback composite FKs

intake_submissions
   └── (access_link_id, project_id) → project_access_links(id, project_id)   composite, RESTRICT [R11-C] + trigger (link_type='INTAKE')

review_feedback
   ├── (access_link_id, project_id) → project_access_links(id, project_id)   composite, RESTRICT + trigger (link_type='REVIEW')
   └── (invitation_version_id, project_id) → invitation_versions(id, project_id)  composite, RESTRICT [R11-D]

guests
   └── (project_id, invitation_variant) → project_invitations(project_id, variant)  composite, RESTRICT [R11-B]

rsvps
   ├── guest_id → guests.id   plain FK, SET NULL
   └── (trigger, not FK) guests.project_id must equal rsvps.project_id  [R11-A]
```

**Why every composite FK in this plan uses `RESTRICT`, never `SET NULL`/`CASCADE`:** a composite `SET NULL` action nulls *every* column listed in that FK together. Every composite FK here includes a `project_id`-shaped column that is separately `NOT NULL` and already governed by its own simple `CASCADE`/`SET NULL` FK to `projects` (or, for `guests`/`rsvps`, to their own parent). A composite `SET NULL` would either violate that `NOT NULL` or fight the other FK's independent action. `RESTRICT` sidesteps this cleanly, and in every one of these cases the referenced parent row (`project_access_links`, `project_invitations`, `invitation_versions`) is one this plan already never deletes in normal operation (§C) — so `RESTRICT` is never actually triggered by ordinary use, only by the rare exceptional-erasure procedure, where it correctly forces that procedure to clear dependents first. Where "the child row itself should survive its point-of-reference disappearing" was genuinely needed (`rsvps.guest_id` when a `guests` row is deleted), a plain single-column FK (`SET NULL`) is used instead of a composite one, and the "same project" rule that would have come from a composite FK is enforced by a trigger instead (§11-A).

---

## 5. C. Delete / Archive Strategy (updated)

| Entity | Strategy | Mechanism |
|---|---|---|
| `profiles` | Never hard-deleted | `is_active = false`; last-active-admin guarded (§P.2) |
| `customers` | Must not be destroyed | No DELETE policy for any role; `projects.customer_id` is `RESTRICT`; exceptional erasure is a manual documented `service_role` procedure (§Q5) |
| `projects` | Soft-archive only | `status='ARCHIVED'` + `archived_at`; no DELETE policy; exceptional erasure per §Q5 |
| `service_packages`, `service_addons`, `templates` | Retire, never delete once used | `is_active=false`; referencing FKs `RESTRICT` |
| `template_versions` | Immutable, retire via timestamp | `retired_at` is the only mutable column, DB-guarded by `guard_template_version_immutability()` (§2.11, **[F10]** — `manifest` is now frozen too, not just "by convention"); `RESTRICT` from `project_design`/`invitation_versions` |
| `project_addons` | Soft-revoke, immutable snapshot | Identity/snapshot columns DB-guarded as permanently immutable by `guard_project_addon_identity_immutability()` (§2.6, **[F9]**); `revoked_at`/`revoked_by`/`revoked_reason` mutable only while parent `projects.payment_status='UNPAID'`, frozen entirely once `'PAID'` (§7, **[R7]**) |
| `wedding_details`, `project_events`, `project_media`, `project_design` | Mutable draft data | Full staff CRUD pre-publish-freeze concerns; cascades with project. `project_media` additionally guarded by `invitation_version_media` `RESTRICT` (§K) and the asset-identity-immutability trigger (§2.9, **[R16]**, placement fixed by **[F16]**); `wedding_details`' gift-QR references are project-scoped by composite FK (**[F6]**) |
| `project_invitations` | Cannot delete while it has any `invitation_versions` row | The composite `RESTRICT` FK from `invitation_versions` (§2.14, **[F3]**) — tighter than Revision 2's "only while never published" — plus the existing slug-freeze/deletion trigger (§2.13) |
| `invitation_versions` | Fully immutable, append-only | No UPDATE/DELETE policy for any role; `REVIEW`/`PUBLISHED` lifecycle fields now mutually exclusive and complete by a single strengthened `CHECK` (**[F4]**) |
| `invitation_version_media` | Effectively immutable | No UPDATE/DELETE policy; `(project_media_id, project_id)` composite FK is `RESTRICT`, protecting referenced media indefinitely (§22) and guaranteeing same-Project media (**[F5]**) |
| `intake_submissions` | Append-only payload, mutable status | `project_id`/`access_link_id`/`payload`/`submitted_at` DB-guarded immutable by `guard_intake_submission_immutability()` (§2.16, **[G2]**); only `status`/`reviewed_by`/`reviewed_at`/`staff_note` mutable; no DELETE |
| `project_access_links` | Soft-revoke only | Rotation = new row + revoke old, now DB-guarded (**[F14]** `guard_access_link_identity_immutability()`, §2.17) rather than by convention; no DELETE |
| `review_feedback` | Append-only | No UPDATE/DELETE |
| `guests` | Hard-deletable by staff | `rsvps.guest_id` is `SET NULL` (not CASCADE) on delete, preserving the actual RSVP via `guest_display_name_snapshot` |
| `rsvps` | Staff read-only; admin may delete | No staff UPDATE/DELETE; all content mutation via the trusted RSVP use case (`service_role`) |
| `project_tasks` | Fully staff-manageable | Low risk, full CRUD |
| `activity_logs` | Append-only, immutable | Function-mediated INSERT only (§2.22, **[R17]**); no UPDATE/DELETE for any role including admin |

---

## 6. D. Money Model — **[R7], [R8]**

- Every money column is `INTEGER` VND, `CHECK (>= 0)`. No `NUMERIC`/`FLOAT` anywhere.
- **Catalog vs. snapshot:** `service_packages.price_vnd`/`service_addons.price_vnd` are current catalog prices, changeable anytime without touching any existing `projects`/`project_addons` row. `projects.package_code_snapshot`/`package_name_snapshot`/`base_price_vnd` and `project_addons.addon_code_snapshot`/`addon_name_snapshot`/`price_vnd_snapshot` are captured once, at selection time, and never recomputed from the catalog afterward.
- **Sales-flow mutability, resolved (§R7):** package/add-on selection may change freely while `projects.payment_status = 'UNPAID'` — this is normal, expected staff correction of an in-progress sale, not a destructive edit. The moment `payment_status` transitions to `'PAID'`, `guard_project_commercial_freeze()` (on `projects`) and its sibling on `project_addons` (§2.3, §2.6) make `service_package_id`, the three package snapshot/price columns, and all `project_addons` rows immutable for every normal code path. `CHECK ((payment_status='PAID') = (paid_at IS NOT NULL))` keeps that pair of columns consistent.
- **Atomic totals — [R8]:** maintained by a database trigger, not by trusting two separate server statements to both land correctly. `sync_project_commercial_totals()` (`AFTER INSERT OR UPDATE ON project_addons`) recomputes `projects.addon_total_vnd` from the live sum of non-revoked `price_vnd_snapshot` rows and derives `total_price_vnd = base_price_vnd + addon_total_vnd`, in the same transaction as the triggering write. **Why a trigger and not "an atomic transaction" alone:** a transaction only guarantees atomicity if the server code remembers to include both statements every time; a trigger makes the invariant hold structurally, for every current and future write path (including a manual admin correction), without depending on every call site remembering to recompute. The `CHECK (total_price_vnd = base_price_vnd + addon_total_vnd)` on `projects` remains as a redundant, cheap defense-in-depth check on top of the trigger, not the primary mechanism.

---

## 7. E. Date/Time Model

Unchanged from Revision 1: `TIMESTAMPTZ` for every canonical instant, `project_events.timezone` (`Asia/Ho_Chi_Minh` default) alongside it for correct localization, weekday/month/year/countdown always derived at read time by the shared domain date layer, never stored.

---

## 8. F. Publish Snapshot Model (updated for pointer integrity and stale-approval rejection)

```text
Mutable draft (wedding_details, project_events, project_media, project_design, ...)
        │  (Preview reads this live, unversioned)
        ▼
invitation_versions row, version_type = 'REVIEW'
   - trusted server action resolves current draft state through the Wedding
     Domain Resolver into a frozen payload; inserts invitation_version_media
     rows for every media item referenced, in the same transaction
        │
        │  Review Link (reusable/live, §R-Q2) shows whatever this invitation's
        │  current_review_version_id currently points to.
        │  review_feedback rows reference this exact version id — enforced by
        │  guard_feedback_targets_review_version() (§2.18)
        ▼
review_feedback (feedback_type='APPROVAL') INSERT
   - guard_approval_targets_current_review() rejects the insert unless
     invitation_version_id still equals project_invitations.current_review_version_id
     at the moment of approval — a stale/superseded version cannot be approved (§R-Q2)
        ▼
invitation_versions row, version_type = 'PUBLISHED'
   - copy-on-publish: payload/template_version_id/design settings copied verbatim
     from the approved REVIEW row, never re-derived from draft state at publish time
   - source_review_version_id points back to the promoted REVIEW row
        ▼
project_invitations.published_version_id updated to point at this new row
   (the OLD published row, if any, is never deleted/mutated — permanent history,
    protected indefinitely by invitation_version_media's RESTRICT FK, §22)
```

Pointer integrity (§2.13.1, §R9) guarantees `current_review_version_id`/`published_version_id` can never resolve to another invitation's version, and can never resolve to a version of the wrong lifecycle type.

Project-level completeness for multi-variant projects is a documented domain-service rule reading across all of a Project's `project_invitations` rows (§2.18, §R-Q2) — not a single-table constraint.

---

## 9. G. Template Version Model

Unchanged from Revision 1: `project_design.template_version_id` is the *current* mutable design pointer; `invitation_versions.template_version_id`/`renderer_key_snapshot` are independently frozen at snapshot time and never affected by later changes to `project_design`. `template_versions.retired_at` only blocks *new* selection, never resolution of an already-referenced version (`RESTRICT` FK guarantees a referenced version is never deleted).

---

## 10. H. Customer Access Token Model

Unchanged from Revision 1 (§2.17 above restates the exact columns). Verification flow: hash presented token (SHA-256) → look up by `token_hash` → require `revoked_at IS NULL` → require `expires_at IS NULL OR expires_at > now()` → require `link_type` matches requested capability → require resolved `project_id` matches the project being acted on → update `last_used_at`. All server-side via `service_role`, never RLS-scoped (§1.6).

---

## 11. I. Personalized Guest Token Model

Unchanged column model from Revision 1 (§2.19 above), with rotation now explicitly defined and distinguished from revocation (§R14, §2.19). `display_name` remains a single free-form field; resolution is by `token_hash` only, never by `display_name` or a predictable id.

---

## 12. J. RSVP Integrity — **[R11-A], [R12]**

Fully restated at §2.20. Key points: `ATTENDING` requires `party_size BETWEEN 1 AND 20`; `NOT_ATTENDING` requires `party_size = 0` (both directions now strict, correcting Revision 1); one current RSVP per personalized guest via a partial unique index; the project-match between `rsvps` and a referenced `guests` row is enforced by a trigger (not a composite FK, for the structural reason in §11); non-personalized duplicate submissions remain an accepted, explicitly documented limitation, unchanged from Revision 1 per this review's explicit instruction to keep it as-is.

---

## 13. K. Media Model — **[R15], [R16], [R22]**

- `project_media` (§2.9): normalized inventory, never comma-separated URLs, `UNIQUE(storage_bucket, storage_path)`.
- `invitation_version_media` (§2.15) replaces the Revision 1 `media_refs UUID[]` design with a real FK-backed junction table. `project_media_id → project_media.id ON DELETE RESTRICT` gives an actual database-enforced guarantee: a `project_media` row referenced by **any** retained `invitation_versions` snapshot — current published, superseded published, or review — cannot be deleted, full stop. This is stronger and simpler than Revision 1's plan (a trigger checking only the *current* published pointer), and directly satisfies **[R22]**'s requirement that historical snapshot dependencies aren't allowed to quietly disappear just because they're no longer the current one.
- **Storage cleanup order — [R15]:** there is no atomic transaction spanning Postgres and Supabase Storage, and this plan does not claim otherwise. When a `project_media` row is genuinely deletable (no `invitation_version_media` reference), the server deletes the **database row first**, then the **Storage object second**. If the Storage deletion step fails or crashes after the DB commit, the result is an orphaned Storage object — a safe failure mode (wasted storage, cleanable later by a maintenance job) — rather than the reverse order's failure mode (a dangling DB reference to already-missing storage, which could be treated as still-valid by some other code path). Preferring an orphaned object over a broken published invitation is the explicit design intent.
- **Asset immutability — [R16]:** once referenced by `invitation_version_media`, `project_media.storage_bucket`/`storage_path` cannot be mutated in place (`guard_project_media_asset_immutability()`, §2.9). Replacing an asset creates a new `project_media` row.

---

## 14. L. Activity Log — **[R17]**

Restated at §2.22. Logged: customer submission received, canonical data applied from intake, review version created/link issued, revision requested, customer approved, project marked paid, invitation published/republished, access link revoked/rotated, guest imported/revoked, staff assignment changed, project status changed/archived. Not logged: field-level keystrokes, page views, read access. Write path is exclusively the `log_activity(...)` `SECURITY DEFINER` function — no table-level INSERT policy exists for any role, closing the "ordinary staff session manufactures arbitrary audit rows" gap from Revision 1.

---

## 15. M. RLS Matrix (corrected)

Per §1.6, anonymous/guest-token/all three customer-token types never receive direct RLS grants — every cell for those columns is either `—` (no access at all) or `server-only` (trusted server code + `service_role` after independent validation). Per §R-Q1, STAFF sees/manages **all** Projects — no narrower "assigned-only" variant is presented, since that question is now resolved, not open.

| Table / domain | Anonymous | Guest token | Customer INTAKE | Customer REVIEW | Customer PORTAL | STAFF | ADMIN |
|---|---|---|---|---|---|---|---|
| `profiles` | — | — | — | — | — | R (all); own `display_name` U | R/U (role, is_active) via `admin_create_profile`/UPDATE; no D |
| `customers` | — | — | **—** (never — [R5]) | — | — | R/C/U | R/C/U; no D (§Q5) |
| `projects` | — | — | server-only (minimal display context read) | server-only | server-only | R/C/U (U frozen post-`PAID`, §7) | same; no D |
| `service_packages`, `service_addons` | — | — | — | — | server-only (price display) | R | R/C/U; no hard D once used |
| `project_addons` | — | — | — | — | server-only | R/C/U (frozen post-`PAID`) | same |
| `wedding_details` | — | — | **—** (submissions land in `intake_submissions`, not here — [R5]) | server-only | — | R/C/U | R/C/U |
| `project_events` | — | — | **—** (same reason) | server-only | server-only (event summary) | R/C/U/D | R/C/U/D |
| `project_media` | — | server-only (signed URL for published media) | — (upload-during-intake deferred, not yet scoped) | server-only | server-only | R/C/U/D (RESTRICT/trigger-guarded) | same |
| `templates`, `template_versions` | — | — | — | — | — | R | R/C/U; no hard D once used |
| `project_design` | — | — | — | server-only | — | R/C/U | R/C/U |
| `project_invitations` | server-only (public_slug route resolution) | server-only | — | server-only | server-only (link display) | R/C/U/D (D only pre-publish) | same |
| `invitation_versions` | server-only (published payload render) | server-only | — | server-only (review payload render) | — | R/C (INSERT via authenticated session, §1.4); no U/D | R/C; no U/D |
| `invitation_version_media` | — | — | — | — | — | R/C (alongside parent version); no U/D | same |
| `intake_submissions` | — | — | server-only (**C only** — a submission, never a customer row, §R5) | — | — | R/U (status/note); no D | same |
| `project_access_links` | — | — | — | — | — | R/C/U (revoke/rotate); no D | R/C/U/D-exceptional |
| `review_feedback` | — | — | — | server-only (C via review flow, trigger-guarded) | — | R; no C/U/D | R; no C/U/D |
| `guests` | — | server-only (resolve own row only) | — | — | server-only (Guest Tool, entitlement-gated) | R/C/U/D | same |
| `rsvps` | — | server-only (C/U own row only, §J) | — | — | server-only (R aggregate/list) | R; no C/U/D | R; D only |
| `project_tasks` | — | — | — | — | — | R/C/U/D | same |
| `activity_logs` | — | — | — | — | — | R; C only as a side effect of a trusted business-action function (§2.22/**[F13]** — `log_activity()` itself is not directly callable by any role, including `authenticated`); no U/D | same |

Legend: R=SELECT, C=INSERT, U=UPDATE, D=DELETE, `—`=no access, `server-only`=no RLS grant, trusted server code + `service_role` after independent validation.

---

## 16. N. Migration Order — **[R10], corrected by [F7], [F15], [F16], [F17], [F18]**

Circular dependency between `project_invitations` (pointer columns) and `invitation_versions` (the table those pointers target) is resolved as before (§R10). This revision additionally fixes: `project_media` now precedes `wedding_details` (**[F7]**, since `wedding_details` gained composite FKs to `project_media` in **[F6]**); `log_activity()` moves entirely into `0020` (**[F15]** — no more "0002 or defer" alternative); `guard_project_media_asset_immutability()` moves entirely into `0013b` (**[F16]** — no more "create now or defer" alternative); `project_access_links` is written before `intake_submissions` directly, with no separate reordering note (**[F17]**). Every migration below is listed exactly once, in its final order — nothing here says "or Task 002 may choose."

```text
0001_extensions_and_helpers.sql
    - CREATE EXTENSION IF NOT EXISTS pgcrypto;
    - set_updated_at() trigger function.

0002_profiles.sql
    - profiles table (id references auth.users, no default — §1.1), RLS.
    - current_user_role(), is_staff(), is_admin() — hardened per §1.3
      (SET search_path = '', owner has BYPASSRLS, REVOKE FROM PUBLIC + GRANT).
    - admin_create_profile() SECURITY DEFINER function.
    - guard_last_active_admin() (concurrency-safe via pg_advisory_xact_lock,
      [F12]), guard_self_role_escalation() triggers.
    - profiles RLS policies: SELECT/self-UPDATE branch via is_staff(), per [F11].
    - log_activity() is NOT created here ([F15] — see 0020 instead).

0003_catalog_packages_addons.sql
    - service_packages, service_addons + RLS. Seed rows: COMMON (150000),
      SEPARATE (250000), PERSONALIZED_GUEST addon (50000).

0004_customers.sql
0005_projects.sql
    - projects table + project_code_seq (BIGINT sequence) + generate_project_code()
      (§1.7, [F2]) + RLS.
    - guard_project_commercial_freeze() (projects side, now monotonic — [F8]:
      also blocks PAID → UNPAID, not only the six commercial columns) + CHECK
      constraints (total_price_vnd consistency, payment_status/paid_at consistency).

0006_project_addons.sql
    - project_addons + RLS.
    - guard_project_addon_identity_immutability() ([F9], new — freezes
      project_id/service_addon_id/snapshot columns/created_by/created_at
      unconditionally).
    - guard_project_commercial_freeze() (addons side) + sync_project_commercial_totals()
      trigger.

──────────────────────── WEEK 1 / FOUNDATION BOUNDARY ────────────────────────

0007_project_media.sql — reordered per [F7]
    - project_media table + RLS + UNIQUE(storage_bucket, storage_path) +
      UNIQUE(id, project_id) (the latter added as a composite-FK target
      needed by 0008's wedding_details and by 0013b's invitation_version_media).
    - guard_project_media_asset_immutability() is NOT created here ([F16] —
      see 0013b instead; its EXISTS check needs invitation_version_media,
      which does not exist until 0013b).

0008_wedding_details.sql — reordered per [F7]
    - wedding_details table + RLS, including the two gift/bank field pairs.
    - composite FKs (groom_bank_qr_media_id, project_id) and
      (bride_bank_qr_media_id, project_id) → project_media(id, project_id),
      ON DELETE RESTRICT ([F6]) — valid here because project_media (0007)
      already exists.

0009_project_events.sql
    - includes is_primary partial unique index (§2.8, [R21]).
0010_templates_and_versions.sql
0011_project_design.sql
0012_project_invitations.sql — [R10]
    - project_invitations table WITH bare nullable
      current_review_version_id/published_version_id columns and
      NO foreign key on them yet.
    - UNIQUE(project_id, variant), UNIQUE(id, project_id) ([F3] composite-FK
      target for 0013's invitation_versions).
    - public_slug column (no DEFAULT — [F1]) + generate_invitation_slug()
      + set_invitation_public_slug() BEFORE INSERT trigger ([F1]) — valid
      here since it only needs projects.project_code (0005) and the row's
      own NEW.project_id/NEW.variant, no ordering hazard.
0013_invitation_versions.sql — [R10]
    - invitation_versions table, including denormalized project_id ([R11-D]).
    - Composite FK (invitation_id, project_id) → project_invitations(id, project_id)
      ON DELETE RESTRICT ([F3] — replaces two independent FKs from Revision 2).
    - UNIQUE(invitation_id, version_number), UNIQUE(invitation_id, id),
      UNIQUE(id, project_id) (the last is the [F5] composite-FK target
      needed by 0013b's invitation_version_media and by 0016's review_feedback).
    - Strengthened combined CHECK for REVIEW/PUBLISHED lifecycle fields ([F4]).
    - Composite self-referencing FK (invitation_id, source_review_version_id)
      + guard_source_review_version_type() trigger.
0013b_complete_invitation_pointer_graph_and_media.sql — [R10], [F16]
    - ALTER TABLE project_invitations ADD CONSTRAINT ... (the two composite
      FKs to invitation_versions, §2.13.1).
    - guard_invitation_pointer_types() trigger on project_invitations.
    - guard_invitation_immutable_after_publish() trigger on project_invitations
      (deletion now additionally gated by 0013's [F3] composite RESTRICT FK).
    - invitation_version_media junction table (invitation_version_id,
      project_media_id, project_id) + the two composite FKs described in
      [F5] (§2.15) + index on (project_media_id, project_id).
    - guard_project_media_asset_immutability() is created HERE, not in 0007
      ([F16]) — this is the first point at which invitation_version_media
      exists for its EXISTS check to reference; the trigger is then attached
      to project_media (already created in 0007) via
      ALTER TABLE project_media ... (the table doesn't need to be re-created,
      only the trigger function + CREATE TRIGGER, both of which belong in
      this migration alongside their dependency).
    (Split into its own file specifically so Task 002 is not tempted to
    discover this ordering problem mid-way through authoring 0012/0013 —
    the dependency is resolved by construction, not by trial and error.)

0014_project_access_links.sql — final order per [F17], no reordering note needed
    - project_access_links + RLS + UNIQUE(token_hash) + UNIQUE(id, project_id)
      (composite-FK target for 0015's intake_submissions and 0016's
      review_feedback).
    - guard_access_link_identity_immutability() ([F14], new).

0015_intake_submissions.sql — final order per [F17]
    - includes composite FK (access_link_id, project_id) →
      project_access_links(id, project_id) + guard_intake_link_type() trigger
      — valid here since 0014 already exists.
    - guard_intake_submission_immutability() trigger (**[G2]**, new) — blocks
      any UPDATE that changes project_id/access_link_id/payload/submitted_at.

0016_review_feedback.sql
    - composite FKs to project_access_links (0014) and invitation_versions
      (0013, now trustworthy per [F3]'s re-check) + guard_review_link_type(),
      guard_feedback_targets_review_version(),
      guard_approval_targets_current_review() triggers.
0017_guests.sql
    - composite FK (project_id, invitation_variant) → project_invitations
      (project_id, variant), RESTRICT.
    - guard_guest_project_immutability() trigger (**[G1]**, new) — blocks any
      UPDATE that changes project_id.
0018_rsvps.sql
    - guard_rsvp_guest_same_project() trigger; partial unique index on
      guest_id; the corrected party_size CHECK ([R12]).
0019_project_tasks.sql
0020_activity_logs.sql
    - activity_logs table.
    - log_activity() SECURITY DEFINER function created HERE ([F15], not 0002)
      — REVOKE EXECUTE FROM PUBLIC with no subsequent GRANT to any role
      ([F13] — private, internal-only, callable only from other
      SECURITY DEFINER business-action functions, none of which are
      authored in Task 002/Foundation; they are later feature-implementation
      work that this plan's architecture accommodates).
```

---

## 17. O. V1 Collision Check

Unchanged from Revision 1. Known V1 objects (`docs/LEGACY_AUDIT.md`): tables `invitations`, `weddings`, `wishes`; bucket `wedding-photos`. No proposed V2 name collides (including the new `invitation_version_media`). This plan does not modify, rename, or drop any of them. The one prior collision risk (`invitations`) was resolved by the permanent `project_invitations` naming (§0). The verification gap noted in Revision 1 stands: a read-only `information_schema`/Storage listing check immediately before migration `0001` is still recommended, since this task does not itself query live Supabase state.

---

## 18. P. Admin Bootstrap and Last-Admin Safety — **[R23]**

### P.1 — Initial ADMIN bootstrap, without hard-coding a person into a migration

No migration file inserts a real person's UUID/email. Procedure, run once per environment (dev/staging now, production later), **outside** version control:

1. Migration `0002` creates `profiles`, its RLS, and `admin_create_profile()`, but seeds **no** row.
2. An operator creates the first Supabase Auth user for themselves via the Supabase Dashboard (or Auth Admin API) in that environment.
3. The operator runs a one-off, manually-executed `service_role` SQL statement (documented in an operator runbook, not committed as a migration):
   ```text
   INSERT INTO profiles (id, role, display_name, is_active)
   VALUES ('<that operator's own auth.users.id, looked up after step 2>', 'ADMIN', '<name>', true);
   ```
4. From that point on, this first admin uses `admin_create_profile()` (§2.1) through the normal authenticated-session app UI to create every subsequent STAFF/ADMIN profile — no further manual SQL is needed.

This keeps zero real person's identifier in source control while still giving a clean, repeatable bootstrap path for dev, staging, and (later) the separate production Supabase project (§0).

### P.2 — Never zero active admins

`guard_last_active_admin()` (§2.1): before any `UPDATE` on `profiles` that would demote (`role` away from `'ADMIN'`) or deactivate (`is_active` to `false`) a row that is currently an active `ADMIN`, the trigger counts *other* active admins; if that count is zero, the update is rejected. This guarantees the system can never reach zero active admins through any normal `UPDATE` path — including an admin trying to deactivate themselves as the last one standing.

---

## Q. Final Self-Review — **[R26], re-run for Revision 3 per [F18]**

- All 18 Revision-3 review items are addressed and tagged **[F#]** at their point of resolution: F1 (§2.13, public_slug trigger, not a column DEFAULT), F2 (§1.7, `project_code_seq`/`generate_project_code()`, with every stale "§6" reference corrected to "§1.7"), F3 (§2.14, composite FK `invitation_versions(invitation_id,project_id)→project_invitations(id,project_id)`, plus the required `review_feedback` re-check), F4 (§2.14, strengthened combined `CHECK` making a sourceless `PUBLISHED` row impossible), F5 (§2.15, `invitation_version_media` gains `project_id` + two composite FKs), F6 (§2.7, `wedding_details`' gift-QR composite FKs to `project_media`), F7 (§16, `project_media` migrated before `wedding_details`), F8 (§2.3, monotonic payment freeze — `PAID→UNPAID` now blocked), F9 (§2.6, `guard_project_addon_identity_immutability()`), F10 (§2.11, `guard_template_version_immutability()`, `manifest` now frozen), F11 (§1.3/§2.1, `profiles` SELECT/self-UPDATE now require `is_staff()`, single non-recursion mechanism), F12 (§2.1, `pg_advisory_xact_lock` makes the last-admin guard actually concurrency-safe), F13 (§2.22, `log_activity()` no longer granted to any externally-reachable role), F14 (§2.17, `guard_access_link_identity_immutability()`), F15 (§16, `log_activity()` placed solely in `0020`), F16 (§2.9/§16, `guard_project_media_asset_immutability()` placed solely in `0013b`), F17 (§16, `project_access_links` before `intake_submissions`, stated directly), F18 (this section and the walk below).
- Revision 2's own **[R#]** resolutions remain intact except where an **[F#]** tag above explicitly supersedes part of one (R7↔F8/F9, R9↔F3/F4, R15↔F5, R16↔F16, R17↔F13, R18↔F1, R20↔F6).
- No remaining "if stored here" / "optional if needed" / "or equivalent" / "as appropriate" phrasing, and (per **[F18]**) no remaining "Task 002 may choose either" alternative anywhere in the plan — every placement/mechanism decision is stated once, directly (verified by direct search; see the final task report's `DEPENDENCY WALK RESULT`).
- Docs cross-checked for agreement: `docs/DATABASE.md`'s `wedding_details`/`project_addons`/`project_invitations`/`invitation_versions` sections are synced to the **[F#]** mechanisms in the same task (see final report `FILES CHANGED`); nothing in Revision 2's already-synced doc changes is contradicted by this revision.
- No open questions remain — every item the second review raised was resolved by an explicit mechanism above, not deferred.

### Final Dependency Walk — **[F18]**

Walked the entire `0001`→`0020` order in §16 in sequence. Result, per migration: every table a later migration's FK/trigger/composite-FK references already exists by that point (notably: `project_media` at `0007` before `wedding_details` at `0008` consumes it; `project_invitations`' `UNIQUE(id,project_id)` at `0012` before `invitation_versions`' composite FK at `0013` consumes it; `invitation_versions`' `UNIQUE(id,project_id)`/`UNIQUE(invitation_id,id)` at `0013` before `0013b`'s pointer FKs and `invitation_version_media` consume them; `project_access_links` at `0014` before `intake_submissions` at `0015` and `review_feedback` at `0016` consume it); every `UNIQUE` a composite FK targets is declared in the same or an earlier migration than the FK itself; every trigger function's referenced relation exists no later than the migration that creates the trigger (`guard_project_media_asset_immutability()` specifically deferred to `0013b` rather than `0007`, per **[F16]**); every column `DEFAULT` used (`generate_project_code()` on `projects.project_code`) is a self-contained function call with no reference to sibling columns, which is valid, while the one case that would have been invalid (`public_slug`) uses a `BEFORE INSERT` trigger instead, per **[F1]**; no step is described with more than one acceptable ordering. **Result: no broken forward reference found.**

---

### Revision 4 — Final Micro Patch

Two further items surfaced by a third external review, tagged **[G1]**/**[G2]** (distinct from the **[F#]** series to mark them as a separate, later patch): **[G1]** `guests.project_id` is now DB-guarded immutable after `INSERT` via `guard_guest_project_immutability()` (§2.19) — closing the gap where `rsvps.guard_rsvp_guest_same_project()` validated the guest/project relationship only at RSVP-write time, not for the remaining lifetime of the guest row. **[G2]** `intake_submissions`' `project_id`/`access_link_id`/`payload`/`submitted_at` are now DB-guarded immutable via `guard_intake_submission_immutability()` (§2.16) — replacing the "by convention" wording with an actual trigger; only `status`/`reviewed_by`/`reviewed_at`/`staff_note` may change through a normal `UPDATE`. Both are additive guards on already-defined tables; no other table, migration step, or architectural decision changed.

---

## R. Implementation Readiness

**READY** for Task 002 (Week 1/Foundation migration batch `0001`–`0006`), pending this revision's own external review. Revision 2's structural gaps, Revision 3's 18 targeted SQL/integrity corrections, and Revision 4's two final guards (**[G1]**, **[G2]**) are now resolved with one exact, unambiguous, dependency-ordered mechanism each, per §Q, the Final Dependency Walk, and this Revision 4 note.
