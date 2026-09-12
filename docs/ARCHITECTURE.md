# WeddingClick V2 — Application Architecture

**Status:** Approved architectural baseline  
**Last updated:** 2026-09-10

## 1. Current Core Stack

Keep the current repository stack unless an approved architecture task changes it:

- Next.js 16 App Router
- React 19
- TypeScript 5
- Tailwind CSS 4
- Supabase JS 2
- Supabase Database/Auth/Storage
- Vercel deployment

Current useful dependencies include `xlsx`, `browser-image-compression`, and `framer-motion`. Existing packages are not automatically approved for every new use; use them deliberately.

---

## 2. Architectural Goal

Separate WeddingClick into clear layers so that presentation changes do not rewrite business logic and public access does not directly expose internal data.

Target conceptual flow:

```text
UI / Routes
   ↓
Application Use Cases / Server Boundary
   ↓
Domain Services
   ↓
Repositories / Supabase Data Access
   ↓
Database / Storage
```

Invitation rendering adds a dedicated normalization boundary:

```text
Canonical Project Data
   ↓
Wedding Domain Resolver
   ↓
InvitationViewModel
   ↓
Template Renderer
   ↓
Public/Preview/Review UI
```

---

## 3. Product Surfaces

WeddingClick has three distinct product surfaces.

### A. Internal System

Authenticated WeddingClick staff/admin.

Conceptual screens:

- Login
- Dashboard
- Projects
- Project Detail
- Customers
- Templates
- Tasks/Deadlines
- Statistics
- Staff
- Settings

### B. Customer Access

Token-authenticated, no normal account required in V1.

Surfaces:

- Intake Form
- Review
- Customer Portal
- Guest Tool (entitlement-dependent)

### C. Public Invitation

Public published invitation plus optional secure guest personalization token.

These surfaces must not share authorization assumptions merely because they are in the same Next.js app.

---

## 4. Route Direction

Exact final paths may be refined, but route semantics should remain clear.

Suggested internal route family:

```text
/login
/dashboard
/projects
/projects/new
/projects/[projectId]
/customers
/templates
/tasks
/statistics
/staff
/settings
```

Suggested customer route family:

```text
/form/[token]
/review/[token]
/manage/[token]
```

Suggested public invitation route family:

```text
/i/[slug]
```

Personalized guest access should use a secure guest token in a path segment or query parameter that is validated server-side.

Do not use predictable Project IDs as access control.

---

## 5. Server/Client Boundary

Sensitive operations must cross a trusted server boundary before database mutation.

Examples that should not rely on arbitrary browser-to-table writes:

- create/update Project;
- publish invitation;
- approve review;
- create/revoke secure access link;
- guest import;
- RSVP mutation;
- staff management;
- package/price configuration;
- media deletion.

Implementation may use Next.js Route Handlers and/or Server Actions when appropriate. Whichever mechanism is selected, authorization and validation must be explicit and testable.

Do not expose Supabase service-role credentials to client components.

The full per-use-case contract (direct-RLS vs. trusted-business-action classification, the two customer/guest security paths, error model, and activity-log union) is frozen in `docs/API_CONTRACT.md`.

---

## 6. Domain Modules

V2 should converge toward domain-oriented modules rather than page-sized business logic.

Conceptual domains:

```text
Auth / Profiles
Customers
Projects
Wedding Details
Events
Media
Packages / Add-ons
Templates
Invitation Rendering
Review / Versioning / Publish
Access Links
Guests
RSVP
Tasks
Activity Logs
Statistics
```

Each domain should have a clear boundary and central types.

Avoid one giant `app/admin/page.tsx` owning all business logic.

---

## 7. Canonical Project Model

A `Project` is the operational aggregate.

For a wedding Project:

```text
Project
 ├─ Customer
 ├─ WeddingDetails (1)
 ├─ Events (N)
 ├─ Media (N)
 ├─ ProjectDesign (0/1)
 ├─ Add-ons (N)
 ├─ Invitations (N; max one per supported variant)
 ├─ Guests (N)
 ├─ AccessLinks (N)
 ├─ IntakeSubmissions (N)
 ├─ Tasks (N)
 └─ ActivityLogs (N)
```

Invitation variants do not own copied wedding data.

---

## 8. Invitation Rendering Architecture

### 8.1 Build View Model

A centralized builder/resolver loads the appropriate canonical Project state and creates an `InvitationViewModel`.

The view model should contain normalized presentation-ready values such as:

```text
couple
families
ceremony/event presentation
events
venue
dates already formatted through approved utilities
media
guest personalization
gift/bank display data
rsvp capability metadata
design settings
template metadata
```

Templates must not understand raw Supabase table shape.

### 8.2 Preview

Preview uses the current mutable draft state through the same domain/view-model logic but is not public production output.

### 8.3 Review

Creating a Review should create/version a stable review payload/state so customer approval refers to what was actually shown.

### 8.4 Publish

Public invitation resolves a published invitation version/snapshot, not mutable Project draft data.

---

## 9. Invitation Versioning Strategy

`invitation_versions` should represent stable renderable versions for review/publish.

A version should capture enough resolved data to reproduce the approved invitation state, including at minimum:

- invitation/Project relationship;
- invitation variant;
- template renderer/version identifier;
- design settings snapshot;
- normalized wedding/event content snapshot;
- media references required by that version;
- creation time;
- lifecycle type/status as appropriate.

Do not require the public renderer to re-read mutable draft fields that can change independently.

Published versions should be treated as immutable application records.

---

## 10. Template Implementation Versioning

Database version references are insufficient if the underlying React template implementation is modified in place.

Production template renderers should therefore be versioned in code.

Preferred concept:

```text
templates/wedding/elegant-editorial/v1/
templates/wedding/elegant-editorial/v2/
```

A renderer registry maps stable keys to implementations:

```text
wedding.elegant-editorial.v1
wedding.vietnamese-heritage.v1
wedding.romantic-minimal.v1
```

Once a renderer version is used for production, do not alter its visual/business contract in place. Create a new version.

---

## 11. Business Rules Location

Central domain services should own:

- Project status rules;
- invitation variant resolution;
- event/date derivation;
- package/add-on entitlement;
- publish eligibility;
- review version association;
- customer portal capability;
- guest token resolution;
- RSVP validation/upsert behavior.

UI components should call these capabilities rather than implement them independently.

---

## 12. Date/Time Architecture

Store canonical event time using appropriate timestamp/date types.

Event timezone must be explicit or defaulted centrally to `Asia/Ho_Chi_Minh` for Vietnamese wedding Projects.

One shared date utility/domain layer should derive:

- localized date;
- localized time;
- weekday;
- month/year;
- countdown target;
- calendar positioning.

Do not duplicate date parsing/formatting in templates.

---

## 13. Access Token Architecture

Customer and guest links are capabilities and must be handled as security-sensitive credentials.

Preferred pattern:

1. Generate cryptographically strong random token.
2. Give raw token only through the URL/delivery event.
3. Store a cryptographic hash in database when feasible.
4. On request, hash presented token and resolve active, non-revoked record.
5. Enforce Project + purpose + entitlement.

Customer access-link purposes:

- `INTAKE`
- `REVIEW`
- `PORTAL`

Guest token is scoped to one guest/Project and never derived from display name.

---

## 14. Supabase Use

### Auth

Use Supabase Auth for internal staff/admin login.

Application `profiles` extends auth user identity with role and internal metadata.

### Database

RLS remains a defense-in-depth layer and must be intentional.

Do not reproduce V1 public `ALL` access policies.

### Storage

V2 media should not allow anonymous upload/delete.

Preferred V2 direction is a private or tightly controlled Project media bucket with server-authorized read/write strategy. If signed URLs are used for public invitations, public rendering must generate them safely from published media references.

If a public-read bucket is chosen for operational reasons, object paths must be non-guessable and write/delete access must still be staff/server-authorized. Any deviation from private storage preference requires an explicit security review.

---

## 15. Media Lifecycle

Media records are domain objects separate from template code.

Media types may include:

- `COVER`
- `GALLERY`
- `AUDIO`
- `QR_GROOM`
- `QR_BRIDE`
- future types as documented.

Use sort order for ordered collections.

Deleting a media record/object must not break an active published invitation version. The media deletion service must account for published-version references.

---

## 16. Intake Submission Architecture

Customer form submissions should be captured separately from canonical Project data.

Concept:

```text
Customer submits form
    ↓
IntakeSubmission (pending)
    ↓
Staff reviews/applies changes
    ↓
Canonical WeddingDetails / Events / Media update
```

This protects near-final Projects from unintended customer overwrites and supports an audit trail.

---

## 17. RSVP Architecture

Public invitation UI submits RSVP to a trusted server endpoint/use case.

The server:

1. validates invitation is valid/published where required;
2. resolves guest token if present;
3. validates Project relationship;
4. validates attendance and party size;
5. upserts personalized guest RSVP or creates permitted non-personalized response;
6. returns actual persistence result.

Templates only render UI/state.

---

## 18. Statistics Architecture

Statistics should be built from domain data rather than duplicated counters when possible.

If later performance requires aggregates/materialized views, add them intentionally with tests.

Initial statistics should favor correctness over premature optimization.

---

## 19. Extensibility Beyond Weddings

Generic operational entities remain event-agnostic:

- Project
- Customer
- Invitation
- Template
- Media
- Guest
- RSVP
- AccessLink
- Task
- ActivityLog

Wedding-specific data resides in wedding-specific domain/table(s).

A future birthday Project can add a `birthday_details` domain without rewriting Project management or Customer Portal infrastructure.

---

## 20. Architecture Change Rule

A change is considered an architectural change if it modifies any of the following:

- domain ownership of data;
- database relationship model;
- authorization boundary;
- publish/version strategy;
- template/view-model contract;
- package entitlement model;
- customer/guest access model;
- core stack.

Such changes require documentation update and approval before implementation.
