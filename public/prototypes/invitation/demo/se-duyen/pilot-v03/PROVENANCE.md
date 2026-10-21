# Se Duyên — Pilot v03 opening layers, P6 derived WebP copies

## Rights

**Product Owner authorization, 2026-10-20.** The Product Owner explicitly
authorizes **public and commercial use** of the Se Duyên AI-generated
decorative assets in WeddingClick: the lacquer background, the wedding box,
the lid and the related ornaments. The originals carry OpenAI C2PA manifests
(`gpt-image`, `trainedAlgorithmicMedia`); this authorization covers that
provenance and clears the set for production use.

This authorization is scoped to the Se Duyên decorative assets. It does **not**
extend to unrelated third-party media, which keeps its own rights position —
the interior photography under `../interior/` is approved fictional showroom
demo photography covered by its own separate Product Owner approval, and
nothing here changes that.

## Why these exist

The three PNG layers the opening loads totalled **5.02 MB**, and they are the
first bytes a guest downloads — before the invitation has any content. That
breaks `docs/DECISIONS.md` **P6** (raster in a web-efficient format, within an
≈1 MB decor payload) by roughly 5×. These are size-optimized derived copies of
the **exact approved pixels**. Nothing was redrawn, re-composed or re-cropped.

## Derivation

Pillow 12.1.1 (already in the toolchain; no dependency was added). Per layer:

- **No resize and no crop.** The lid and the base keep their shared
  1448×1086 canvas, so the single measured vertical offset the opening is
  built on (`--sdp-lid-seat: -19.1%`, a percentage and therefore
  scale-invariant) registers exactly as before.
- Near-transparent fringe cleaned: `alpha <= 8 -> 0`.
- WebP `quality=92`, `method=6`, `alpha_quality=100` (lossless alpha),
  `exact=True` so colour under transparent pixels is preserved rather than
  rewritten.
- No metadata carried over.

## Files

| Derived file | Source PNG | Canvas | Mode | Before | After | Saving |
|---|---|---|---|---|---|---|
| `bg-red-lacquer.webp` | `bg-red-lacquer.png` | 941×1672 | RGB | 2278 KB | 275 KB | 87.9% |
| `box-open-base.webp` | `box-open-base.png` | 1448×1086 | RGBA | 1654 KB | 241 KB | 85.4% |
| `box-lid.webp` | `box-lid.png` | 1448×1086 | RGBA | 1205 KB | 201 KB | 83.3% |
| **Total** | | | | **5.02 MB** | **0.70 MB** | **86.0%** |

`box-closed.png` is not derived: this direction does not use it (see
`se-duyen-pilot.tsx` — it is a different render and cannot be lifted apart).

## Hashes

Source PNGs (unchanged on disk, and matching the values in `README.txt`):

```
bg-red-lacquer.png   f1f0314bcf02fee65580c9de2956f759c3c7b70c0c3bb93a67e461a444465efe
box-open-base.png    4bfca0c990ba1059be89d066f96d61faeace8318d56cdf65d17f1d3ec2c8428c
box-lid.png          04a41a1c6486f1b55900bb14bff693084692c252dc6ded010481f8cd1fea0095
```

Derived WebP:

```
bg-red-lacquer.webp  49e07c177d89681fe7a4378d2f255fa14b51de2af34e82ca972afa1c9d4edb4e
box-open-base.webp   ce3b7c181d69dcbf310ca3d73386b92585297a8c932c512d2fd7746d6e70cb90
box-lid.webp         3a79c0b670c0e4daab4d45fddfe6279fe38ef226a7d1ff34469bedd711821dc4
```

## Verification

- Canvas size and colour mode identical to the source for all three layers.
- Opaque-area alpha bounding boxes identical, so lid/base registration is
  unchanged: base `(47, 301, 1403, 939)`, lid `(31, 259, 1417, 845)`.
- Visible-pixel colour deviation from the source: mean 1.61 / 2.36 / 2.86 of
  255 (≈1%); the isolated maxima sit on single high-frequency gold-filigree
  edge pixels. The box layers render at about 334 CSS px wide — roughly 23% of
  native — so those edges are downsampled well below visibility.
- No C2PA or other metadata present in the derived files.

The original PNGs are retained in this directory and are not referenced by
any renderer or direction.

`box-closed.png` is covered by the same 2026-10-20 authorization even though
this direction does not use it.
