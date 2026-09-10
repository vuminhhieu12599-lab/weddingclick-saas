# WeddingClick V2 — Template System Specification

**Status:** Approved architectural baseline  
**Last updated:** 2026-09-10

## 1. Purpose

Templates are a primary commercial differentiator for WeddingClick.

The Template System must make it possible to create many visually distinct wedding invitations without duplicating business logic or introducing variant/date/RSVP bugs.

The system must optimize for both:

- artistic freedom;
- engineering consistency.

---

## 2. Fundamental Rule

Templates are presentation only.

Approved flow:

```text
Canonical Project Data
      ↓
Wedding Domain Logic
      ↓
Variant Resolver
      ↓
InvitationViewModel
      ↓
Template Renderer
```

A template must not query Supabase, decide permissions, calculate package entitlement, or write RSVP data.

---

## 3. InvitationViewModel

Each template receives a normalized presentation-ready model rather than raw database rows.

Conceptual shape:

```text
InvitationViewModel
 ├─ project
 ├─ variant
 ├─ couple
 │    ├─ groom
 │    ├─ bride
 │    ├─ primaryPerson
 │    └─ secondaryPerson
 ├─ families
 │    ├─ groom
 │    ├─ bride
 │    └─ primaryFamily
 ├─ ceremony
 │    ├─ title
 │    ├─ date/time
 │    ├─ weekday
 │    ├─ lunar display
 │    └─ venue
 ├─ events[]
 ├─ media
 │    ├─ cover
 │    ├─ gallery[]
 │    └─ audio
 ├─ guest
 │    └─ displayName
 ├─ gift
 ├─ rsvpCapability
 ├─ design
 └─ template
```

Exact TypeScript types will be defined centrally during implementation.

No template may invent a second incompatible view-model shape for the same core information.

---

## 4. Variant Resolver

One centralized wedding variant resolver owns variant semantics.

### COMMON

Provides both sides appropriately.

### GROOM

- primary person = groom;
- secondary person = bride;
- primary family = groom family;
- appropriate ceremony wording = `Lễ Thành Hôn`.

### BRIDE

- primary person = bride;
- secondary person = groom;
- primary family = bride family;
- appropriate ceremony wording = `Lễ Vu Quy`.

Templates use resolved values such as `primaryPerson` and `ceremony.title`; they do not reproduce conditional business logic.

---

## 5. Template Registry

All templates must be discoverable through one central registry.

The registry maps stable renderer keys to implementations and manifests.

Example conceptual keys:

```text
wedding.elegant-editorial.v1
wedding.vietnamese-heritage.v1
wedding.romantic-minimal.v1
```

Adding Template 04 should not require editing RSVP, Editor domain logic, database logic, or variant resolver.

If adding one template requires unrelated system-wide changes, stop and reassess architecture.

---

## 6. Template Manifest

Each template version must define a manifest containing validated metadata.

Conceptual manifest:

```text
code
name
eventType
version
rendererKey
supportedVariants
supportedFeatures
palettes
fontPresets
effectPresets
sectionCapabilities
preview metadata
```

Example capabilities:

- countdown;
- gallery;
- music;
- RSVP;
- gift;
- guest personalization;
- love story;
- map.

Editor options should be generated/validated from template capabilities rather than scattered hard-coded conditions.

---

## 7. Template Code Versioning

Template renderer versions are immutable after production activation.

Preferred structure concept:

```text
templates/
  core/
  shared/
  wedding/
    elegant-editorial/
      v1/
      v2/
    vietnamese-heritage/
      v1/
    romantic-minimal/
      v1/
```

Do not redesign `v1` in place after customers have published invitations using it.

Create `v2` and migrate Projects only through explicit upgrade/republish flow.

---

## 8. Shared vs Template-Specific Components

Use shared infrastructure for behavior, not to force identical visuals.

### Shared behavior candidates

- date formatting utilities;
- countdown state/logic;
- music controller;
- RSVP client/use-case interface;
- map-link behavior;
- guest personalization resolution;
- reduced-motion hooks;
- safe image/media primitives;
- common accessibility helpers.

### Template-specific visual components

Examples:

```text
ElegantEditorialHero
VietnameseHeritageHero
RomanticMinimalHero
```

A template may create unique Hero, Gallery, Couple, Event, Footer, etc. visual sections as needed.

Do not force every template into the same DOM/layout structure simply for reuse.

---

## 9. Section Model

Potential invitation sections include:

- Opening / Envelope
- Hero
- Invitation Message
- Couple
- Families
- Ceremony / Event
- Calendar
- Countdown
- Love Story
- Gallery
- Venue
- Map
- RSVP
- Wedding Gift
- Footer

Templates are not required to render every section identically.

Each template defines intentional ordering/art direction.

V1 does not provide arbitrary staff drag/drop ordering.

---

## 10. Optional Section Behavior

Optional content should disappear gracefully when no data exists.

Examples:

- no love story -> no empty Story section;
- no gallery -> no blank Gallery section;
- no audio -> no broken music button;
- no bank/gift data -> no Gift section;
- no map URL -> venue can render without map action.

Templates must be certified with missing optional content.

---

## 11. Project Design Configuration

One Project uses one primary design configuration in V1.

Conceptual settings:

- template version;
- palette key;
- font preset key;
- effect preset key;
- section visibility/settings;
- music configuration;
- template-approved settings.

By default, COMMON/GROOM/BRIDE use the same design system for one Project.

Per-variant visual overrides are not a V1 requirement.

---

## 12. Editor Constraints

V1 Editor is configuration-driven.

Allowed categories may include:

- template selection;
- palette preset;
- font preset;
- effect preset;
- supported section switches;
- music choice;
- gallery selection/order;
- template-approved options.

Avoid arbitrary free-form visual editing that lets operators accidentally destroy the intended design.

Do not build Canva-like drag/drop.

---

## 13. Palette System

Each template defines curated palettes rather than unrestricted RGB control in V1.

A palette may define semantic tokens such as:

```text
background
surface
primaryText
secondaryText
accent
muted
border/decorative
```

Template code should use semantic palette variables rather than scattering raw colors across components.

A template may have several carefully designed palettes.

---

## 14. Typography System

Detailed rules are in `TYPOGRAPHY_AND_MOTION.md`.

Template font presets reference approved Font Library entries.

A preset may define:

- display/title font;
- body font;
- accent/script font where needed;
- weights/styles;
- tracking/line-height guidance.

Do not allow arbitrary unverified font URLs in Project configuration.

---

## 15. Effect/Motion System

Detailed rules are in `TYPOGRAPHY_AND_MOTION.md`.

Use shared motion primitives with template-specific effect packs/presets.

A template may expose choices such as:

- `NONE`
- `LIGHT`
- `STANDARD`
- `RICH`

Only when appropriate for that template.

The same preset label may map to different art direction per template.

---

## 16. Opening Experience

Templates may provide an optional invitation-opening experience such as an envelope/open button.

The opening experience may:

- show couple names;
- show personalized guest display text;
- transition into Hero;
- initiate music after user interaction where browser policies permit.

It must not block access permanently, break navigation, or depend on autoplay behavior that browsers prohibit.

---

## 17. Music

Music uses shared playback logic.

Templates may style the control differently, but playback state should not be independently implemented per template.

Handle:

- play/pause;
- browser autoplay restrictions;
- user interaction;
- audio unavailable/error state;
- reduced/distraction-conscious behavior.

No template should show a fake music icon that does nothing.

---

## 18. Countdown and Calendar

Countdown and calendar consume canonical event information.

Templates must not manually parse date strings.

Calendar must handle real month length/leap-year rules through shared utilities.

If no valid target event exists, countdown/calendar should fail safely and validation should warn/block as appropriate.

---

## 19. Guest Personalization

Template consumes resolved `guest.displayName` when a valid personalized guest token is present.

Examples must work without layout breakage:

- `Anh Hiếu và gia đình`
- `Chú B và người thương`
- `Em và sự cô đơn`
- a long Vietnamese family/group name.

Template decides styling, not identity/authentication.

---

## 20. RSVP UI

Templates may style the RSVP form/presentation uniquely, but the data contract and submit behavior are shared.

No template writes directly to Supabase.

RSVP UI must support:

- loading;
- actual success;
- actual failure;
- attending/not attending;
- party size when relevant;
- guest name when not personalized;
- optional message.

---

## 21. Mobile-First Requirement

Template design begins with mobile.

Primary test widths:

- 360 px;
- 390 px;
- 430 px.

Also test wider mobile/tablet/desktop layouts.

Pay particular attention to:

- long names;
- decorative typography;
- gallery sizing;
- fixed controls;
- opening experience;
- RSVP fields;
- safe tap targets;
- motion performance.

---

## 22. Performance Budget Mindset

Do not treat invitation pages like admin dashboards.

Avoid unnecessary JavaScript and asset loading.

Only load:

- active template code;
- active font resources;
- media needed for the page;
- motion capabilities actually used.

Optimize large images appropriately.

Effects must not create persistent high CPU/GPU usage on mobile.

A production template failing practical mobile performance review must not be activated.

---

## 23. Art Direction Requirement

Avoid generic AI-generated website aesthetics.

Do not default to:

- generic gradient blobs;
- excessive glassmorphism;
- random shadows/glows;
- identical rounded-card sections everywhere;
- generic SaaS purple/blue styling;
- decorative icon boxes with no purpose;
- meaningless animation.

Each template needs an intentional design concept covering:

- typography;
- spacing;
- composition;
- image treatment;
- color;
- ornamentation;
- motion;
- section rhythm.

---

## 24. Initial Template Direction

Initial launch targets:

### Elegant Editorial

- luxury/editorial/fashion direction;
- strong typography;
- refined image reveals;
- restrained elegant motion.

### Vietnamese Heritage

- modern Vietnamese wedding identity;
- refined red/cream/gold or other curated Vietnamese palettes;
- avoid dated/saturated “traditional template” clichés;
- culturally appropriate decorative language.

### Romantic Minimal

- soft/minimal/romantic direction;
- subtle floral/organic treatment where appropriate;
- calm typography and motion.

These templates must feel structurally and emotionally distinct.

---

## 25. Template Certification Gate

Before an active production release, certify every template using `TESTING.md`.

Minimum matrix:

- all three variants;
- personalized/non-personalized;
- long Vietnamese names;
- free-form playful names;
- optional sections missing/present;
- valid RSVP;
- valid music behavior;
- real date/calendar/countdown;
- mobile widths;
- desktop;
- reduced motion;
- no critical console errors;
- acceptable performance.

Only certified template versions may become active for new production Projects.
