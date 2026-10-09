# Romantic Minimal v1 — decor provenance

Provenance note for `wedding.romantic-minimal.v1` (docs/DECISIONS.md "RM-01"
and "RM-02"). This note records factual source history and the Product Owner
production-use decisions. It makes no legal conclusion about copyright
ownership.

Version path: `public/renderers/wedding/romantic-minimal/v1/` (immutable once
used by a published invitation, P6 / CLAUDE.md §9). `sections/decor.tsx` is the
only module that names these files, each by exact literal path.

## Common record

- **Source:** the approved Task 029 Romantic Minimal files from the Task 029
  prototype decor directory (commit
  `03131816d7966ccd9fad0e135df37bd65af7ee99`), as layered by the Task 029
  Romantic Minimal direction.
- **Product Owner decision (RM-02):** commercial production use of **all
  nine** Romantic Minimal decor files is approved. The original eight files
  were approved first. `romantic-paper-blush.png` and its optimized
  `paper-blush.webp` derivative were confirmed separately (2026-10-09).
- **Derived from Task 029 prototype pixels:** **YES.** No redraw, recolour,
  crop, retouch or other pixel edit. The SVG is byte-identical to its source.
  Each WebP is a size-optimized copy of its source PNG, and the aspect ratio
  is unchanged. The size-optimization choice follows the 2026-10-01 ruling
  recorded for Elegant Editorial.
- **Final files:** the WebPs carry only the `VP8X`/`ALPH`/`VP8 ` chunks (no
  EXIF, XMP, ICC or C2PA). The exact encoder settings were not recorded
  before the RM-02 session interruption. The table below records only facts
  that can be verified from the files.
- **Allowed production use:** `wedding.romantic-minimal.v1` public invitation
  rendering.
- **Personal / customer data:** none; no people, text, logo or project data.

Not shipped: `romantic-envelope-closed.png` and `romantic-envelope-flap.png`.
The approved direction does not reference them.

## Files

| File | Bytes | SHA-256 | Source PNG / SVG | Source SHA-256 | Source → final |
|---|---|---|---|---|---|
| `architecture-sketch.svg` | 10055 | `8014d68703690be7b08c2c358ba203a2a1c182d86d6a98c8bc1fbc86928d7e52` | `romantic-architecture-sketch.svg` | `8014d68703690be7b08c2c358ba203a2a1c182d86d6a98c8bc1fbc86928d7e52` | byte-identical |
| `divider.webp` | 13796 | `147bc20f0f4a424cfb2ecc7c9f64af0867a8ec4763d3b3bd3a6fc5ec0a05f5f7` | `romantic-divider.png` | `a46ce0cdf62adb77e1df7a76ab66e228fef783120fd22f31c8fe5d2e294273e0` | 2172×724 → 440×147 |
| `envelope-back.webp` | 64882 | `20115a67147ed4d0e4f556d2bcc257e385268c9bd24c55277d75d5e200a3669e` | `romantic-envelope-back.png` | `53ed61add0c6b4dac6626d2b21f38abb3b958570792f85ea4f88948d662a4de9` | 1448×1086 → 972×729 |
| `envelope-pocket.webp` | 47982 | `654faccdeafc34ab0b241f8769edfefe0ae0d24c790581c7bbe9f0d5862fcb95` | `romantic-envelope-pocket.png` | `5e554a34023b7fb71a5d402e0c453963fe0c67066a26ad8b156d3d416741f81d` | 1448×1086 → 874×655 |
| `envelope-seal.webp` | 8846 | `97c44a734e6883d471c8b029ce4ee37a1ecec53c6cdd470742b400083ae6bfef` | `romantic-envelope-seal.png` | `76dfb4320cedefbf3d9c56e41be2a9ea56384d7519da02bc96bd8418b27c91f5` | 1254×1254 → 144×144 |
| `floral-bottom-right.webp` | 132980 | `ac454608629aac7afa4bb10adbcac1f8dd4fd9f469a1543645f328b3db28910c` | `romantic-floral-bottom-right.png` | `6679656e27aafec95f3a585a3565541ce6c293de59a0c15d10b1955f4af66f16` | 1254×1254 → 700×700 |
| `floral-top-left.webp` | 89458 | `d6b211a7ee82deb174fd98a39499efd63e4833d24dfcfd056a004b7569e7cafd` | `romantic-floral-top-left.png` | `aefbf8aab22044da5be854ce32add2dc9d8eb696fc988ed1e7afe8f40d82dd3a` | 1254×1254 → 500×500 |
| `heart-burst.webp` | 50542 | `09d507881cb2c988c5f1e6278230a4bd78080c0ef39c427d0a8c7002f72fcf9e` | `romantic-heart-burst.png` | `06473fda6eab9d5039d9f4350975da2d025de78eaca4997788e78e88091f7d5d` | 1448×1086 → 380×285 |
| `paper-blush.webp` | 85526 | `b6f37f1f4547bcd0760852bef1c12e9c3fcc347890ffeca878915bbbb9ff9370` | `romantic-paper-blush.png` | `c79d62637eac0243096d479bc9fca7e08ce76d495c0a284f49f64d28d834bf5b` | 1254×1254 → 1254×1254 (re-encode only; opaque) |

The source files stay in the prototype tree only. They are not part of the
production payload.

## Inline vector motifs

`sections/identity.tsx` (the leaf ornament under the couple) and
`sections/calendar.tsx` (the ceremony-day heart) render inline SVG paths
copied verbatim from the approved Task 029 Romantic Minimal direction
(`viewBox="0 0 220 20"` and `viewBox="0 0 32 29"`). They contain no external
asset, font glyph or clip art.
