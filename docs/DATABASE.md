# WeddingClick V2 — Database Design Specification

**Status:** Approved logical schema; physical migration names may be refined during implementation  
**Last updated:** 2026-09-10

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
          ├── invitations ───── template_versions ── templates
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

- `id` — references `auth.users.id`, primary key.
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
- `project_id` FK cascade/restrict strategy to be chosen intentionally.
- `service_addon_id` FK.
- `addon_code_snapshot`.
- `addon_name_snapshot`.
- `price_vnd_snapshot`.
- `created_at`.

Constraint:

- unique `(project_id, service_addon_id)` or approved equivalent.

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
- gift/bank display fields only if not better normalized in a future dedicated domain.
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
- `event_type` — examples `VU_QUY`, `THANH_HON`, `RECEPTION`, `CUSTOM`.
- `side` — `COMMON`, `GROOM`, `BRIDE` or approved neutral value.
- `title`.
- `starts_at` canonical timestamp.
- `timezone` default `Asia/Ho_Chi_Minh`.
- `venue_name` optional.
- `address` optional.
- `map_url` optional.
- `description` optional.
- `sort_order` integer.
- `is_primary` optional if needed by resolver.
- timestamps.

Indexes:

- `project_id`.
- potentially `(project_id, starts_at)`.

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
- `manifest` JSONB for supported features/presets metadata.
- `is_active_for_new_projects`.
- `created_at`.
- `retired_at` nullable.

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

## 15. `invitations`

Purpose: logical invitation variant belonging to a Project.

Suggested fields:

- `id`.
- `project_id` FK.
- `variant` — `COMMON`, `GROOM`, `BRIDE`.
- `slug` or public routing identifier, if stored here.
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
- `invitation_id` FK.
- `version_number`.
- `version_type` or lifecycle metadata such as `REVIEW` / `PUBLISHED` if needed.
- `template_version_id` FK.
- `renderer_key_snapshot` optional redundant safety metadata.
- `payload` JSONB containing normalized render snapshot.
- `created_by` nullable profile FK.
- `created_at`.
- `published_at` nullable.

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
- `status` — `PENDING`, `APPLIED`, `REJECTED` or equivalent.
- `submitted_at`.
- `reviewed_by` nullable.
- `reviewed_at` nullable.
- optional staff note.

Customer submission should not automatically overwrite canonical data unless a future approved rule explicitly allows it.

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
- `token_hash` unique.
- `token_hint` optional non-sensitive prefix/suffix for staff display.
- `review_version_group/reference` where required for Review semantics.
- `is_active`.
- `expires_at` nullable.
- `revoked_at` nullable.
- `created_by`.
- `created_at`.
- `last_used_at` optional.

Never store raw token unnecessarily if hash-based resolution is implemented.

Indexes:

- unique `token_hash`.
- `(project_id, link_type, is_active)` as appropriate.

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
- `project_id` FK.
- `display_name` required.
- `invitation_variant` nullable/controlled depending on package.
- `group_name` optional.
- `phone` optional.
- `note` optional.
- `token_hash` unique.
- `token_hint` optional.
- `is_active`.
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
- `guest_id` nullable FK.
- `guest_name` nullable for non-personalized flow.
- `attendance` boolean or typed enum.
- `party_size` integer.
- `message` optional.
- `created_at`.
- `updated_at`.

Rules:

- personalized guest should have one current RSVP; enforce unique `guest_id` where non-null if using single-row current-state design;
- `party_size` must be non-negative and bounded by an approved reasonable maximum;
- when `attendance = false`, party size should normally be 0 or normalized centrally;
- server validates Project/guest relationship.

Potential constraint:

- unique `guest_id` where `guest_id IS NOT NULL`.

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
- `status`.
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
- `project_id` FK.
- `actor_type` — staff/customer/system.
- `actor_profile_id` nullable.
- `action_type`.
- `summary`.
- `metadata` JSONB optional.
- `created_at`.

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

If a naming conflict occurs because V1 already has `invitations`, the implementation plan must resolve it explicitly before migration. Possible strategies include transitional naming or controlled rename after validation. Do not improvise silently.

---

## 28. Physical Schema Review Gate

Before executing the first V2 migration, Claude must produce a physical schema plan containing:

- actual table names;
- actual columns/types;
- primary keys;
- foreign keys;
- unique/check constraints;
- indexes;
- RLS policies;
- migration ordering;
- strategy for V1 naming conflicts;
- rollback/repair considerations.

No production schema change should happen before this plan is reviewed.
