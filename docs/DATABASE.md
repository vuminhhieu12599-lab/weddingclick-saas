# WeddingClick V2 — Database Design Specification

**Status:** Approved logical schema. Physical column types, constraints, indexes, and RLS policy intent are specified in `docs/PHYSICAL_DATABASE_PLAN.md`, which governs where the two documents differ.  
**Last updated:** 2026-09-10 (updated by Task 001 — table renamed to `project_invitations`, see `docs/DECISIONS.md`)

## 1. Database Principles

1. One canonical source for each piece of business data.
2. Use foreign keys for real domain relationships.
3. Use database constraints for critical integrity rules.
4. Use UUID-style internal identifiers unless a documented exception exists.
5. Human-readable Project codes are identifiers for people, not security credentials.
6. Use timestamps/date types for actual date/time values; never use free-form text as the canonical event date/time.
7. Money is integer VND.
8. Public access is minimal; sensitive writes go through trusted server logic.
9. V2 schema changes must be migrations in source control.
10. Legacy V1 tables remain until explicit retirement approval.

---

## 2. Core Entity Relationship Overview

```text
auth.users
    │
    └── profiles

customers
    │
    └── projects
          ├── wedding_details
          ├── project_events
          ├── project_media
          ├── project_design
          ├── project_addons ── service_addons
          ├── project_invitations ─ template_versions ── templates
          │      └── invitation_versions
          ├── intake_submissions
          ├── project_access_links
          ├── review_feedback
          ├── guests
          │      └── rsvps
          ├── project_tasks
          └── activity_logs

projects ── service_packages
projects ── profiles (assigned staff)
```

Exact FK directions are defined below conceptually.

---

## 3. `profiles`

Purpose: internal WeddingClick identity/profile linked to Supabase Auth.

Suggested fields:

- `id` — `UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`. **Exception to the global "every table gets `DEFAULT gen_random_uuid()`" rule** — a profile's id is always exactly the `auth.users` id it extends, never freshly generated. See `docs/PHYSICAL_DATABASE_PLAN.md` §1.1/§2.1.
- `role` — `ADMIN` or `STAFF` for V1.
- `display_name`.
- `is_active`.
- `created_at`.
- `updated_at`.

Rules:

- no public read/write;
- authenticated users can read only data necessary for application use according to authorization policy;
- admin-only staff-management mutations.

---

## 4. `customers`

Purpose: person buying/owning a WeddingClick Project.

Suggested fields:

- `id`.
- `display_name` / `name`.
- `phone` optional.
- `email` optional.
- `contact_note` optional.
- `created_by` profile FK.
- `created_at`.
- `updated_at`.

Rules:

- not public;
- one customer may own multiple Projects over time;
- customer token access should not automatically grant direct table-wide access.

---

## 5. `service_packages`

Purpose: current package catalog.

Initial package codes:

- `COMMON`
- `SEPARATE`

Suggested fields:

- `id`.
- `code` unique.
- `name`.
- `description`.
- `price_vnd` integer >= 0.
- `is_active`.
- `created_at`.
- `updated_at`.

Do not rely on this table for historical Project pricing. Projects store snapshots.

---

## 6. `service_addons`

Purpose: add-on catalog.

Initial code:

- `PERSONALIZED_GUEST`

Suggested fields:

- `id`.
- `code` unique.
- `name`.
- `description`.
- `price_vnd` integer >= 0.
- `is_active`.
- timestamps.

---

## 7. `projects`

Purpose: one operational customer order/event.

Suggested fields:

- `id` UUID PK.
- `project_code` unique human-readable code, e.g. `WC-2026-000001`.
- `customer_id` FK.
- `event_type` — V1 `WEDDING`.
- `status`.
- `deadline_at` nullable.
- `assigned_staff_id` nullable FK to profiles.
- `service_package_id` nullable/current catalog relation.
- `package_code_snapshot`.
- `package_name_snapshot`.
- `base_price_vnd` integer >= 0.
- `addon_total_vnd` integer >= 0.
- `total_price_vnd` integer >= 0.
- `payment_status` — V1 `UNPAID` / `PAID`.
- `paid_at` nullable.
- `internal_note` optional.
- `created_by` profile FK.
- `created_at`.
- `updated_at`.
- `completed_at` nullable.
- `archived_at` nullable.

Constraints:

- non-negative prices;
- `total_price_vnd` must be consistent with agreed business rules at application boundary; database may additionally enforce non-negative totals;
- project code unique.

Do not store copied bride/groom/event presentation fields here unless they are truly Project-level summary/cache fields approved later.

---

## 8. `project_addons`

Purpose: add-ons purchased for a Project.

Suggested fields:

- `id`.
- `project_id` FK, `ON DELETE CASCADE`.
- `service_addon_id` FK, `ON DELETE RESTRICT`.
- `addon_code_snapshot`.
- `addon_name_snapshot`.
- `price_vnd_snapshot`.
- `created_by` nullable profile FK.
- `revoked_at`, `revoked_by`, `revoked_reason` — soft-revocation; rows are never deleted, only revoked. Re-adding after revocation creates a new row (new price snapshot); entitlement derives from non-revoked rows only. `project_id`, `service_addon_id`, both snapshot fields, `created_by`, and `created_at` are DB-guarded as permanently immutable after insert (an add-on can never be reassigned to a different Project). The revocation trio may be set once, from `NULL` to non-`NULL` (the first revocation), only while the parent Project is `UNPAID`; once `revoked_at` is non-`NULL` it is DB-guarded as immutable — it can never be reset to `NULL` ("un-revoking") and never changed to a different value (rewriting revocation history) — and the whole trio is additionally frozen (blocked from even a first revocation) once the parent Project is `PAID`. Choosing the same add-on again after revocation, while still `UNPAID`, always creates a new row. See `docs/PHYSICAL_DATABASE_PLAN.md` §2.6 for the exact trigger mechanism.
- `created_at`.

Constraint:

- partial unique index `(project_id, service_addon_id)` where `revoked_at IS NULL` — at most one *active* row per Project/add-on.

Once the parent Project's `payment_status = 'PAID'`, add-ons (and the Project's package fields) become frozen — no normal insert/update/revoke is possible. Commercial addon mutations for one Project are serialized by locking the parent `projects` row before mutation, so concurrent add-on changes cannot produce a lost-update/stale-total race, and an add-on mutation cannot race the `UNPAID → PAID` transition itself. See `docs/PHYSICAL_DATABASE_PLAN.md` §2.6/§D for the exact trigger mechanism and how totals stay atomically consistent.

Entitlement such as Guest Tool must derive from Project add-on state, not an arbitrary browser boolean.

---

## 9. `wedding_details`

Purpose: one canonical wedding-specific detail record per wedding Project.

Suggested fields:

- `id`.
- `project_id` unique FK.
- `groom_name`.
- `bride_name`.
- `groom_father` optional.
- `groom_mother` optional.
- `bride_father` optional.
- `bride_mother` optional.
- `groom_family_address` optional.
- `bride_family_address` optional.
- `invitation_message` optional.
- `love_story` optional.
- `lunar_date_display` optional (display-only until/if a canonical lunar-date system is implemented).
- `additional_note` optional.
- `groom_bank_name`, `groom_bank_account_name`, `groom_bank_account_number`, `groom_bank_qr_media_id` — groom-side gift account, shown on GROOM invitations and on COMMON.
- `bride_bank_name`, `bride_bank_account_name`, `bride_bank_account_number`, `bride_bank_qr_media_id` — bride-side gift account, shown on BRIDE invitations and on COMMON. See `docs/PHYSICAL_DATABASE_PLAN.md` §2.7 for exact types/nullability; resolved as fixed fields on this table (not a separate normalized table) since the cardinality is permanently exactly two sides.
- Both QR media references use a **composite FK against `(project_media.id, project_media.project_id)`**, not a plain FK to `project_media(id)` alone — this guarantees at the database level that a gift QR image cannot belong to a different Project's media inventory. See `docs/PHYSICAL_DATABASE_PLAN.md` §2.7.
- timestamps.

Constraint:

- unique `project_id`.

Wedding-specific fields may evolve, but must remain canonical and shared across variants.

---

## 10. `project_events`

Purpose: date/time/venue records for wedding events.

Suggested fields:

- `id`.
- `project_id` FK.
- `occasion_type` — examples `VU_QUY`, `THANH_HON`, `RECEPTION`, `CUSTOM`. (Named `occasion_type`, not `event_type`, to avoid colliding in vocabulary with `projects.event_type`, which is the unrelated top-level `EventType` concept — `WEDDING` today, future `BIRTHDAY`/etc.)
- `side` — `COMMON`, `GROOM`, `BRIDE` or approved neutral value.
- `title`.
- `starts_at` canonical timestamp.
- `timezone` default `Asia/Ho_Chi_Minh`.
- `venue_name` optional.
- `address` optional.
- `map_url` optional.
- `description` optional.
- `sort_order` integer.
- `is_primary` boolean, `NOT NULL DEFAULT false` — at most one primary event per `(project_id, side)`, enforced by a partial unique index. See `docs/PHYSICAL_DATABASE_PLAN.md` §2.8 for the exact resolution rule the variant resolver uses (which side's primary event feeds countdown/calendar for COMMON/GROOM/BRIDE).
- timestamps.

Indexes:

- `project_id`.
- `(project_id, starts_at)`.
- unique partial index on `(project_id, side)` where `is_primary = true`.

Do not store weekday as canonical data; derive it.

---

## 11. `project_media`

Purpose: normalized media inventory for a Project.

Suggested fields:

- `id`.
- `project_id` FK.
- `media_type` — `COVER`, `GALLERY`, `AUDIO`, `QR_GROOM`, `QR_BRIDE`, etc.
- `storage_bucket`.
- `storage_path`.
- `mime_type` optional.
- `size_bytes` optional.
- `width`/`height` optional for images.
- `alt_text` optional.
- `sort_order` integer.
- `created_by`.
- timestamps.

Indexes:

- `(project_id, media_type)`.

Do not store lists as comma-separated text.

Deletion must consider published-version references.

---

## 12. `templates`

Purpose: template family/catalog entry.

Suggested fields:

- `id`.
- `code` unique, e.g. `elegant-editorial`.
- `event_type`.
- `name`.
- `description`.
- `is_active`.
- `sort_order`.
- `preview_media_path` optional.
- timestamps.

A template family can have many implementation versions.

---

## 13. `template_versions`

Purpose: immutable logical version metadata for a template implementation.

Suggested fields:

- `id`.
- `template_id` FK.
- `version_number` integer/string with defined ordering.
- `renderer_key` unique, e.g. `wedding.elegant-editorial.v1`.
- `manifest` JSONB for supported features/presets metadata. **Frozen after creation, DB-guarded** — a changed manifest requires a new template version (`docs/CLAUDE.md` §9), not an in-place edit.
- `created_at`.
- `retired_at` nullable — single source of truth for availability (`NULL` = selectable for new projects/designs; non-null = retired). No separate `is_active_for_new_projects` boolean, to avoid two fields that could disagree about the same fact. **`retired_at` is the only column a normal `UPDATE` may ever change** — see `docs/PHYSICAL_DATABASE_PLAN.md` §2.11.

Constraint:

- unique `(template_id, version_number)`.
- unique `renderer_key`.

Never mutate an old production renderer’s visual contract in place.

---

## 14. `project_design`

Purpose: one shared design configuration for a Project.

Suggested fields:

- `id`.
- `project_id` unique FK.
- `template_version_id` FK.
- `palette_key`.
- `font_preset_key`.
- `effect_preset_key`.
- `section_settings` JSONB.
- `design_settings` JSONB for template-approved options only.
- timestamps.

Rules:

- default V1 assumption: all variants for one Project use the same project design.
- per-variant override is not a V1 requirement.
- settings keys must be validated against template manifest, not accepted blindly.

---

## 15. `project_invitations`

**Physical name approved by Task 001 (`docs/DECISIONS.md`): `project_invitations`.** This is the permanent name, not a placeholder — it is not renamed back to `invitations` at any point. It exists specifically so V1's own `invitations` table can remain untouched with no naming collision.

Purpose: logical invitation variant belonging to a Project.

Suggested fields:

- `id`.
- `project_id` FK.
- `variant` — `COMMON`, `GROOM`, `BRIDE`.
- `public_slug` — `TEXT NOT NULL UNIQUE`, the public routing identifier (not an authorization credential), generated from `project_code` + `variant` and stable/frozen after first publish. Set by a `BEFORE INSERT` trigger, **not a column `DEFAULT`** — a `DEFAULT` expression cannot reference sibling columns of the same row, which `project_code`+`variant`-based generation requires. See `docs/PHYSICAL_DATABASE_PLAN.md` §2.13.
- `current_review_version_id` nullable.
- `published_version_id` nullable.
- `created_at`.
- `updated_at`.

Critical constraint:

- unique `(project_id, variant)`.

Package entitlement determines which variants are allowed.

Do not store duplicated groom/bride/family/event data here.

---

## 16. `invitation_versions`

Purpose: stable Review/Published snapshots.

Suggested fields:

- `id`.
- `invitation_id` FK (references `project_invitations`).
- `version_number`.
- `version_type` — `REVIEW` / `PUBLISHED`.
- `source_review_version_id` nullable self-referencing FK — for a `PUBLISHED` row, which `REVIEW` row's payload it was copied (promoted) from.
- `template_version_id` FK.
- `renderer_key_snapshot` redundant safety metadata.
- `payload` JSONB containing normalized render snapshot.
- Media dependencies are recorded in a separate normalized junction table, `invitation_version_media` (`invitation_version_id`, `project_media_id`, `ON DELETE RESTRICT` toward `project_media`) — not a denormalized array column on this table. This gives a real FK-enforced guarantee that media referenced by any retained snapshot (current or historical) cannot be deleted. See `docs/PHYSICAL_DATABASE_PLAN.md` §2.15/§K.
- `created_by` nullable profile FK.
- `created_at`.
- `published_at` nullable.

Rows are fully immutable and append-only: no application role may `UPDATE` or `DELETE` a row once created. Publish is copy-on-publish — a `PUBLISHED` row's payload is copied verbatim from the approved `REVIEW` row, never re-derived from draft state at the moment of publishing.

Constraints:

- unique `(invitation_id, version_number)`.

Rules:

- treat snapshot payload as immutable after creation;
- published public output must use a published version;
- republish creates/activates a new published version rather than mutating an old one.

---

## 17. `intake_submissions`

Purpose: customer-submitted information waiting for review/application.

Suggested fields:

- `id`.
- `project_id` FK.
- `access_link_id` FK optional.
- `payload` JSONB.
- `status` — `TEXT CHECK IN ('PENDING','APPLIED','REJECTED')`, default `'PENDING'`.
- `submitted_at`.
- `reviewed_by` nullable.
- `reviewed_at` nullable.
- optional staff note.

Customer submission should not automatically overwrite canonical data unless a future approved rule explicitly allows it.

`id`, `project_id`, `access_link_id`, `payload`, and `submitted_at` are DB-guarded as immutable after insert — this is an append-only audit record of exactly what the customer submitted, not a convention staff/code review must remember to respect. A normal `UPDATE` may only ever change `status`, `reviewed_by`, `reviewed_at`, and `staff_note`. See `docs/PHYSICAL_DATABASE_PLAN.md` §2.16.

---

## 18. `project_access_links`

Purpose: secure capability links for customers.

Types:

- `INTAKE`
- `REVIEW`
- `PORTAL`

Suggested fields:

- `id`.
- `project_id` FK.
- `link_type`.
- `token_hash` — `BYTEA`, SHA-256 digest (32 bytes) of the raw token, unique.
- `token_hint` optional non-sensitive prefix/suffix for staff display.
- `expires_at` nullable.
- `revoked_at` nullable — sole source of truth for active/revoked state (no separate `is_active` boolean). Rotation creates a new row and revokes the old one; token values are never updated in place. **DB-guarded, not just by convention:** `id`, `project_id`, `link_type`, `token_hash`, `token_hint`, `created_by`, `created_at` (seven columns) cannot be changed by any normal `UPDATE` — only `revoked_at`, `expires_at`, and `last_used_at` may change (Task-014 approved hardening added `token_hint` and `id` to the immutable set alongside `token_hash`; `id` is included because a primary key is otherwise updatable). `revoked_at` is additionally monotonic: the first `NULL → non-NULL` transition is allowed, then it is frozen forever — no un-revoking, no rewriting the revocation timestamp. See `docs/PHYSICAL_DATABASE_PLAN.md` §2.17.
- `created_by`.
- `created_at`.
- `last_used_at` optional.

No `review_version_group/reference` field: approval is anchored per-version through `review_feedback.invitation_version_id` instead of pinning the link itself to one version (see `docs/PHYSICAL_DATABASE_PLAN.md` §F and Open Question Q2).

Raw token is never stored — only its SHA-256 hash.

`service_role` receives only `SELECT` and `UPDATE` object privileges on this table (Task-014 approved hardening) — no `INSERT`, no `DELETE`. This supports the trusted-server-only token resolution flow (look up by `token_hash`, then update `last_used_at`) without granting `service_role` the ability to create or delete links. Normal staff link creation/revocation/rotation stays on the authenticated-session + RLS path. See `docs/PHYSICAL_DATABASE_PLAN.md` §2.17/§10.

`created_by` is immutable (above) and `profiles` are deactivate-only in normal operation, never hard-deleted — an exceptional out-of-band hard-delete of the referenced `profiles`/`auth.users` row is expected to fail rather than silently null out `created_by`. This is accepted provenance-protection behavior, not a defect. See `docs/PHYSICAL_DATABASE_PLAN.md` §5/C for the full explanation (also applies to `project_addons`).

Indexes:

- unique `token_hash`.
- `(project_id, link_type, revoked_at)`.

---

## 19. `review_feedback`

Purpose: customer review feedback and approval events.

Suggested fields:

- `id`.
- `project_id` FK.
- `access_link_id` or review session FK.
- `invitation_version_id` where feedback applies to a specific version.
- `feedback_type` — `COMMENT`, `REVISION_REQUEST`, `APPROVAL`.
- `message` optional.
- `created_at`.

Approval must be tied to the reviewed version/state rather than an unspecified future draft.

---

## 20. `guests`

Purpose: personalized guest records.

Suggested fields:

- `id`.
- `project_id` FK. **Immutable after insert** — a Guest belongs permanently to the Project it was created under; there is no "move to another Project" operation. If a guest was created under the wrong Project, staff creates a new Guest record rather than reassigning this one. DB-guarded, not by convention — see `docs/PHYSICAL_DATABASE_PLAN.md` §2.19.
- `display_name` required.
- `invitation_variant` nullable/controlled depending on package.
- `group_name` optional.
- `phone` optional.
- `note` optional.
- `created_by` nullable profile FK — staff accountability for manual entry/Excel import.
- `token_hash` — `BYTEA`, SHA-256 digest (32 bytes) of the raw token, unique.
- `token_hint` optional.
- `revoked_at` nullable — sole source of truth for active/revoked state (no separate `is_active` boolean, consistent with `project_access_links`).
- `created_at`.
- `updated_at`.

Rules:

- display name is free-form;
- never parse display name for authorization or party size;
- guest creation requires personalized guest entitlement;
- token must be unpredictable and revocable by changing/invalidating guest access.

Indexes:

- `project_id`.
- `(project_id, invitation_variant)` if useful.
- unique `token_hash`.

---

## 21. `rsvps`

Purpose: attendance response.

Suggested fields:

- `id`.
- `project_id` FK.
- `guest_id` nullable FK (`ON DELETE SET NULL`, not cascade — deleting a guest must not destroy their actual RSVP response).
- `guest_display_name_snapshot` nullable — required (NOT NULL in effect via CHECK) when `guest_id` is null (non-personalized flow); for personalized flow, a copy of `guests.display_name` at submission time so the response stays legible even if the guest row is later removed.
- `attendance` — `TEXT CHECK IN ('ATTENDING','NOT_ATTENDING')`, not boolean (see `docs/PHYSICAL_DATABASE_PLAN.md` §A for rationale).
- `party_size` integer, bounded (`0`–`20`).
- `message` optional, bounded length.
- `created_at`.
- `updated_at`.

Rules:

- personalized guest has one current RSVP; enforced via a partial unique index on `guest_id WHERE guest_id IS NOT NULL`;
- `party_size` must be non-negative and bounded by an approved reasonable maximum (20);
- `attendance = 'ATTENDING'` requires `party_size` between 1 and 20; `attendance = 'NOT_ATTENDING'` requires `party_size = 0` — both directions enforced by a single hard `CHECK`;
- `guest_id IS NOT NULL OR guest_display_name_snapshot IS NOT NULL`, enforced by a hard `CHECK`;
- server validates Project/guest relationship;
- all writes (personalized and non-personalized) go through the trusted server RSVP use case — never a direct client `INSERT`/`UPDATE`.

Constraint:

- partial unique index on `guest_id` where `guest_id IS NOT NULL`.

Indexes:

- `project_id`.
- `guest_id`.

---

## 22. `project_tasks`

Purpose: operational task/deadline items.

V1 should remain lightweight.

Suggested fields:

- `id`.
- `project_id` FK.
- `title`.
- `status` — `TEXT CHECK IN ('TODO','IN_PROGRESS','DONE','CANCELLED')`, default `'TODO'`. Fixed controlled list, not arbitrary text.
- `due_at` nullable.
- `assigned_staff_id` nullable.
- `sort_order` optional.
- timestamps.

Do not turn this into a full ClickUp clone in V1.

---

## 23. `activity_logs`

Purpose: audit-oriented record of important Project actions.

Suggested fields:

- `id`.
- `project_id` FK, `ON DELETE CASCADE`.
- `actor_type` — `STAFF`/`CUSTOMER`/`GUEST`/`SYSTEM`.
- `actor_profile_id` nullable, `REFERENCES profiles(id) ON DELETE SET NULL`. Row-level `CHECK (actor_profile_id IS NULL OR actor_type = 'STAFF')` — one-way: non-`STAFF` rows can never carry it, while a `STAFF` row may still later read `NULL` here via the FK's own `ON DELETE SET NULL` (an exceptional profile hard-delete must not be blocked by an already-immutable audit row). The stricter two-way check is deliberately not used, for that reason.
- `action_type`.
- `summary`, `CHECK` length 1–500.
- `metadata` JSONB optional.
- `created_at`. No `updated_at` — the table is append-only.

No table-level `INSERT` policy exists for any role, including authenticated staff. Writes happen only as a side effect of trusted server business-action functions (e.g. publish, mark-paid, approve). The internal `log_activity(...)` helper that those functions call is **not** itself granted `EXECUTE` to any externally-reachable role (not `authenticated`, not `service_role`) — an ordinary authenticated session cannot manufacture an arbitrary audit row either by issuing a raw `INSERT` or by calling a generic logging RPC directly. See `docs/PHYSICAL_DATABASE_PLAN.md` §2.22/§L.

**Frozen signature:** `public.log_activity(p_project_id uuid, p_actor_type text, p_action_type text, p_summary text, p_metadata jsonb DEFAULT NULL) RETURNS void`. No `p_actor_profile_id` parameter and no overloads. When `p_actor_type = 'STAFF'`, the function requires `auth.uid() IS NOT NULL` and `public.is_staff()` (raising otherwise) and sets `actor_profile_id` from `auth.uid()` internally; for every other actor type, `actor_profile_id` is `NULL`. The function does not return the inserted row's `id`.

Log meaningful domain events, not every keystroke.

Examples:

- customer submission received;
- event data updated;
- review version created;
- revision requested;
- customer approved;
- marked paid;
- invitation published;
- portal link revoked.

Do not store secrets/tokens in logs.

---

## 24. Status/Enum Centralization

Exact Postgres enum vs text+constraint choice can be decided during physical schema design, but values must be centralized and constrained.

Important domains:

- ProjectStatus
- PaymentStatus
- EventType
- EventSide
- InvitationVariant
- AccessLinkType
- MediaType
- ReviewFeedbackType
- IntakeSubmissionStatus
- StaffRole

Do not allow arbitrary strings when business behavior depends on the value.

---

## 25. Required Index Review

Every migration must explicitly review indexes for:

- all foreign keys used in frequent joins;
- public lookup identifiers/slugs;
- token hashes;
- Project status/deadline listing;
- Project/customer relationship;
- guest/RSVP reporting;
- template renderer lookup.

Do not blindly index every column. Index based on known access patterns.

---

## 26. RLS Direction

Detailed rules live in `SECURITY.md`, but database creation must assume:

- no public unrestricted CRUD;
- internal staff access is authenticated and role-scoped;
- customer/guest token flows are normally mediated by server endpoints rather than broad direct table grants;
- sensitive catalog/staff operations are admin-only;
- published public invitation data is exposed through a controlled render path.

---

## 27. Legacy V1 Tables

Known V1 tables:

- `invitations`
- `weddings`
- `wishes`

Current data is test-only as of the approved audit.

Do not drop or mutate them destructively during initial V2 foundation work.

Create V2 schema/migrations alongside them, validate V2, then retire legacy through a separate approved task.

**Resolved by Task 001 (`docs/DECISIONS.md`):** the V2 invitation table is permanently named `project_invitations`. V1's `invitations` table is untouched and is not renamed; `project_invitations` is not a transitional name.

---

## 28. Physical Schema Review Gate

**Satisfied by Task 001:** the physical schema plan is `docs/PHYSICAL_DATABASE_PLAN.md`, containing actual table names, columns/types, primary keys, foreign keys, unique/check constraints, indexes, RLS policy intent, migration ordering, the V1 naming-conflict resolution, and delete/archive strategy per table.

No production schema change happens before that plan passes external review, and no migration SQL has been authored yet.
