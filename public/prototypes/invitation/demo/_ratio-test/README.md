# Ratio test fixtures — internal prototype only

**Test-only. Not approved assets, not customer content, never shipped.**

Eight generated SVG panels used to exercise the Se Duyên P0-2 supplied-photo
path (`projectPhotos`) in the internal prototype harness at
`/internal/prototypes/invitation`. They are deliberately not photography: flat
slate panels with a 10% grid, a dashed safe-area inset, gilt corner brackets
and TOP / BOTTOM / LEFT / RIGHT edge labels, so a crop, a focal-point shift or
a background gap inside a frame is visible at a glance.

| File | Ratio | Pixels |
|---|---|---|
| `f1-2x3.svg` | 2:3 portrait | 800×1200 |
| `f2-3x4.svg` | 3:4 portrait | 900×1200 |
| `f3-2x3.svg` | 2:3 portrait | 800×1200 |
| `f4-1x1.svg` | 1:1 square | 1000×1000 |
| `f5-1x1.svg` | 1:1 square | 1000×1000 |
| `f6-4x3.svg` | 4:3 landscape | 1200×900 |
| `f7-3x2.svg` | 3:2 landscape | 1200×800 |
| `f8-16x9.svg` | 16:9 landscape | 1280×720 |

Order matters: it is chosen so the shared orientation-aware
`assignPhotosToSlots` fills all eight Se Duyên frames and every one of the six
ratios lands in a frame.

Reachable only from the internal prototype review page's photo-source control.
No production route, renderer, Snapshot or ViewModel references them.
