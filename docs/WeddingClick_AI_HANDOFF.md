# WeddingClick AI Handoff

> **STATUS:** CANONICAL HANDOFF
> **HANDOFF_VALID_AT_COMMIT:** `ae28dcac144a4080075f0d11ce5ccf43d5fdfc51`
> **CURRENT_CHECKPOINT:** `RF-06E`
> **CURRENT_BRANCH:** `weddingclick-v2`
> **Expected clean task state:** `HEAD == origin/weddingclick-v2`; worktree contains only the unrelated pre-existing `M CLAUDE.md`; nothing staged.

---

## 0. New-chat bootstrap

When opening a new ChatGPT conversation, use this instruction:

> Read `WeddingClick_AI_HANDOFF.md` first. Treat `docs/DECISIONS.md`, the repository, and frozen commits as canonical. Verify the current Git state before continuing. Do not reopen frozen decisions. Continue only from `NEXT EXACT ACTION`. If the repo state differs from this handoff, stop and reconcile the newer state before giving implementation instructions.

This handoff is **navigation + current state**, not a replacement for Git, source code, tests, or `docs/DECISIONS.md`.

---

## 1. Project

**Project:** WeddingClick V2
**Product:** Online wedding invitation platform
**Primary current workstream:** Invitation Rendering Foundation
**Repository branch:** `weddingclick-v2`

### Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind 4
- Supabase
- Vercel

### DEV/STAGING Supabase

`rggmsdnjnfmnzxdaxcra`

Do not contact Supabase unless the active checkpoint explicitly allows it.

---

## 2. Roles and working model

### Product Owner
The user.

The user is not expected to manually implement code.

### ChatGPT
Acts as:

- Product lead
- Architecture lead
- Contract/decision keeper
- QA/review lead
- Checkpoint coordinator

ChatGPT should review state/reports and provide **one optimal Claude prompt** when implementation/review/freeze work is the natural next step.

### Claude Code in Cursor
Acts as implementation/repository execution agent.

### Required checkpoint flow

For implementation checkpoints:

1. ChatGPT reviews current frozen state
2. ChatGPT gives **ONE** Claude prompt
3. User runs Claude
4. User returns Claude report
5. ChatGPT independently evaluates report
6. True independent Claude review if required
7. Freeze only after PASS
8. Update handoff after freeze

Do not skip independent review for checkpoints where it is required.

---

## 3. Global guardrails

These are high-priority project rules.

- Never run `npm audit fix --force`.
- Never modify `CLAUDE.md` unless a future explicit project decision changes this.
- There is a pre-existing unrelated `M CLAUDE.md`.
- Known unrelated whitespace issue around `CLAUDE.md:869`.
- Leave `CLAUDE.md` untouched and unstaged.
- Never edit applied migrations.
- No QA artifacts in commits (`*.patch`, `*.txt`).
- No secrets.
- No force push.
- If Cursor/Claude crashes, inspect state before rerunning.
- Never use `git clean`.
- Never use `git reset --hard`.
- User may code via Claude only when the active checkpoint permits it.
- Do not start Task030 until Invitation Rendering Foundation completion gate is satisfied.
- Do not silently patch a frozen checkpoint from a later checkpoint. If a frozen-layer defect is discovered, BLOCK and route it to the correct owner.
- Task029 prototype code/assets must not leak into production renderer implementation.
- Public rendering must never rebuild mutable draft state.
- Do not use service-role access for renderer paths.
- Do not create fake success states for unavailable capabilities.

---

## 4. Canonical source hierarchy

Use this precedence:

1. **Repository code at the verified Git state**
2. **`docs/DECISIONS.md` frozen contracts**
3. **Frozen checkpoint commits**
4. **Independent review evidence**
5. **This handoff**
6. Conversation memory

If this handoff disagrees with Git or a frozen contract, Git/contract wins.

---

## 5. Frozen roadmap before Invitation Rendering Foundation

### Task026
FROZEN — opaque project access links.

### Task027
FROZEN at:

`627564231884b0c17acbedbba995476c9c213743`

### Task028
FROZEN before Task029 at:

`5d0a8d3`

### Task029 — Visual Prototypes
FROZEN at:

`03131816d7966ccd9fad0e135df37bd65af7ee99`

Approved visual directions:

- Elegant Editorial
- Vietnamese Heritage
- Romantic Minimal

Important:

- UI label **Elegant Editorial** renders `GreenIvoryEditorialPrototype`.
- Old `_directions/elegant-editorial/` is legacy/dead.
- Task029 is visual reference only.
- Task029 does **not** deliver production rendering foundation.
- No production import from Task029.

---

## 6. Invitation Rendering Foundation — architecture

Canonical flow:

`Canonical draft/design/template`
→ `Wedding Domain Resolver`
→ `versioned serializable Snapshot Payload`
→ `media refs`
→ render-time `InvitationViewModel`
→ fail-closed renderer registry
→ versioned renderer

### Security / architectural invariants

- Staff preview later uses staff RLS, not `service_role`.
- Snapshot stores media refs/paths, not signed URLs.
- Templates never access Supabase.
- No `?guest=` identity.
- Public rendering never rebuilds mutable draft.
- No fallback renderer version.
- Explicit side roles survive JSON.
- No object-identity logic.
- `InvitationViewModel` is runtime-only and not persisted.
- Guest overlay is presentation/runtime data, not mutable snapshot state.
- Templates consume pure props/capabilities, not DB/network/browser authority directly.

---

## 7. RF-00 baseline contract

RF-00 FROZEN at:

`46f4e1f5c5f3a6966d6c162d05c1ce8b4c43bdd9`

Important frozen rules:

### Lunar date
Canonical manual event-level field:

`project_events.lunar_date_display TEXT NULL`

Legacy/equivalent `wedding_details` field is deprecated for renderer use.

Renderer never reads the legacy field.

### Ceremony selection

- `COMMON` / `GROOM`
  - required rite: `THANH_HON`
  - title: `Lễ Thành Hôn`
- `BRIDE`
  - required rite: `VU_QUY`
  - title: `Lễ Vu Quy`

Display/order resolution:

`sort_order → starts_at → id`

No wrong-rite substitution.

Missing required ceremony is blocking:

`REQUIRED_CEREMONY_EVENT_MISSING`

### Other RF-00 invariants

- Payload schema v1.
- Deterministic.
- Serializable.
- No signed URLs.
- No guest overlay in persisted payload.
- No runtime RSVP in persisted payload.
- `additional_note` is not renderer content.
- No fake QR_COMMON.
- No auto font certification.
- Certified renderer directories immutable after certification.
- RSVP choices: `ATTENDING` / `NOT_ATTENDING`; no `MAYBE`.
- Fake audio/clipboard behavior forbidden.
- Elegant Editorial v1 must prove architecture before Task030.

---

## 8. Foundation checkpoint history

### Lunar prerequisites

- RF-L01: FROZEN; commit begins `44a529d` (use Git history / DECISIONS for exact full hash if needed)
- RF-L02: DEV/STAGING PASS
- RF-L03 API/domain: commit begins `2b962a24`
- RF-L03D preview: deployed; preview env override confirmed
- Production env mapping remains future verification

### RF-01
FROZEN at:

`5ee6bd1e2cd7104aaba5303fde85a08b05abadee`

67 tests at freeze.

### RF-02
Clarification:

`9b93b9c123809d700f39e758dd2bd57216dc89d3`

Implementation FROZEN:

`f2f9ea222286d618076c225675549a13319c1133`

89 tests at freeze.

### RF-03
Clarification commit begins:

`435bb3d`

Implementation FROZEN:

`260a03fadd571b7a5dee0b29c3614e732dc6cca9`

Important RF-03 facts:

- Media statuses: `RESOLVED` / `UNAVAILABLE`
- ViewModel construction pure and synchronous
- Complete resolution set
- Guest overlay exposes display name only
- No RSVP capability in ViewModel
- No runtime clock/date/time capability in ViewModel

### RF-04
Clarification FROZEN:

`c44000a8037e1be1ed4c5ca1dc00d5b7d37ff50f`

Implementation FROZEN:

`fe8b400f9e190c0eab320996b2df18cfa3b0423b`

Manifest fields exactly:

- `rendererKey`
- `supportedPayloadSchemaVersions`
- `supportedVariants`
- `sectionCapabilities`

Rules:

- exact lookup
- no fallback
- invalid settings → typed selection errors
- fail-fast registry consistency
- compatibility registry only; no React component yet

### RF-05 contract
Contract freeze:

`0b6f1a7773a91832084bcfbf788d80f1fc6daeaf`

K1–K45 authoritative.

RF-05A FROZEN:

`ee8be5b334ff36885427c6f2282ae57a13386763`

RF-05B FROZEN:

`b1c8cd109479fcf6a540cf33998e7748bda46a15`

RF-05C FROZEN:

`fc94b30682bce0d568bcfc444957b4c349c90f95`

RF-05D verification-only PASS; no RF-05D commit.

Important RF-05 contract summary:

- Renderer type:
  `React.ComponentType<InvitationRendererPropsV1>`
- Props exactly:
  `{ viewModel, sections, capabilities }`
- Binding:
  `{ compatibilityManifest, component }`
- Binding key = `manifest.rendererKey`
- No renderer discovery/fallback
- `RendererBindingInvariantError` owns binding invariant failures
- RF-04 selection errors propagate
- `capabilities` is a closed object with optional:
  - `rsvp`
  - `clipboard`
  - `music`
  - `clock`
- RSVP:
  - `ATTENDING` / `NOT_ATTENDING`
  - party-size frozen semantics
  - message max 500 Unicode code points
  - personalized guest submits `guestName: null`
  - unpersonalized guest must provide guest name
  - renderer prevalidation is not authoritative acceptance
- Clipboard:
  - status/result contract only
- Music:
  - `PAUSED`
  - `PLAYING`
  - `BLOCKED`
  - `ERROR`
  - explicit play only
  - no autoplay
  - loop
  - no volume/mute
  - expected browser failures resolve through status
- Clock:
  - `{ nowEpochMs }`
  - no Date/Date.now function passed to renderer
- Countdown:
  - frozen 24-hour semantics
  - explicit clock input
- Date/time:
  - explicit event timezone
  - Vietnamese formatting constraints
- Lunar:
  - passthrough unchanged
  - null omitted
- Ceremony calendar:
  - Monday-first
  - 42 cells

---

## 9. RF-06 — First production renderer contract

### RF-06-0
FROZEN at:

`ef0b632f3f0a64b501a72153992a97f3ae68b578`

Renderer identity:

- eventType: `WEDDING`
- templateCode: `elegant-editorial`
- versionNumber: `1`
- displayName: `Elegant Editorial`
- rendererKey: `wedding.elegant-editorial.v1`

Design:

- palette: green-ivory
- font preset: editorial-classic
- effect: STANDARD
- Elegant v1 designSettingsSchema: exactly `{}`

Fonts:

- Great Vibes 400
- Source Serif 4 400/600, normal + italic as required
- Inter 400/500/600
- via `next/font`

Lunar copy:

- fixed label: `Tức ngày`
- `lunarDateDisplay` verbatim
- null/empty line omitted

Section capabilities:

- invitationMessage = true
- loveStory = true
- gallery = true
- music = true
- gift = true

Always-rendered blocks include:

- opening
- hero
- guest
- couple
- families
- ceremony
- calendar
- events
- closing

Countdown gated by capability.
RSVP gated by capability.

Media mapping:

- cover
- gallery
- audio
- QR sides

Never fabricate:

- QR_COMMON
- portraits
- cluster/opening role

Opening may reuse cover.

Common/Groom/Bride side semantics are frozen.

Harness:

- development-only
- production → `notFound()`
- only the approved server gate may read `process.env.NODE_ENV`
- harness server imports one client entry
- no callback crosses RSC

No prototype imports/code/assets.

Mobile-first renderer; desktop centered around ~480px.

---

## 10. RF-06A — production manifest foundation

FROZEN at:

`7b7c9612fedcb41d53d71e16abc85e91155b9d61`

Key accepted facts:

- production manifest foundation
- registry/fixture foundation
- `PRODUCTION_RENDERER_MANIFESTS`
- `PRODUCTION_RENDERER_KEYS`
- binding code must use production registry, not raw constant
- no blocker from accepted safe follow-ups

---

## 11. RF-06B — static production renderer

FROZEN at:

`6e558a07c097dc3de1fe3bd65bdc81934a923b59`

Subject:

`feat: add static elegant editorial production renderer`

RF-06B froze:

- static Elegant Editorial production renderer
- production binding
- Host boundary
- fonts
- scoped CSS
- harness
- static degraded-state rendering

Important:

- `InvitationRendererHost` initially had exactly:
  - rendererKey
  - viewModel
  - sections
- RF-06B had no interaction/capabilities UI
- Lunar fixed label is exactly:
  `Tức ngày`
- no Task029 import
- no browser adapter behavior in renderer

---

## 12. RF-06C — browser capability adapters + client capability wiring

FROZEN at:

`fbcdbf7ac4395ab6953b7774d5d540f3b949cf4b`

Subject:

`feat: add browser renderer capability adapters`

RF-06C freezes:

### Production Host boundary

Server-facing public props remain exactly:

- `rendererKey`
- `viewModel`
- `sections`

No public capability override prop.

No callback serialized Server → Client.

### Internal HostCore

- internal client-graph composition
- one optional RSVP injection surface for harness client path only
- no generic capability bag
- no clipboard/music/clock override surface

### Clipboard

- modern `navigator.clipboard.writeText`
- SUCCESS only after resolved write
- FAILED on rejected write
- UNAVAILABLE when API missing/unusable
- no `execCommand`

### Music

Capability exists only when:

- `sections.music === true`
- audio is RESOLVED/permitted

Behavior:

- Audio created lazily on first explicit play
- `preload = "none"`
- loop true
- no autoplay
- status:
  - PAUSED
  - PLAYING
  - BLOCKED
  - ERROR
- expected DOMException outcomes resolve
- unexpected non-DOMException faults reject
- explicit retry only
- cleanup releases listeners/element
- URL change gets a new controller

### Clock

- absent SSR / first client render
- starts after mount
- `Date.now()` only in clock adapter lifecycle
- roughly 1000ms tick
- interval cleanup idempotent
- no formatting/persistence

### RSVP

Production:
- absent

Harness:
- client-only frozen capability
- always `UNAVAILABLE`
- never SUCCESS
- no persistence/network

### RF-06C accepted debt / watches

- HostCore safety is due to actual import graph/build/static enforcement, not merely lacking `"use client"`
- importer static test could later be hardened for `@/` aliases and `components/`
- clock rerenders renderer tree every second; optimization optional
- real-device/browser capability certification deferred

---

# 13. RF-06D — Interactive Renderer Islands + Motion

## Status

**FROZEN** at:

`ae28dcac144a4080075f0d11ce5ccf43d5fdfc51`

Commit subject:

`feat: add interactive elegant editorial renderer`

Push:

normal push to `origin/weddingclick-v2`; no force.

### Freeze integrity

The final freeze verified the exact independently reviewed state:

- initial RF-06D task hashes: `29/29` matched
- post-gate hashes: `29/29` matched
- staged blob hashes: `29/29` matched
- committed blob hashes: `29/29` matched
- commit contained exactly the 29 RF-06D task paths
- `CLAUDE.md` was untouched and not staged
- RF-06C production adapters and Host architecture remained unchanged
- no docs, Task029, Supabase, API, migration, package, deployment, or catalog work was included

Post-push expected repo state:

- branch: `weddingclick-v2`
- `HEAD == origin/weddingclick-v2`
- HEAD: `ae28dcac144a4080075f0d11ce5ccf43d5fdfc51`
- worktree: only the unrelated pre-existing `M CLAUDE.md`
- nothing staged

---

## 14. RF-06D frozen behavior

### Opening

- explicit `Mở thiệp`
- explicit `Xem ngay`
- no forced timer
- no persistence
- no network
- no autoplay/music side effect
- invitation content remains rendered
- opening state survives clock rerenders
- reload reseals intentionally
- focus moves to the guest line after opening
- reduced-motion CSS removes transition delay

### P42 reveal decision

Independent review decided:

**P42 “reveal” is ownership/scope, not a mandatory generic scroll-reveal feature.**

Do not add IntersectionObserver or generic reveal-on-scroll solely because P42 contains the word `reveal`.

### Countdown

- renders only with `capabilities.clock`
- uses frozen `deriveCeremonyCountdownV1`
- no ambient Date/Intl logic
- canonical ceremony target
- no negative countdown display
- completed state uses fixed renderer copy

### Music UI

- renders only when `sections.music === true` and a music capability exists
- UI reflects frozen capability statuses:
  - `PAUSED`
  - `PLAYING`
  - `BLOCKED`
  - `ERROR`
- local `FAULTED` UI state is not a capability status
- `PLAYING` → pause
- other statuses → explicit play
- no autoplay
- no automatic retry
- synchronous throw and rejected Promise are handled
- no unhandled rejection

### Harness audio

Local deterministic fixture:

`public/internal/renderer-harness/audio-tone.wav`

SHA-256:

`f619c22e21ffb5161147f82ec567d3ce0ee14e0c0673c04ec71178d9334c2c37`

Properties:

- harness-only
- deterministic generated WAV
- 16,044 bytes
- 8-bit mono PCM
- 8 kHz
- no external/copyright source

Scenario:

`music-resolved`

uses the real fixture pipeline and resolves the canonical audio slot.

All original non-music scenarios keep audio `UNAVAILABLE`.

### Accepted RF-06C test evolution

The RF-06D independent review explicitly accepted this as legitimate D-owned evolution:

- original harness scenarios → capabilities `["rsvp"]`
- `music-resolved` → capabilities `["rsvp", "music"]`
- initial music status → `PAUSED`

This did **not** modify RF-06C production adapter/Host behavior.

### Gift / dialog

- canonical GROOM/BRIDE side mapping preserved
- no `QR_COMMON`
- no fabricated bank data
- unavailable-only side omitted
- no empty gift dialog
- native `<dialog>`
- `showModal()` / `close()`
- focus enters dialog
- focus returns to opener

### Clipboard UI

- appears only with clipboard capability + legitimate account number
- copies canonical account value verbatim
- SUCCESS only after capability SUCCESS
- FAILED/UNAVAILABLE are truthful
- rejected/malformed result never becomes SUCCESS
- feedback is local only

### RSVP UI

Capability gate:

- no capability → no RSVP block
- production Host has no RSVP capability
- harness remains `UNAVAILABLE`-only

Personalized:

- no guest-name input
- submit `guestName: null`
- `displayName` is presentation-only and not identity

Unpersonalized:

- labelled required name
- blank-after-trim rejected locally
- submitted value follows frozen validator semantics

Status:

- `ATTENDING`
- `NOT_ATTENDING`
- no `MAYBE`

Party size:

- ATTENDING → 1–20
- NOT_ATTENDING → 0

Message:

- max 500 Unicode code points

Results handled:

- `SUCCESS`
- `INVALID`
- `UNAVAILABLE`
- `FAILED`

Rejected Promise:

- caught
- never SUCCESS
- form remains recoverable

Double-submit:

- synchronous gate + reducer guard
- explicit retry allowed after settle/failure

Accessibility baseline:

- real form
- fieldset/legend
- labels
- described validation
- status region
- visible character counter

### Motion / CSS

- CSS-only
- no framer-motion
- no generic scroll reveal
- no infinite animation
- scoped CSS module
- `prefers-reduced-motion: reduce` coverage present

---

## 15. RF-06D frozen verification evidence

Final freeze gates all PASS:

- RF-06D focused: `7 files / 121 tests`
- RF-06C regression: `5 files / 91 tests`
- RF-06B / Elegant Editorial regression: `8 files / 179 tests`
- `templates/core`: `10 files / 621 tests`
- `lib/invitation-rendering`: `13 files / 628 tests`
- Combined RF-06 suite: `38 files / 1510 tests`
- Full repository: `141 files / 3775 tests`
- Typecheck: PASS
- Lint: PASS, 0 warnings
- Build: PASS
- `git diff --check`: only unrelated `CLAUDE.md:869` trailing whitespace

No deployment was performed.

---

## 16. RF-06D frozen task hashes

RF-06F must reverify these against the committed tree.

```text
74c7f564ebebbb2abcaa6df8556f487040bf47e9262a6d70d215ac54c60a3f62  app/internal/renderer-harness/harness-audio-provenance.md
fafbb4a1e4f036b695cdfd24ee2a5e4ff947bd369eb6a576a68b54f6616c2c49  app/internal/renderer-harness/harness-scenarios.ts
e00790dadbd8c7b166568a9acb02e37dc0a278bf859e45bf167163512fc299fa  app/internal/renderer-harness/__tests__/harness-audio-fixture.test.ts
138106bb29a0ea89a934cb7c8d60de17b235250a276065770e214bd18bc26851  app/internal/renderer-harness/__tests__/harness-scenarios.test.ts
21e05ff0e257906b3e969d5c0e173702648152dc9d8aad9645b112ff57f1edc9  app/internal/renderer-harness/__tests__/renderer-harness-client.test.tsx
f619c22e21ffb5161147f82ec567d3ce0ee14e0c0673c04ec71178d9334c2c37  public/internal/renderer-harness/audio-tone.wav
11836a1002df64cb90bea1bf261e16ab4666b0ddce7cd02db737049714f022d1  templates/core/__tests__/invitation-renderer-host.test.tsx
8de642dc4ca4a03030d4b8f4330c604ca8b343f8362e1e329d8d6f482198c3d8  templates/core/__tests__/renderer-static-boundary.test.ts
d162c88097fb2804c247f3b9234ad2136a2b05d066b2ad121c207005a3b91391  templates/wedding/elegant-editorial/v1/copy.ts
ae0c7277c71b20c4d91afa5179f739f314ec6b2a21e6f25d630c2451a54c75be  templates/wedding/elegant-editorial/v1/elegant-editorial-v1.module.css
9ef1b100bc183ccffb3c4139214780a89d508df1be73d44fd3965cb298cdb306  templates/wedding/elegant-editorial/v1/elegant-editorial-v1.tsx
a2b2d5dc7b65962a2f1a8e7258f99d0a2aa2f4c595a0f4a068b8a3c5b1c4bd7e  templates/wedding/elegant-editorial/v1/interactive/copy-account-button.tsx
6682a0cadd637eae48eee8336e28ee8ed810698a40fe4db1ef4d2ebd64f06f37  templates/wedding/elegant-editorial/v1/interactive/countdown.tsx
970456096c4693598244314c05226526f820719389ebf5c3e4c52195bf54de20  templates/wedding/elegant-editorial/v1/interactive/gift-dialog.tsx
19b79dd2dc17758b4c3e43262a3e37dca8a7be685a2f7c6727b66954650c1999  templates/wedding/elegant-editorial/v1/interactive/music-control.tsx
57f1c691aab45ab85fdf76ebca5c7aa80594706293c902a0555742350ad83807  templates/wedding/elegant-editorial/v1/interactive/opening-interaction.tsx
ae7cd71127e268ca50ec516f571019bd48b4281c07a3f15c568c0a03b134b810  templates/wedding/elegant-editorial/v1/interactive/opening-state.ts
6995f627ec303ccaeb5cb72759b20d2789ed22b8d11ccebdb47fd98e88e0696c  templates/wedding/elegant-editorial/v1/interactive/rsvp-model.ts
71b08afac83594eb6e31a09d7ec4a6137d0c79b24596bdef040651dfb86c3a7d  templates/wedding/elegant-editorial/v1/interactive/rsvp.tsx
1eb351fa3a8cfd9ec7f651577a281285e34719864c6a4905a18b39b8f00ad36c  templates/wedding/elegant-editorial/v1/sections/gift.tsx
3ea405ea6df8ea17575382bc8258e37559682b8b7e46c9f8ae3afae76b3fd77d  templates/wedding/elegant-editorial/v1/sections/opening-cover.tsx
3570c4da7e410f385005f77cab4fed8a002b0d1ef1a572bb3a04944c66cb39d6  templates/wedding/elegant-editorial/v1/__tests__/elegant-editorial-v1.test.tsx
8b6e46b51ead60510619b3e00bc13025d223d9af880c050094b26e8f7f573e04  templates/wedding/elegant-editorial/v1/__tests__/fonts-palette-copy.test.ts
192adfacfe9e12507220ac6f761b43e3fbda4dcf918f569338620bc3f8e3cdb0  templates/wedding/elegant-editorial/v1/__tests__/interactive-copy.test.ts
fcdbc9282ffa77ddc43aa41c652dd7b6cac2a8bd3825bc5608fed80a78b211c4  templates/wedding/elegant-editorial/v1/__tests__/interactive-countdown.test.tsx
5d89ab8bf1a50c318a874992e46761485831e0a3146ef248955ac7b1cafce48e  templates/wedding/elegant-editorial/v1/__tests__/interactive-gift-clipboard.test.tsx
ddbb32218dcbf2b9032d8bde5781d619df7837a9c1f38e8f74ad62cae3eae99d  templates/wedding/elegant-editorial/v1/__tests__/interactive-music.test.tsx
f5c017d46bd945c6441ed25281b4905bf8d169421e4ae0b01d3969434fb0b890  templates/wedding/elegant-editorial/v1/__tests__/interactive-opening.test.tsx
b682fe4cc8a7c69a2539534842b244d9c3ef80e7bb384f842f67cc18f61f448c  templates/wedding/elegant-editorial/v1/__tests__/interactive-rsvp.test.tsx
```

---

# 17. CURRENT CHECKPOINT — RF-06E

RF-06D is now frozen.

**Current checkpoint:** `RF-06E`

RF-06E has **not started**.

Task030 remains blocked until the Invitation Rendering Foundation completion gate is satisfied.

### Current canonical Git baseline

Branch:

`weddingclick-v2`

HEAD:

`ae28dcac144a4080075f0d11ce5ccf43d5fdfc51`

Expected:

`HEAD == origin/weddingclick-v2`

Expected worktree before starting RF-06E:

` M CLAUDE.md`

only.

Nothing staged.

If a future chat finds a different HEAD or additional worktree changes, reconcile state before starting RF-06E.

---

## 18. RF-06E mandatory carry-forward

These are not optional forgotten polish items; they are explicit certification/hardening work to verify or resolve in RF-06E according to the frozen RF-06 contract.

### Clean browser / dialog

- Verify physical Escape on gift dialog in a clean, extension-free browser/profile.
- Confirm native cancel → close behavior.
- Confirm focus restoration.

### Reduced motion

- Verify `prefers-reduced-motion` with real browser emulation where available.
- Verify on real-device/browser coverage where practical.
- Opening and dialog interaction must remain immediately usable.

### Mobile/device layout

Real-device or equivalent high-confidence QA at:

- 360 px
- 390 px
- 430 px

Focus particularly on:

- dialog settled vertical position
- dialog entry transition
- no horizontal overflow
- long names/content
- controls/tap targets

### iOS Safari

Verify at minimum:

- music `BLOCKED` behavior
- music `ERROR` behavior where reproducible
- retry behavior
- clipboard available/unavailable/permission outcomes
- native dialog behavior

Do not fabricate results that cannot be reproduced.

### Screen reader / accessibility certification

Verify announcements and semantics for:

- `role="status"`
- `role="timer"`
- RSVP result feedback
- music status feedback
- dialog labeling/focus
- keyboard operation

### Typography / font / Vietnamese glyph certification

Carry prior E watches:

- Vietnamese glyph coverage, including uppercase forms such as `TỨC NGÀY`
- Great Vibes / Source Serif 4 / Inter actual loaded behavior
- fallback behavior
- long couple names at narrow widths
- visual typography consistency across target browsers

### Copy/watch item

Evaluate the frozen English copy:

`Save the date`

against RF-06 copy/certification expectations. Do not silently change unless RF-06E authority permits/documented review requires it.

### Visual watch

Review low contrast of out-of-month calendar days.

Treat as accessibility/visual certification evidence, not an automatic redesign.

### Docs sync

The RF-06-0 header in `docs/DECISIONS.md` was known to still say `not yet frozen`.

RF-06E owns docs/status sync according to the frozen process.

Do not rewrite historical contract substance.

---

## 19. RF-06F mandatory carry-forward

RF-06F is final verification only.

At minimum it must:

- reverify the frozen RF-06D hashes from §16 against the committed tree
- reverify frozen RF-06A/B/C/D boundaries
- rerun required final suites/gates from the RF-06 contract
- verify RF-06E did not silently modify production code outside approved owner patches
- confirm the Invitation Rendering Foundation completion gate

Defect workflow remains:

`BLOCK → owner patch → focused/regression tests → independent patch review → owner commit/push/refreeze → rerun verification`

RF-06F must not silently edit production code.

---

## 20. Accepted technical debt / safe follow-up

Do not reopen a frozen checkpoint only for these unless a later authorized checkpoint explicitly owns them:

### From RF-06C

- HostCore safety comment wording could be clearer.
- static importer test could resolve `@/` aliases and scan `components/`.
- whole-renderer 1-second clock rerender may be optimized later.

### From RF-06D

- static root test does not explicitly forbid passing/spreading the whole `capabilities` object; current code does neither.
- whitespace-only RSVP message over 500 code points is stricter than contract but accepted.
- rapid music double-press can issue two commands; capability status remains authoritative.
- local `FAULTED` note stays visible until the next press.

These are not current blockers.

---

# 21. NEXT EXACT ACTION

**Do not start Task030.**

The next project operation is:

### RF-06E — QA / Certification / Docs

Before giving Claude an RF-06E implementation/QA prompt, ChatGPT should:

1. verify the repo baseline is still:
   `ae28dcac144a4080075f0d11ce5ccf43d5fdfc51`
2. verify worktree is only unrelated `M CLAUDE.md`
3. read the RF-06E ownership/process clauses in the frozen RF-06-0 contract
4. construct RF-06E as a QA/certification checkpoint, not feature expansion
5. include all mandatory carry-forward items in §18
6. preserve the RF-06E defect workflow:
   - QA/docs does not silently patch production defects
   - defect → BLOCK
   - route to owner patch
   - focused/regression verification
   - independent patch review
   - commit/push/refreeze owner
   - rerun RF-06E

Only after RF-06E PASS should the project proceed to RF-06F.

Only after RF-06F completion may the Invitation Rendering Foundation completion gate be considered satisfied.

Task030 remains blocked until then.

---

## 22. New-chat operating instruction

For a new ChatGPT conversation:

> Read `WeddingClick_AI_HANDOFF.md` first. This handoff is valid at commit `ae28dcac144a4080075f0d11ce5ccf43d5fdfc51`. Treat Git and `docs/DECISIONS.md` as canonical. Verify branch, HEAD, origin and worktree before continuing. Do not reopen frozen checkpoints. Current checkpoint is RF-06E. Do not start Task030. Continue from `NEXT EXACT ACTION`.

If the repository HEAD is newer than the handoff commit:

- do not assume this file is current
- determine what newer checkpoint/patch was committed
- update the handoff before issuing further implementation instructions

---

## 23. Compact state for ChatGPT

```text
PROJECT: WeddingClick V2
BRANCH: weddingclick-v2

HANDOFF_STATUS:
CANONICAL

HANDOFF_VALID_AT_COMMIT:
ae28dcac144a4080075f0d11ce5ccf43d5fdfc51

ROLE:
User = Product Owner
ChatGPT = Product + Architecture + QA/Review lead
Claude Code = implementation agent

CHECKPOINT PROCESS:
ChatGPT review
-> ONE Claude prompt
-> author/QA report
-> independent review when required
-> freeze
-> update handoff

CURRENT HEAD:
ae28dcac144a4080075f0d11ce5ccf43d5fdfc51

EXPECTED WORKTREE:
M CLAUDE.md only
nothing staged

FROZEN:
RF-00
RF-01
RF-02
RF-03
RF-04
RF-05
RF-06-0 ef0b632f3f0a64b501a72153992a97f3ae68b578
RF-06A 7b7c9612fedcb41d53d71e16abc85e91155b9d61
RF-06B 6e558a07c097dc3de1fe3bd65bdc81934a923b59
RF-06C fbcdbf7ac4395ab6953b7774d5d540f3b949cf4b
RF-06D ae28dcac144a4080075f0d11ce5ccf43d5fdfc51

CURRENT_CHECKPOINT:
RF-06E — QA / Certification / Docs

RF-06E:
NOT STARTED

RF-06F:
NOT STARTED

TASK030:
BLOCKED until Invitation Rendering Foundation completion gate

PRODUCTION RSVP PERSISTENCE:
ABSENT

NEXT EXACT ACTION:
prepare/run RF-06E according to frozen RF-06 contract and §18 carry-forward

DO NOT:
touch CLAUDE.md
reopen frozen RF-06A/B/C/D decisions without a blocker workflow
start Task030
silently patch defects during RF-06E
contact Supabase unless RF-06E authority explicitly requires it
install packages without an authorized need
deploy unless an explicit checkpoint permits it
force push
```

---

# END OF CANONICAL HANDOFF
