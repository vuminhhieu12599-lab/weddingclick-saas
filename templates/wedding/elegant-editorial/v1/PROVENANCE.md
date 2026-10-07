# Elegant Editorial v1 — decor provenance

Provenance note required by docs/DECISIONS.md "RF-06-0 First Production
Renderer Contract Clarification" P4–P6.

## Legacy inline decor (replaced)

Integration status (factual maintenance, RF-06B visual remediation): the
inline motifs below were the rendered decor of the original RF-06B renderer.
They are replaced in the renderer by the Design Baseline A1 file-backed set
further down and are no longer rendered. Their creation record is unchanged.

| Artwork | Location | Form |
|---|---|---|
| Leaf sprig | `sections/decor.tsx` `LeafSprig` | inline SVG: one cubic curve, five ellipses, one circle |
| Ornament divider | `sections/decor.tsx` `OrnamentDivider` | two mirrored leaf sprigs around a square rotated into a lozenge |
| Corner bouquet | `sections/decor.tsx` `CornerBouquet` | inline SVG: three cubic curves, four ellipses, six circles |
| Envelope | `sections/decor.tsx` `EnvelopeMotif` | inline SVG: rectangle, fold lines, flap triangle, seal circles, two ellipses |
| Heart | `sections/decor.tsx` `HeartMark` | inline SVG: one closed cubic path |

Palette gradients and surface patterns are CSS in
`elegant-editorial-v1.module.css`.

The renderer now loads the Design Baseline A1 decor set below from
`public/renderers/wedding/elegant-editorial/v1/`, by exact literal path.

## Record

- **Source:** created in-repo for WeddingClick in RF-06B with Claude Code
  (Anthropic) assistance (commit `6e558a0` carries a Claude co-author
  trailer), as repository-authored inline SVG geometry in the files listed
  above.
- **Author / owner:** produced for WeddingClick in this repository. No
  further ownership claim is made here.
- **External sources:** none. No external asset, icon set, font glyph or
  clip art was used.
- **Task 029 prototype:** the Task 029 Green Ivory Editorial images were
  used only as a visual reference for mood and palette. No prototype image
  was copied, traced, embedded or referenced, and no prototype asset path
  is used by v1.
- **Rights basis:** original work authored in this repository. This note
  records provenance only and makes no further legal claim.
- **Payload:** inline SVG markup inside the renderer bundle. No separate
  decor download.

## Design Baseline A1 production decor set (asset checkpoint, 2026-09-30)

Created for docs/DECISIONS.md "Elegant Editorial Production Design Baseline"
Design Baseline A1 (remediation sequence B9 step 4), against the Design
Baseline frozen at `f4e76a2`. The visual reference for every file is the
Task 029 `GreenIvoryEditorialPrototype` (commit `0313181`). Integration
status: all eleven files are referenced by the renderer (RF-06B visual
remediation); the inline SVG decor above is no longer rendered.

Version path: `public/renderers/wedding/elegant-editorial/v1/` (immutable
once used by a published invitation, P6 / CLAUDE.md §9).

This note records factual creation history and the production-use decision.
It makes no legal conclusion about copyright ownership.

### Vector assets (SVG)

Common record:

- **Source:** created in-repository with Claude Code (Anthropic) assistance
  for the WeddingClick project on 2026-09-30, following the frozen Elegant
  Editorial Design Baseline, and directed and reviewed through the Product
  Owner's asset-checkpoint instructions.
- **Method:** AI-assisted, repository-authored SVG source: straight lines,
  quadratic and cubic curves, rectangles and circles, SVG gradients and an
  `feTurbulence` paper-grain filter, written specifically for this renderer.
  The wax-seal outline is a closed polygon computed from a sum of sine terms
  by a one-off script; the script is not in the repository and the resulting
  coordinates are in the file. These files were not drawn by hand solely by a
  human.
- **Author / owner:** produced for WeddingClick in this repository (see
  Source). No further ownership claim is made here.
- **External sources:** none. No external asset, image generator, icon set,
  clip art or stock image was used. No font glyph was used: the 囍 mark, ❧
  fleuron, ✦ sparkle and ♥ heart are vector paths.
- **Derived from Task 029 prototype pixels:** **NO.** The prototype decor
  PNGs were viewed only as a visual reference for composition, proportion
  and palette. No prototype image was copied, traced, sampled, embedded or
  referenced.
- **Rights basis:** original artwork created in this repository for
  WeddingClick. Recorded as provenance only.
- **Allowed production use:** WeddingClick Elegant Editorial v1
  (`wedding.elegant-editorial.v1`) public invitation rendering.
- **Personal / customer data:** none.

| File | Purpose | Form |
|---|---|---|
| `opening-envelope-body.svg` | Opening envelope pocket: moss body, ivory liner frame and corners, moss side folds, gold rules. Canvas 300×200; hinge line y 13, pocket opening y 45. | SVG, transparent outside the body |
| `opening-envelope-flap.svg` | Hinged moss flap (outer face) with gold edge. Canvas 300×150, hinge at the top edge, rounded tip at (150, 130) for the seal. | SVG, transparent outside the flap |
| `opening-envelope-liner.svg` | Inner face of the flap for the opening reveal: ivory sheet, moss border, gold inset rule. Same canvas and outline as the flap. | SVG, transparent outside the flap |
| `opening-seal-double-happiness.svg` | Warm-gold wax seal with a raised ring and an engraved 囍 mark drawn as vector strokes. | SVG, transparent outside the seal |
| `opening-cover-card-frame.svg` | 3:4 ivory frame with gold hairlines for the rising cover card. The photo window (x 7–233, y 7–313 of 240×320) is transparent; the runtime `media.cover` image sits beneath it. | SVG |
| `ornament-fleuron.svg` | Floral-heart ornament for the ❧ role (Families rule ornament, Closing). Default moss; single-colour, so usable as a CSS mask. | SVG |
| `ornament-sparkle.svg` | Four-point ornament for the ✦ role (Events → Countdown transition). Default gold; usable as a CSS mask. | SVG |
| `calendar-heart.svg` | Ceremony-day heart for the ♥ role. Default `#d0433a`; static (the pulse is renderer CSS, RF-06D); usable as a CSS mask. | SVG |

### Botanical raster assets (WebP)

Common record:

- **Source:** created specifically for the WeddingClick project using OpenAI
  image generation through ChatGPT, directed by the Product Owner, on
  2026-09-30, and placed in the repository by the Product Owner.
- **Supporting evidence:** each supplied source PNG carried an OpenAI-signed
  C2PA content-credentials manifest naming the claim generator
  "ChatGPT" / `gpt-image`, digital source type
  `trainedAlgorithmicMedia`, a `c2pa.created` action dated 2026-09-30
  (≈05:19–05:20 UTC) and a `c2pa.watermarked.unbound` assertion (an
  invisible watermark declaration; there is no visible watermark).
- **Author / owner:** generated for WeddingClick as described in Source. No
  further ownership claim is made here.
- **External stock / clip-art source:** no known external stock asset was
  supplied or intentionally incorporated by the project workflow.
- **Derived from Task 029 prototype pixels:** **NO.** The supplied files are
  byte-different from the prototype PNGs, and only about 0.1–0.2% of pixels
  visible in both match (coincidental). The Task 029 decor was a visual
  reference only.
- **Rights basis:** Product Owner decision to use these OpenAI-generated
  images, created for this project, in production. This note records
  provenance and that decision only.
- **Processing in the repository:** alpha values ≤ 8 (invisible haze) set to
  0; premultiplied Lanczos downscale to 2× the Task 029 maximum rendered CSS
  size (P6); colour under fully transparent pixels zeroed; encoded as lossy
  WebP (quality 92) with lossless alpha. The final files carry no EXIF, XMP,
  ICC or C2PA chunks. Composition and aspect ratio are unchanged (no crop).
- **Allowed production use:** WeddingClick Elegant Editorial v1
  (`wedding.elegant-editorial.v1`) public invitation rendering.
- **Personal / customer data:** none; no people, text, logo or project data.

| File | Purpose | Source PNG (SHA-256) | Source → final | Max CSS size (Task 029) |
|---|---|---|---|---|
| `calendar-botanical-top-left.webp` | Calendar card top-left bouquet: floral mass anchored top-left, greenery trailing right and down | `fffbe4115b1998db355378fb2cee9579c8bab3ffe9086463a27c22e857e860df` | 1254×1254 → 256×256 | 128×128 px (2×) |
| `calendar-botanical-bottom-right.webp` | Calendar card bottom-right bouquet: distinct composition anchored bottom-right, greenery trailing left and up | `53b144f4ad539dd1767130d2434ff5b8ff940ce62ece73b8f0fcbb916e6f8179` | 1254×1254 → 256×256 | 128×128 px (2×) |
| `couple-floral-divider.webp` | Couple / story horizontal floral divider (3:1 spray) | `74cecc5efe79246f5c4b4fff830be2d893695ae0875d0e3b69afa842d3ad135c` | 2172×724 → 600×200 | 300×100 px (2×) |

The source PNGs are not part of the production payload and are not kept in
the repository.

## Approved Task029 opening envelope rasters (Micro-Checkpoint 1B, 2026-10-01)

Common record:

- **Source:** the Product Owner-approved Task 029 prototype envelope assets
  `envelope-body.png`, `envelope-flap.png` and `envelope-seal.png` from the
  Task 029 prototype decor directory (commit
  `03131816d7966ccd9fad0e135df37bd65af7ee99`), as layered by
  `GreenIvoryEditorialPrototype`.
- **Product Owner decision (2026-10-01):** the exact approved prototype /
  design assets are authorized for production use. To stay within P6, the
  Product Owner chose size-optimized copies of those exact pixels over
  byte-identical copies (≈6.2 MB of source PNGs).
- **Derived from Task 029 prototype pixels:** **YES.** Each file is the
  approved source PNG, downscaled only. No redraw, recolour, crop, retouch
  or other pixel edit.
- **Processing in the repository:** the same pipeline as the botanical
  rasters above: alpha values ≤ 8 set to 0; premultiplied Lanczos downscale
  to 2× the largest Task 029 rendered CSS size (P6; envelope box at most
  300×200 CSS px); colour under fully transparent pixels zeroed; lossy WebP
  (quality 92) with lossless alpha. The final files carry no EXIF, XMP or
  ICC chunks. Aspect ratio is unchanged.
- **Allowed production use:** WeddingClick Elegant Editorial v1
  (`wedding.elegant-editorial.v1`) public invitation rendering.
- **Personal / customer data:** none; no people, text, logo or project data.
- The engraved 囍 on the seal is not in any of these files; the approved
  blank seal raster below is unchanged. Since the P1-UX-03 follow-up
  (2026-10-07) `sections/decor.tsx` draws it as repository-authored vector
  stroke geometry, reusing the mark from the already tracked
  `opening-seal-double-happiness.svg`. It replaces the earlier system-font
  text so its placement on the seal is deterministic across devices (the
  font-dependent glyph sat off-centre on iOS).

| File | Purpose | Source PNG (SHA-256) | Source → final | Max CSS size (Task 029) |
|---|---|---|---|---|
| `opening-envelope-body.webp` | Opening envelope body (pocket), full 3:2 canvas | `f10cb9d92b47d67c7924be33ee71122f37fca3f54b9f1d5faabb42656b469cd6` | 1536×1024 → 600×400 | 300×200 px (2×) |
| `opening-envelope-flap.webp` | Hinged envelope flap, same 3:2 canvas, rendered at 95.89% with the Task 029 offset | `d75b9c720574d14198544431a0ad89d627e7255afd2d00937f8274d36d3c51da` | 1536×1024 → 570×380 | 287.67×191.78 px (≈1.98×) |
| `opening-envelope-seal.webp` | Gold wax seal (blank disc) on the flap tip | `c0e8e6d3d4a9dbaeeea1fc06df862b8e09e59582b5952a2d6fbcc48bf0ce54e2` | 1254×1254 → 132×132 | 66×66 px (2×) |

The source PNGs stay in the prototype tree only; they are not part of the
production payload. Since this checkpoint the renderer no longer references
`opening-envelope-body.svg`, `opening-envelope-flap.svg`,
`opening-envelope-liner.svg` or `opening-seal-double-happiness.svg`; those
files are kept unchanged as tracked legacy production assets.

## Approved Task029 calendar bouquets and couple divider (Micro-Checkpoint 4, 2026-10-01)

Common record:

- **Source:** `calendar-flower-top-left.png`, `calendar-flower-bottom-right.png`
  and `portrait-divider-floral-strip.png` from the Task 029 prototype decor
  directory (commit `03131816d7966ccd9fad0e135df37bd65af7ee99`), as used by
  `GreenIvoryEditorialPrototype`.
- **Product Owner decision (2026-10-01):** approved prototype / design assets
  are authorized for production use; size-optimized copies are allowed when
  the visual intent is unchanged (same record as the envelope rasters above).
- **Derived from Task 029 prototype pixels:** **YES.** Each file is the
  approved source PNG, downscaled only. No redraw, recolour, crop, retouch
  or other pixel edit.
- **Processing in the repository:** the same pipeline as the envelope
  rasters above (alpha ≤ 8 set to 0; premultiplied Lanczos downscale to 2×
  the largest Task 029 rendered CSS size; colour under fully transparent
  pixels zeroed; lossy WebP quality 92 with lossless alpha; no EXIF, XMP or
  ICC chunks). Aspect ratio is unchanged.
- **Allowed production use:** WeddingClick Elegant Editorial v1
  (`wedding.elegant-editorial.v1`) public invitation rendering.
- **Personal / customer data:** none; no people, text, logo or project data.

| File | Purpose | Source PNG (SHA-256) | Source → final | Max CSS size (Task 029) |
|---|---|---|---|---|
| `calendar-flower-top-left.webp` | Calendar card top-left bouquet (Task 029 `calendarFlowerTopLeft`) | `cebe0e41406d7a5119bb15275d4f54886972a862651633c89239753924de397e` | 1254×1254 → 256×256 | 128×128 px (2×) |
| `calendar-flower-bottom-right.webp` | Calendar card bottom-right bouquet (Task 029 `calendarFlowerBottomRight`) | `370517c01fe04f50d9a24036cb1fdcd63347e1e75630dbb588635e08be2cb001` | 1254×1254 → 256×256 | 128×128 px (2×) |
| `portrait-divider-floral-strip.webp` | Couple / story floral strip (Task 029 `portraitDivider`) | `4491d1df6fa2ef66d7f526fab1ea774da7c369fe29111273f1b1ad7ceb3ab283` | 2172×724 → 600×200 | 300×100 px (2×) |

Since this checkpoint the renderer no longer references
`calendar-botanical-top-left.webp`, `calendar-botanical-bottom-right.webp` or
`couple-floral-divider.webp`; those files are kept unchanged as tracked
legacy production assets.
