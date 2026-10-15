# Vietnamese Heritage v2 — provenance

Renderer: `wedding.vietnamese-heritage.v2`. Contract and mapping:
`docs/DECISIONS.md` "VH-01 — Vietnamese Heritage v1 Production Contract"
(unchanged) and "VH-V2-01 — Vietnamese Heritage v2".

## Decor: reused by reference, never copied

v2 ships **no decor files of its own**. `sections/decor.tsx` names exactly
the same eight WebP derivatives as v1, at their existing immutable paths
under `public/renderers/wedding/vietnamese-heritage/v1/`. Those files are
byte-identical to the v1 record; their sources, pixels, bytes, SHA-256
hashes, conversion facts and rights basis are recorded only in
`templates/wedding/vietnamese-heritage/v1/PROVENANCE.md`, which stays the
single source of truth. No file under that directory is added, removed or
changed by v2, so every published v1 invitation keeps its exact assets.

**Rights basis:** the Product Owner authorized production use of these eight
Task 029 assets for `wedding.vietnamese-heritage.v1` (VH-02A ruling D1,
2026-10-08). v2 is the same template family with the Product Owner-requested
gift wording, typography and motion (LAUNCH-P0-04, 2026-10-13); it reuses the
assets on that basis. **Pending:** explicit Product Owner confirmation that
the D1 authorization extends to `wedding.vietnamese-heritage.v2` is required
before v2 is seeded in any catalog or released.

**Allowed production use:** `wedding.vietnamese-heritage.v2`, subject to the
pending confirmation above.

Not used: `heritage-lantern.png`, `heritage-corner-ornament.png` (not approved).
