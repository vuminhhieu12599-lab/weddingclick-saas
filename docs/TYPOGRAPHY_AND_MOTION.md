# WeddingClick V2 — Typography & Motion Specification

**Status:** Core product capability specification  
**Last updated:** 2026-09-10

## 1. Product Intent

Typography and motion are essential to WeddingClick's visual differentiation.

The goal is not to provide hundreds of uncontrolled options. The goal is to provide a **curated, extensible library** that lets templates express many distinct wedding styles while preserving Vietnamese quality, licensing safety, performance, and design consistency.

---

## 2. Font Library Principles

WeddingClick should maintain an internal Font Library/registry.

A production font entry should contain metadata such as:

- stable key;
- family name;
- source/license information;
- supported weights/styles;
- Vietnamese verification status;
- category/style tags;
- loading strategy;
- optional fallback stack.

Possible categories:

- luxury serif;
- editorial serif;
- modern sans;
- minimal sans;
- display;
- romantic/script;
- Vietnamese/traditional-inspired;
- specialty accent.

Do not couple font families directly to one template if they can be safely reused.

---

## 3. Vietnamese Glyph Certification

A font must not enter production until Vietnamese rendering is visually verified.

Test representative text including:

```text
Nguyễn Thành Minh
Trần Khánh Hương
Đặng Thị Thúy Hằng
Đỗ Nguyễn Hoàng Anh

LỄ THÀNH HÔN
LỄ VU QUY
TRÂN TRỌNG KÍNH MỜI

Anh Hiếu và gia đình
Chú B và người thương
Em và sự cô đơn
```

Also test Vietnamese-specific characters and diacritics:

```text
Ă Â Ê Ô Ơ Ư Đ
ă â ê ô ơ ư đ
á à ả ã ạ
ắ ằ ẳ ẵ ặ
ấ ầ ẩ ẫ ậ
é è ẻ ẽ ẹ
ế ề ể ễ ệ
ó ò ỏ õ ọ
ố ồ ổ ỗ ộ
ớ ờ ở ỡ ợ
ú ù ủ ũ ụ
ứ ừ ử ữ ự
ý ỳ ỷ ỹ ỵ
```

Verification includes not merely “glyph exists” but visual quality:

- marks are positioned correctly;
- uppercase diacritics are not clipped;
- line-height does not crop accents;
- script fonts remain legible;
- weight rendering is acceptable;
- fallback does not unexpectedly replace only Vietnamese glyphs.

---

## 4. Licensing Rule

Production use requires verified rights for web and commercial use.

For every font source record:

- record license/source;
- verify web embedding/use is permitted;
- verify commercial use is permitted;
- follow attribution requirements if any.

Never commit random downloaded font files without explicit license verification.

Do not assume “free download” means commercial/web license.

---

## 5. Initial Font Scope

Initial launch target: approximately **8–12 carefully selected font families**, subject to actual design needs and verification.

Prefer a balanced catalog rather than quantity.

The catalog should cover enough directions to support:

- editorial luxury;
- Vietnamese heritage;
- romantic/minimal;
- modern sans;
- expressive accent/script use.

The final list should be selected during template art-direction implementation and documented in the Font Library registry.

---

## 6. Font Presets

Templates expose curated font presets rather than unrestricted font mixing.

A preset may define:

- display font;
- body font;
- accent/script font;
- allowed weights;
- text-transform behavior;
- tracking/line-height parameters.

Example conceptual preset:

```text
Editorial Classic
- Display: Font A / 500
- Body: Font B / 400, 500
- Accent: Font A Italic
```

Preset keys must be validated against the active template manifest.

---

## 7. Font Loading and Performance

Never load the entire Font Library on an invitation page.

Only load families/weights required by the active template and preset.

Prefer efficient delivery mechanisms appropriate to the selected source, such as framework font optimization/self-hosting where licensing permits.

Avoid loading unused weights.

Font loading must not cause severe layout shift or long blank text periods.

Test on realistic mobile network conditions during QA.

---

## 8. Typography Layout QA

Test typography with:

- short couple names;
- long Vietnamese names;
- uppercase Vietnamese names;
- multi-line guest display text;
- playful guest text;
- long venue names;
- long parent names;
- small mobile widths.

Do not solve overflow by making all text unreasonably small.

Each template should have responsive typography rules appropriate to its art direction.

---

## 9. Motion Architecture

Motion should use two layers:

```text
Shared Motion Primitives
        ↓
Template-Specific Effect Pack
        ↓
Effect Preset
```

### Shared primitives may include

- fade;
- reveal;
- slide;
- scale;
- mask reveal;
- text stagger;
- image reveal;
- parallax helper;
- floating decorative element;
- petal/particle system;
- opening transition;
- scroll-trigger helper.

A primitive is behavior infrastructure, not final art direction.

---

## 10. Template Effect Packs

Each template can compose shared primitives differently.

Examples:

### Elegant Editorial

- editorial text reveal;
- image mask reveal;
- restrained parallax;
- slow section fade.

### Vietnamese Heritage

- subtle ornamental reveal;
- gentle motif movement;
- refined traditional opening transition.

### Romantic Minimal

- soft fade;
- light floral/petal movement;
- gentle image reveal;
- subtle floating details.

Do not force every template to use the same animation sequence.

---

## 11. Effect Presets

Templates may expose a small curated intensity/preset set, for example:

- `NONE`
- `LIGHT`
- `STANDARD`
- `RICH`

Meaning is template-specific.

Example:

```text
Romantic Minimal / LIGHT
- fade + image reveal

Romantic Minimal / STANDARD
- fade + image reveal + subtle petals

Romantic Minimal / RICH
- richer reveal + petals + selected parallax
```

Do not expose dozens of independent toggles in V1 unless there is a strong design reason.

---

## 12. Opening Interaction

Templates may use a user-triggered “Open Invitation” interaction.

The interaction may be used to:

- create an emotional entrance;
- reveal personalized guest text;
- transition to Hero;
- start music after user gesture when browser policies allow.

Requirements:

- keyboard/touch accessible where relevant;
- never traps user;
- works without audio permission;
- fails gracefully;
- does not hide important information forever if motion fails.

---

## 13. Reduced Motion

Respect `prefers-reduced-motion` where applicable.

Reduced-motion mode should:

- remove unnecessary parallax;
- reduce large movement transitions;
- disable continuous decorative particle movement when appropriate;
- preserve content visibility and hierarchy.

A reduced-motion user must still receive a polished invitation, not a broken one.

---

## 14. Mobile Performance Rules

Motion must be evaluated on real-world mobile constraints.

Avoid:

- large continuous particle counts;
- unnecessary requestAnimationFrame loops;
- multiple concurrent parallax systems;
- animating expensive layout properties repeatedly;
- huge video/background assets without explicit design/performance approval;
- effects that keep GPU usage high when off-screen.

Pause/unmount effects when not needed.

The goal is emotional polish, not a graphics benchmark.

---

## 15. Motion and Interaction Safety

Effects must never:

- cover RSVP controls;
- intercept taps unexpectedly;
- make text unreadable;
- cause horizontal page drift;
- create motion that prevents form completion;
- delay basic content access excessively;
- rely on animation completion for critical data to become available.

---

## 16. Motion QA Matrix

For each active effect preset verify:

- initial page load;
- scroll up/down repeatedly;
- opening interaction;
- music control interaction;
- RSVP interaction;
- route refresh;
- long page content;
- mobile 360/390/430;
- desktop;
- reduced motion;
- no critical console/runtime warnings;
- acceptable frame smoothness in practical use.

---

## 17. Font/Effect Change Compatibility

Changing a Font Library entry or shared motion primitive can affect multiple templates.

Therefore:

- treat shared font/motion changes as regression-sensitive;
- identify all consumers;
- test all active affected template versions;
- do not alter old production template visual output unintentionally.

For major visual changes, create a new template version instead of modifying a production version in place.
