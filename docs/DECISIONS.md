# WeddingClick V2 — Approved Product & Architecture Decisions

**Status:** Source of truth for approved decisions  
**Last updated:** 2026-09-10

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
