# WeddingClick V2 — Template System Specification

**Status:** Approved architectural baseline  
**Last updated:** 2026-10-08 (TE-01 proposed editor/media contract, §6a and §11a)

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

This conceptual tree is the eventual render-time shape, not the RF-03 output. The RF-03 ViewModel has no `rsvpCapability`, no generic runtime-capabilities object, and no derived weekday/formatted-date/countdown fields. RF-05 does not add them to the ViewModel: RSVP and other runtime capabilities are a separate renderer prop (`capabilities`), and weekday/date/time, countdown and calendar values come from RF-05 shared pure derivations (`docs/DECISIONS.md` "RF-05 Shared Renderer Boundary / Minimum Shared Client Capabilities Contract Clarification" K6, K14, K27–K34). Its media slots (cover, gallery, audio, groom/bride QR) each carry a `RESOLVED` or `UNAVAILABLE` runtime state (`docs/DECISIONS.md` "RF-03 InvitationViewModel / Media Resolution Contract Clarification").

No template may invent a second incompatible view-model shape for the same core information.

### Snapshot payload vs InvitationViewModel (RF-00, frozen)

These are two distinct objects (`docs/DECISIONS.md` RF11–RF13):

```text
Canonical Project data
  -> Wedding Domain Resolver
  -> Snapshot payload (payloadSchemaVersion: 1)    persisted later in invitation_versions.payload
  -> InvitationViewModel                           render-time only, never persisted
       = payload + guest overlay + resolved media results (RF-03)
  -> RF-04 compatibility selection                  effective sections
  -> Template Renderer                              RF-05 props: { viewModel, sections, capabilities }
```

- The **snapshot payload** holds only stable canonical values: explicit side roles, event instant plus timezone, and `project_media` ids. It never holds signed or expiring URLs, guest identity or personalization, RSVP state, or `wedding_details.additional_note`.
- Each payload event carries its own optional `lunarDateDisplay`. `ceremony.lunarDateDisplay` is only a derived copy from the resolved ceremony event.
- Payload `sections` is exactly `{ invitationMessage, loveStory, gallery, music, gift }`, each a boolean meaning **canonical content availability** after variant filtering. It is not renderer visibility or template support. `design.sectionSettings` is copied unchanged and is not applied to `sections`. Final effective section visibility is decided later, at the renderer/manifest boundary. Gift and QR data follow `operationalSides`, and `qr.commonMediaId` is absent in v1 (`docs/DECISIONS.md` "RF-02 Snapshot Sections Contract Clarification").
- The **InvitationViewModel** adds precomputed deterministic display fields (the ceremony lunar line comes straight from the ceremony event's text, with no lunar calculation), primary/secondary ordering, the guest display-name overlay, display URLs from an injected media resolver, section state, and RSVP capability metadata (conceptual render-time scope; after RF-04/RF-05, section state and capabilities are separate renderer props, not ViewModel fields). RF-03 delivers only part of this: an async media resolution boundary (injected `MediaResolver`, no concrete storage adapter) plus a pure synchronous builder over Snapshot + optional guest `displayName` overlay + the complete per-media result set. A referenced media item whose URL cannot be resolved stays in the ViewModel as `UNAVAILABLE`; it is never dropped, substituted or faked, and it never blocks the ViewModel. RF-03 copies `sections` as canonical content availability and does not compute effective visibility (RF-04, which returns it in a separate selection context without changing the ViewModel; `docs/DECISIONS.md` RF-04 clarification R16–R17). RSVP capability metadata is not a ViewModel field: RF-05 passes it in the separate closed `capabilities` prop (`rsvp?`, `clipboard?`, `music?`, `clock?`). See `docs/DECISIONS.md` "RF-03 InvitationViewModel / Media Resolution Contract Clarification" and the RF-05 clarification (K6, K14).
- Templates consume only the RF-05 renderer props: the ViewModel, the RF-04 effective `sections` (the only authoritative section visibility), and the RF-05 `capabilities`. They never receive the Snapshot, the compatibility manifest, a registry or any token (RF-05 clarification K6–K8).

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

The frozen production rules for this resolver are in `docs/DECISIONS.md` RF2–RF6. In summary:
- **Event visibility by explicit `side`:** GROOM = GROOM + COMMON events; BRIDE = BRIDE + COMMON events; COMMON = all.
- **Ceremony event:** chosen only from visible events whose `occasion_type` matches the variant: `THANH_HON` for COMMON/GROOM, `VU_QUY` for BRIDE. RECEPTION/CUSTOM never substitute. No match is the BLOCKING `REQUIRED_CEREMONY_EVENT_MISSING`.
- **Ceremony title:** COMMON "Lễ Thành Hôn", GROOM "Lễ Thành Hôn", BRIDE "Lễ Vu Quy".
- **COMMON display order** is groom-first, with both sides first-class.
- **Sides are compared by explicit role**, never by object identity.
- **Lunar date** is manual display text owned by the ceremony event (`project_events.lunar_date_display`). It is never calculated, and it is omitted when empty. The legacy `wedding_details.lunar_date_display` is never used.

---

## 5. Template Registry

All templates must be discoverable through one central registry.

The eventual production registry maps stable renderer keys to implementations and manifests. RF-04 builds only its compatibility-manifest layer: `rendererKey` → `RendererCompatibilityManifestV1`, with no renderer implementations and no production renderer registered; implementation binding follows: RF-05 owns the generic binding machinery (`{ compatibilityManifest, component }` entries whose key is only `compatibilityManifest.rendererKey`, composing this registry, fail-closed, no fallback), and RF-06 supplies the first real binding (`docs/DECISIONS.md` "RF-04 Registry / Compatibility / Effective Visibility Contract Clarification" R12–R15; RF-05 clarification K9–K13). A renderer is a React component type (`InvitationRendererComponentV1`), not a `render()` function (RF-05 clarification K4).

Example conceptual keys (examples only; RF-04 freezes no production key, and the first real key is frozen in RF-06):

```text
wedding.elegant-editorial.v1
wedding.vietnamese-heritage.v1
wedding.romantic-minimal.v1
```

Adding Template 04 should not require editing RSVP, Editor domain logic, database logic, or variant resolver.

If adding one template requires unrelated system-wide changes, stop and reassess architecture.

Lookup is **fail-closed**. An unknown `rendererKey`, an unsupported `payloadSchemaVersion`, an unsupported variant, or a manifest/renderer mismatch is an error. It never silently falls back to another renderer (`docs/DECISIONS.md` RF16). Lookup is exact string equality; compatibility is explicit list membership; failures are typed exceptions thrown in a frozen fail-fast order (RF-04 clarification R4–R6, R19–R21).

---

## 6. Template Manifest

Each template version must define a manifest containing validated metadata.

Conceptual (eventual full) manifest. This list and the example capabilities below are **not** the RF-04 contract. RF-04 freezes only the code-owned `RendererCompatibilityManifestV1` with exactly four fields: `rendererKey`, `supportedPayloadSchemaVersions`, `supportedVariants`, `sectionCapabilities` (`docs/DECISIONS.md` RF-04 clarification R3). The full production manifest is frozen later by RF-06.

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

### Task 028 — `TemplateDesignManifestV1` (frozen design-config subset)

Task 028 froze the renderer-independent slice of the conceptual manifest above that is needed to validate a Project's design selection. It does **not** define or freeze the rest of the conceptual manifest — `code`, `name`, `eventType`, `version`, `rendererKey`, `supportedVariants`, `supportedFeatures`, `sectionCapabilities`, and preview metadata remain Task-029+ concerns, read from the same `template_versions.manifest` JSONB but never interpreted by Task 028.

`sectionCapabilities` is now frozen for RF-04 as the exact closed boolean record `{ invitationMessage, loveStory, gallery, music, gift }`, part of the code-owned compatibility manifest, not of the DB `template_versions.manifest` (`docs/DECISIONS.md` RF-04 clarification R7, R22). The RF-02 snapshot payload builder still does not depend on it (RF-02 clarification S11). Effective section visibility is `viewModel.sections[k] && sectionCapabilities[k] && sectionSettings[k] !== false` over those five keys only, returned in a separate RF-04 selection context. A present non-boolean value for one of the five reserved `sectionSettings` keys fails closed; other `sectionSettings` keys are ignored for visibility (RF-04 clarification R8–R11, R17).

Exactly six required top-level fields, each required as an own property (not merely inherited):

```text
schemaVersion: 1
palettes: string[]
fontPresets: string[]
effectPresets: string[]
sectionSettingsSchema: Record<string, ManifestSettingSpec>
designSettingsSchema: Record<string, ManifestSettingSpec>
```

`ManifestSettingSpec` is a closed, discriminated shape — its only valid own keys are `type` (required) and `enumValues` (optional); any other own key is malformed:

```text
{ type: "string";  enumValues?: string[] }
{ type: "number";  enumValues?: number[] }
{ type: "boolean"; enumValues?: boolean[] }
```

Any other RAW top-level key the manifest carries (future renderer/layout/animation metadata) is allowed to coexist and is simply never read or interpreted by Task 028 — Task 029 may add such fields later without changing this contract's shape or semantics.

Task 028 validates every `project_design` write against this subset, and `GET /api/v2/internal/templates` (`docs/API_CONTRACT.md` §13.1) exposes only this validated subset as `designManifest` — the raw manifest is never exposed. Validation is fail-closed: a malformed required field in this subset is a `500 INTERNAL` (a persisted catalog-data problem), while a well-formed submission that disagrees with an otherwise-valid manifest (undeclared key, wrong type, value outside `enumValues`) is a `422 INVARIANT` (a client-input problem) — never silently coerced or dropped. `sectionSettingsSchema`/`designSettingsSchema` are allow-lists, not "all keys required" lists — a `project_design` write may be a strict subset of the declared keys.

`template_versions` themselves remain immutable once created (`docs/PHYSICAL_DATABASE_PLAN.md` §2.11) — renderer/manifest changes still happen only through a new `template_version` row, never an in-place edit, unchanged by Task 028.

### 6a. `TemplateEditorManifestV1` (TE-01 contract; implemented and frozen by TE-02)

A third, separate, **code-owned** manifest per production renderer version, describing what Staff are asked to configure for that template. It does not change `RendererCompatibilityManifestV1`, `TemplateDesignManifestV1` or `RendererProductionManifestV1`, and it is not stored in `template_versions.manifest` (that column is immutable and the Elegant Editorial v1 row is already seeded). Full contract and rationale: `docs/DECISIONS.md` "TE-01" T1.

- Lives **outside** the immutable renderer-version directories: type/validator `templates/core/editor-manifest.ts`, per-template manifests `templates/editor/wedding/<templateCode>-v<n>.ts`, explicit ordered list and `lookupTemplateEditorManifest(rendererKey)` in `templates/core/production-editor-manifests.ts`. The editor key list must equal the production renderer key list exactly and in order; validated at module load, fail-closed, no fallback (`docs/DECISIONS.md` "TE-02").
- Declares `mediaModel`: `LEGACY_ROLES` (Elegant Editorial v1: the legacy semantic media roles it already renders) or `TEMPLATE_SLOTS` (Vietnamese Heritage v1 onward: template media slots, §11a).
- Lists ordered **content items** (`COUPLE`, `FAMILIES`, `EVENTS`, `INVITATION_MESSAGE`, `LOVE_STORY`, `TIMELINE`, `DRESS_CODE`, `GIFT`, `MUSIC`) with `REQUIRED` (only `COUPLE`/`EVENTS`)/`RECOMMENDED`/`OPTIONAL`, Staff label, hint and the one fixed section key per item; section-backed items must be capable in the compatibility manifest.
- Lists ordered **media slots**: lower-camelCase position key (never groom/bride/couple), label, hint, `SINGLE`/`ORDERED_MULTI`, `minCount` (0)/`recommendedCount`/`maxCount` (SINGLE = 1, `null` = unbounded), requirement (`RECOMMENDED`/`OPTIONAL` in v1), orientation, advisory `W:H` aspect-ratio hint, optional capable `sectionKey`.
- Current manifests: Elegant Editorial v1 `LEGACY_ROLES` (no slots); Vietnamese Heritage v1 `TEMPLATE_SLOTS` with `heroPhoto`, `portraitCluster` (positions 1–3, max 3), `loveStoryPhoto`, `gallery`. Not variant-specific.
- Frozen with the renderer once released (slot keys, cardinality, `maxCount`); a slot-contract change needs a new renderer version.
- Never read by a renderer at runtime and never holds customer content. It drives the Staff editor, the template-aware readiness evaluator (Staff guidance only, `BLOCKING`/`WARNING`/`READY`; TE-01 T10) and the server-side Snapshot builder input.

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

A versioned renderer directory is immutable once that version is certified or released. This includes its fixed template-owned copy: section headings, closing/thank-you copy, gift intro copy, default salutation, and default generic guest label (`docs/DECISIONS.md` RF7/RF14). Catalog rows for a renderer are seeded only after its key, version and manifest are frozen, and only through a reproducible data-only migration (RF9).

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

RF-05 owns the shared contracts for the behavior candidates above that the Foundation needs: pure date/time/weekday presentation, pure countdown derivation, the pure ceremony month grid, and the RSVP/clipboard/music/clock capability types. Concrete browser adapters (clipboard, audio, timers) are later integration; templates never call `navigator`/`Audio`/`Date.now` directly (`docs/DECISIONS.md` "RF-05 Shared Renderer Boundary / Minimum Shared Client Capabilities Contract Clarification" K27–K35).

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

Task 028 froze the persistence/API layer for this configuration — see `docs/API_CONTRACT.md` §13 and §6's `TemplateDesignManifestV1` subsection above. `template version`/`palette key`/`font preset key`/`effect preset key`/`section visibility/settings`/`template-approved settings` above map directly onto `project_design.template_version_id`/`palette_key`/`font_preset_key`/`effect_preset_key`/`section_settings`/`design_settings`.

### 11a. Project Media Library and Template Media Slots (TE-01, proposed; TE-03/TE-04)

Two layers (`docs/DECISIONS.md` "TE-01" T2–T8):

1. **Project Media Library** — the Project's `project_media` rows. A library photo has no layout meaning; a new neutral `PHOTO` value is the upload category for the template-first editor. Photos already uploaded under legacy layout roles are also library photos, so switching template never requires re-upload.
2. **Template Media Slot Assignment** — per Project and exact `template_version_id`, an ordered list of library photo ids per slot key (`project_template_media_slot_items`, staff-only RPC writes). A slot is a visual position the template's art direction owns: Vietnamese Heritage `portraitCluster` means positions 1–3, never groom/couple/bride.

Semantic media stay global: `AUDIO`, `QR_GROOM`, `QR_BRIDE`, `SOCIAL_SHARE_COVER`. `COVER`, `GALLERY`, `PORTRAIT_GROOM`, `PORTRAIT_BRIDE`, `PHOTO_STORY` and `LOVE_STORY_PHOTO` are legacy layout roles kept unchanged for Elegant Editorial v1; no new template consumes them and no per-template `MediaType` is ever added (the never-applied `PORTRAIT_COUPLE`/0045 was removed by TE-03A; migration number 0045 is retired). One assignment set per Project + template version serves COMMON, GROOM and BRIDE alike (no variant column; TE-03A).

Switching templates keeps the library and keeps each template version's assignments (switching back restores them). **Implemented by TE-04:** Review/Published Snapshots freeze slot assignments as the additive payload v1 field `media.templateSlots` (exactly every declared slot, ids only, `[]` when empty; legacy layout fields absent and `galleryMediaIds` `[]`), every slot id is pinned in `invitation_version_media`, and the ViewModel exposes `media.templateSlots` (`RESOLVED`/`UNAVAILABLE` per position, in order). `sections.gallery` follows the manifest gallery-linked slot; Love Story visibility stays text-only. Every persisted read validates the stored slots against the pinned editor manifest, fail-closed. Renderers read only that frozen, resolved structure, never assignment rows. Elegant Editorial v1 payloads, media refs and ViewModels are byte-identical (pinned by pre-TE-04 hashes).

**First consumer — Vietnamese Heritage v1 (VH-02A, `docs/DECISIONS.md` "VH-02A").** Slot mapping: `heroPhoto[0]` → framed hero photo (else typographic hero); `portraitCluster` → the approved three-photo cluster by `RESOLVED` count (3 → positions 1 | 2 | 3 with 2 dominant, 2 → balanced pair, 1 → centred, 0 → omitted; `UNAVAILABLE` skipped, never substituted; positional only, identical for every variant, generic alt text); `loveStoryPhoto[0]` → Love Story photo when `RESOLVED`, else text only; `gallery` → album in frozen order with `UNAVAILABLE` as neutral tiles. The renderer never reads a legacy layout role and has no fallback from an empty slot.

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

**Implemented in the current tabs by TE-05A** (Staff routes `docs/API_CONTRACT.md` §38): the catalog exposes each version's registry-owned `editorManifest` (a version with an unregistered renderer is listed with `null` and is never newly selectable — catalog, Design tab and `PUT …/design` all enforce it, TE-05A-H1); the Data tab shows a "Chưa chọn mẫu thiệp" card until a template is chosen, then a readiness panel (COMPLETE/WARNING/BLOCKING/NOT_USED, one next action, no new review blockers) and only the content editors and media the manifest declares — the legacy media-role editor for `LEGACY_ROLES`, or the photo library + template media slot editor (+ music and share cover) for `TEMPLATE_SLOTS`. TE-01 makes the editor **template-first**: the selected template version's `TemplateEditorManifestV1` (§6a) decides which optional content and which media slots Staff see. Canonical wedding data stays editable before a template is chosen. The Staff workspace target is Tổng quan · Nội dung & Thiết kế · Duyệt · Xuất bản · Lịch sử, a presentation layer over the unchanged backend lifecycle (`docs/DECISIONS.md` "TE-01" T11, T13).

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

With no `AUDIO` media, no music control is shown. A fake "playing" state without real playback blocks certification (`docs/DECISIONS.md` RF15). The renderer receives the optional RF-05 `capabilities.music` (`status` PAUSED/PLAYING/BLOCKED/ERROR, `play()`, `pause()`), present only when the audio slot is `RESOLVED`; no autoplay, loop on, no volume/mute control in v1 (RF-05 clarification K23–K25).

---

## 18. Countdown and Calendar

Countdown and calendar consume canonical event information.

Templates must not manually parse date strings.

Calendar must handle real month length/leap-year rules through shared utilities.

If no valid target event exists, countdown/calendar should fail safely and validation should warn/block as appropriate.

The countdown target and calendar emphasis are the resolved ceremony event (`docs/DECISIONS.md` RF2). Its absence is the BLOCKING `REQUIRED_CEREMONY_EVENT_MISSING`.

Countdown, date/time/weekday presentation (`vi-VN`, event timezone) and the Monday-first 42-cell ceremony month grid are RF-05 shared pure derivations; templates never derive them independently. A live countdown needs the explicit RF-05 `capabilities.clock` (`nowEpochMs`); without it, no current time is fabricated. There is no ICS/Google Calendar integration in the Foundation (RF-05 clarification K26–K34).

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

Persisted attendance values are only `ATTENDING`/`NOT_ATTENDING` (no `MAYBE`). The renderer receives a submit capability and never owns persistence. Previews and harnesses never fake a persisted success (`docs/DECISIONS.md` RF15). Interactive RSVP UI is shown only when the RF-05 `capabilities.rsvp` is present; its `submit` resolves `SUCCESS`/`INVALID`/`UNAVAILABLE`/`FAILED`, and success UI follows only `SUCCESS` (RF-05 clarification K15–K20).

## 20a. Clipboard

Copy actions (for example, bank account numbers) use one shared capability. It reports success only after the browser copy has actually succeeded. A failure is never presented as success (`docs/DECISIONS.md` RF15). The capability is the optional RF-05 `capabilities.clipboard` (`copyText` → `SUCCESS`/`UNAVAILABLE`/`FAILED`); templates never call `navigator.clipboard` and there is no `execCommand` fallback (RF-05 clarification K21–K22).

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

Today every production renderer is statically bound into one client graph (VH-01 item 6 debt). Checkpoint RS-01 adds `rendererKey`-based lazy loading, fail-closed, before Vietnamese Heritage reaches the Production branch (`docs/DECISIONS.md` "TE-01" T14).

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

Status: `wedding.vietnamese-heritage.v1` static production visuals complete (VH-02A): Task 029 heritage-vermilion direction, eight Product Owner-authorized WebP decor derivatives (renderer-specific, ≈ 0.56 MiB), WeddingClick-owned vector Song Hỷ, `TEMPLATE_SLOTS` media (§11a). Not production-ready: interactions (VH-02B), DEV catalog seed + visual QA, RS-01 and certification (§25) remain.

VH-02A-QA1 / VH-02B-E1 (`docs/DECISIONS.md`): couple names fit one line by CSS from their code-point count (balanced-wrap fallback over 24 code points); album photos are never cropped (`contain` on the print mat, full-width rows use the photo's bounded ratio); "Xem chỉ đường" only for a canonical `mapUrl`; RSVP island only with `capabilities.rsvp`; "Gửi Quà Cưới" CTA opening a native gift dialog, copy control only with `capabilities.clipboard`. Shared pure renderer interaction models: `lib/invitation-rendering/rsvp-form-model.ts`, `clipboard-copy-feedback.ts`. VH-02B-M1: split-door opening (explicit tap; Task 029 260 / 880 / 1180 ms sequence; reduced motion = 220 ms fade), music only with `sections.music` + `capabilities.music` (one start-on-open play attempt, status-driven control), countdown only with `capabilities.clock` (hidden once passed); shared pure `music-control-model.ts`. Still deferred: gallery lightbox, reveal motion.

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
