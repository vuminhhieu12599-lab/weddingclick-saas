# Elegant Editorial v1 — decor provenance

Provenance note required by docs/DECISIONS.md "RF-06-0 First Production
Renderer Contract Clarification" P4–P6.

## Production decor in v1

| Artwork | Location | Form |
|---|---|---|
| Leaf sprig | `sections/decor.tsx` `LeafSprig` | inline SVG: one cubic curve, five ellipses, one circle |
| Ornament divider | `sections/decor.tsx` `OrnamentDivider` | two mirrored leaf sprigs around a square rotated into a lozenge |
| Corner bouquet | `sections/decor.tsx` `CornerBouquet` | inline SVG: three cubic curves, four ellipses, six circles |
| Envelope | `sections/decor.tsx` `EnvelopeMotif` | inline SVG: rectangle, fold lines, flap triangle, seal circles, two ellipses |
| Heart | `sections/decor.tsx` `HeartMark` | inline SVG: one closed cubic path |

Palette gradients and surface patterns are CSS in
`elegant-editorial-v1.module.css`.

v1 ships no image files. `public/renderers/wedding/elegant-editorial/v1/` is
not created, and v1 does not load any raster decor.

## Record

- **Source:** created in-repo for WeddingClick in RF-06B, as hand-written
  SVG geometry in the files listed above.
- **Author / owner:** WeddingClick (authored in this repository).
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
