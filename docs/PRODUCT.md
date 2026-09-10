# WeddingClick V2 — Product Specification

**Status:** Approved baseline for V1 commercial launch  
**Last updated:** 2026-09-10

## 1. Product Vision

WeddingClick is an invitation-production and project-management platform for WeddingClick staff. It begins with online wedding invitations and is designed so the platform can later support other event types without rebuilding the entire operational system.

WeddingClick solves three connected problems:

1. **Production:** staff need to create beautiful invitations quickly and consistently.
2. **Operations:** the business needs Projects, customers, status, deadlines, assignment, review, and completion tracking.
3. **Delivery:** customers need public invitation links, RSVP visibility, and optional personalized guest-link tools without learning a complex back office.

The commercial value is not only “a wedding website.” It is:

- high-quality invitation presentation;
- reduced staff production effort;
- fewer wedding-information mistakes;
- customer review/approval workflow;
- RSVP management;
- optional personalized invitations by guest.

---

## 2. User Types

### 2.1 Admin

Internal WeddingClick owner/admin.

Responsibilities may include:

- manage all Projects;
- manage staff;
- manage templates and template availability;
- view statistics;
- configure package catalog;
- oversee deadlines;
- perform privileged recovery/administrative actions.

### 2.2 Staff

Internal WeddingClick employee/operator.

Primary capabilities:

- create/manage assigned Projects;
- manage customer information;
- process intake submissions;
- select/configure invitation design;
- preview and validate invitations;
- create review links;
- process customer feedback;
- publish invitations when workflow conditions are met;
- manage guest lists and RSVP as permitted.

### 2.3 Customer

Bride/groom or buyer receiving WeddingClick service.

V1 does not require a normal customer account.

Customer interactions occur through secure links:

- intake form;
- review/approval;
- Customer Portal for RSVP;
- Guest Tool when the add-on is purchased.

### 2.4 Guest

Wedding invitee.

Capabilities:

- view published invitation;
- see personalized display text when using a valid guest token;
- submit/update RSVP within allowed rules.

Guest has no access to Project administration.

---

## 3. Commercial Offering

Initial package catalog:

| Package / Add-on | Capability | Initial Price |
|---|---|---:|
| Common invitation | One invitation for both families | 150,000 VND |
| Separate invitations | Groom-side + bride-side invitations | 250,000 VND |
| Personalized guest add-on | Named/free-form guest links and Guest Tool | +50,000 VND |

Payment processing is outside WeddingClick V1.

WeddingClick records:

- agreed package;
- add-ons;
- agreed Project price snapshot;
- payment status.

Initial payment status can remain simple:

- `UNPAID`
- `PAID`

Architecture may support richer statuses later.

---

## 4. Core Project Workflow

Target operational flow:

```text
Create Customer / Project
        ↓
Select package + add-ons
        ↓
Set deadline + assigned staff
        ↓
Collect customer information
  ├─ staff enters it
  └─ customer submits intake form
        ↓
Staff validates/accepts canonical data
        ↓
Select template + design settings
        ↓
Build invitation draft
        ↓
Preview + automated validation
        ↓
Internal review
        ↓
Create/send customer Review Link
        ↓
Customer requests revision OR approves
        ↓
Revision loop if necessary
        ↓
Record payment externally / mark paid
        ↓
Explicit Publish
        ↓
Deliver public invitation link
        ↓
Deliver Customer Portal link
        ↓
Customer monitors RSVP
        ↓
If personalized add-on enabled:
Customer manages guest display names/links
        ↓
Complete Project
```

---

## 5. Project Status Model

Baseline statuses:

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

The UI may use friendly Vietnamese labels, but internal values must remain centralized and typed.

State transitions should be intentional. Avoid allowing arbitrary status jumps that bypass required validation unless Admin performs an explicit privileged action.

---

## 6. Wedding Data Requirements

Canonical wedding data belongs to the Project, not to individual invitation variants.

Baseline wedding information includes:

### Couple

- groom display/full name;
- bride display/full name.

### Families

- groom father;
- groom mother;
- bride father;
- bride mother;
- groom family address if used;
- bride family address if used.

### Events

System must support multiple wedding-related events, not one hard-coded date/time.

Typical examples:

- Lễ Vu Quy;
- Lễ Thành Hôn;
- Tiệc cưới;
- custom wedding event.

Each event may include:

- event type;
- title/label;
- side/visibility context;
- start date/time;
- timezone;
- venue name;
- address;
- map link;
- optional description.

### Content

Potential optional content includes:

- invitation message;
- love story;
- additional note;
- lunar date display;
- wedding gift/bank information;
- gallery;
- music.

Optional fields must not create empty visual sections when missing.

---

## 7. Invitation Variants

Every active wedding template must support the three approved variants.

### COMMON

Purpose: one shared invitation representing both sides.

Expected behavior:

- both families can be represented;
- couple ordering follows common-template design rules;
- shared wedding event information is rendered appropriately.

### GROOM

Purpose: groom-family invitation.

Required business semantics:

- groom first;
- bride second;
- groom family primary;
- `Lễ Thành Hôn` wording where applicable.

### BRIDE

Purpose: bride-family invitation.

Required business semantics:

- bride first;
- groom second;
- bride family primary;
- `Lễ Vu Quy` wording where applicable.

No template may reinvent these rules independently.

---

## 8. Information Intake

Staff may create a secure intake link for a Project.

Customer-facing intake requirements:

- mobile-first;
- simple sections;
- clearly mark required vs optional fields;
- support media upload only when security/storage implementation is approved;
- provide understandable validation;
- confirm successful submission.

Customer submissions should enter a reviewable submission state rather than silently overwriting canonical Project data after the first submission.

Staff should be able to compare/apply customer updates.

---

## 9. Editor

V1 editor is not a free-form canvas.

The editor should focus on fast staff production:

- template selection;
- curated palette selection;
- curated font preset selection;
- effect/motion preset selection;
- optional section enable/disable where supported;
- music configuration;
- media selection/order;
- preview switching between invitation variants.

Canonical content editing should remain clearly separated from pure design configuration where practical.

Avoid exposing arbitrary controls that undermine template design consistency.

---

## 10. Preview and Validation

Preview is a first-class feature, not simply the public invitation URL.

Preview should support at least:

- Mobile view;
- Desktop view;
- COMMON/GROOM/BRIDE switching where available.

Before Review/Publish, validation must identify:

### Blocking errors

Examples:

- missing groom/bride name;
- required event missing;
- invalid date/time;
- invalid invitation variant/package combination;
- missing template;
- unresolved template renderer/version;
- critical publish data invalid.

### Warnings

Examples:

- no music;
- no gallery;
- no map;
- no wedding gift information;
- other optional content missing.

Warnings do not necessarily block progress.

---

## 11. Customer Review

Staff creates a secure Review Link associated with a specific review version/snapshot.

Customer can:

- view the invitation(s) intended for review;
- submit revision feedback;
- approve the reviewed version.

Review state should support at least:

- not viewed / created;
- viewed;
- revision requested;
- approved.

Customer approval must not ambiguously apply to a later mutable draft.

V1 does not require real-time chat.

---

## 12. Publish and Delivery

Publish is explicit and versioned.

Published invitation URLs should remain stable for the customer.

When Project is published/delivered, customer receives:

1. public invitation URL(s) according to purchased package;
2. private Customer Portal URL.

If personalized add-on is enabled, Guest Tool is available within the Customer Portal.

Draft edits after publishing must not silently change public output.

---

## 13. Personalized Guest Tool

Personalized guest capability is a paid add-on.

Customer/staff should be able to:

- add a guest manually;
- import guests from Excel/CSV-like workflow;
- edit guest display text;
- delete/revoke guest entry when appropriate;
- select intended invitation variant when relevant;
- copy an individual personalized link;
- export/list generated personalized links.

Minimum required field:

- `display_name` — free-form.

Examples:

- `Anh Hiếu và gia đình`
- `Chú B và người thương`
- `Em và sự cô đơn`

Optional metadata may include:

- side/variant;
- group;
- phone;
- note.

The system must not infer party size from the display name.

---

## 14. RSVP

RSVP is available for both personalized and non-personalized invitations.

Baseline RSVP fields/behavior:

- attendance: yes/no;
- party size when attending;
- guest name when not already identified;
- optional message/note.

For personalized guest links:

- guest identity is resolved from secure token;
- guest display name can be prefilled/rendered;
- a later response updates the current RSVP state.

Customer Portal should report meaningful numbers separately:

- guest records / invitations created;
- RSVP responses;
- attending responses;
- not attending responses;
- unanswered personalized guests when applicable;
- total expected attendee headcount.

Do not confuse “number of people who answered yes” with “number of people expected to attend.”

---

## 15. Customer Portal

Customer Portal is a private, mobile-first Project management surface with limited capabilities.

Baseline content:

- couple/project name;
- link(s) to public invitation;
- RSVP summary;
- RSVP response list;
- export capability where useful;
- Guest Tool when personalized add-on is enabled.

Customer Portal must not expose:

- staff/admin controls;
- other Projects;
- internal pricing configuration;
- staff notes/history not intended for customer;
- unrestricted Project content editing.

---

## 16. Dashboard and Operations

The internal Dashboard must answer: **What needs attention now?**

Useful V1 indicators:

- active Projects;
- in progress;
- waiting for customer;
- revision required;
- approaching deadline;
- overdue;
- recently completed.

Project list should support practical search/filter/sort such as:

- customer/couple name;
- status;
- deadline;
- package;
- assigned staff;
- template.

Statistics may include:

- Projects by month;
- completion count;
- paid revenue based on Project snapshots;
- package popularity;
- template popularity;
- overdue rate.

Avoid decorative analytics that do not help operations.

---

## 17. Template Quality Goal

Initial launch should prioritize approximately 3–5 production-ready templates.

Target initial art directions:

1. **Elegant Editorial** — fashion/luxury/editorial.
2. **Vietnamese Heritage** — refined modern Vietnamese wedding aesthetic.
3. **Romantic Minimal** — soft, romantic, minimal/Korean-influenced feel.

Templates must differ in composition, typography, motion, and image treatment—not merely color.

---

## 18. Quality Bar for Launch

WeddingClick V1 is not production-ready until critical flows have been tested with realistic test Projects.

Launch blockers include:

- incorrect bride/groom/family order;
- wrong `Lễ Thành Hôn` / `Lễ Vu Quy` semantics;
- wrong date/weekday/time/countdown;
- guest identity leakage/mix-up;
- public modification of internal data;
- RSVP false-success behavior;
- draft changes altering published invitations;
- broken mobile invitation layout;
- broken secure access model;
- exposed secrets;
- customer data loss.

---

## 19. V1 Non-Goals

Do not delay V1 for:

- online payments;
- subscriptions;
- customer public sign-up;
- Canva-style builder;
- mobile app;
- SMS/Zalo automation;
- AI invitation generator;
- multi-event-type UI beyond weddings;
- template marketplace;
- accounting/ERP features.

---

## 20. Future Expansion

Architecture should permit future event types while preserving shared infrastructure:

```text
Project
Template
Invitation
Guest
RSVP
Customer Portal
Media
Publish/Versioning
```

Future event-specific detail domains can be added without rebuilding the operational core.
