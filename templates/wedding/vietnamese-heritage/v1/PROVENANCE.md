# Vietnamese Heritage v1 — provenance

Renderer: `wedding.vietnamese-heritage.v1`. Contract and mapping:
`docs/DECISIONS.md` "VH-01 — Vietnamese Heritage v1 Production Contract".

## Shipped production decor (VH-01)

**None.** VH-01 ships no decor file. There is no
`public/renderers/wedding/vietnamese-heritage/` directory, and no renderer
module references a decor or prototype path. All VH-01 ornament is
renderer CSS (gold rules, borders) plus the Song Hỷ text mark in
`sections/song-hy.tsx`.

- **Source:** repository-authored renderer code and CSS (VH-01, Claude Code
  assistance, directed by the Product Owner's task brief).
- **Author / owner:** WeddingClick.
- **External sources:** none. No image, font file or stock asset is
  committed.
- **Rights basis:** original work authored in this repository.

The Song Hỷ mark is the Unicode character 囍 drawn with the device's own
CJK font. It is not deterministic across devices (the Elegant Editorial seal
precedent, P1-UX-03), so VH-02 replaces it with WeddingClick-owned vector
geometry.

## Fonts (`heritage-classic`)

Self-hosted at build time by `next/font/google`; no font file is committed
and nothing is fetched from a font CDN at runtime. `preload: false` keeps these
files off Elegant Editorial invitation routes; they download only when
Vietnamese Heritage text uses them.

| Family | Weights / styles requested | Subsets | Licence |
|---|---|---|---|
| Cormorant Garamond | 500, 600 × normal, italic | latin, vietnamese | SIL Open Font License 1.1 |
| Playfair Display | 500 italic | latin, vietnamese | SIL Open Font License 1.1 |
| Great Vibes | 400 normal | latin, vietnamese | SIL Open Font License 1.1 |

The `vietnamese` subset of each family is listed by the installed Next font
data. Real-device Vietnamese glyph QA (long names, uppercase diacritics) is a
certification step, not yet performed.

## Task 029 prototype decor — audit (VH-01)

**Source:** the ten Task 029 Vietnamese Heritage reference PNGs in the
Task 029 prototype decor directory (added by commit `0313181`, 2026-09-26),
listed below. Each file carries an OpenAI-signed C2PA content-credentials
manifest naming the claim generator "ChatGPT" / `gpt-image`, digital source
type `trainedAlgorithmicMedia`, created 2026-09-24 (UTC times below).

**Author / owner:** generated with OpenAI image generation through ChatGPT
for the WeddingClick prototype. Who directed the generation is not recorded
in the repository.

**Rights basis:** **not established for this renderer.** The Product Owner
decision of 2026-10-01 authorizing approved Task 029 prototype assets in
production is recorded only for Elegant Editorial v1 (its PROVENANCE.md,
"Allowed production use: `wedding.elegant-editorial.v1`"). No repository
document extends it to Vietnamese Heritage. Under RF-06-0 P4/P5 these files
therefore stay art-direction references only and are **not** copied into
production.

**BLOCKER for VH-02:** before VH-02 can ship the approved art direction, the
Product Owner must either (a) record that the 2026-10-01 ruling covers these
Vietnamese Heritage files (then VH-02 makes size-optimized 2× WebP copies of
the exact pixels with the Elegant Editorial pipeline and records them here),
or (b) commission WeddingClick-owned replacement artwork.

| File | Task 029 role | Pixels | Bytes | Source SHA-256 | C2PA created (UTC) | Used by prototype | VH-01 decision |
|---|---|---|---|---|---|---|---|
| `heritage-border-left.png` | Cover/page left border end caps | 724×2172 | 701572 | `b9997fbda5c9ec032bf828484343b7e29206c9659fd0dd02bf48f3077c58bbbb` | 2026-09-24 06:48:46 | yes | not shipped; VH-02 blocker |
| `heritage-border-right.png` | Cover/page right border end caps | 724×2172 | 648935 | `8caa2b2bc290a80e90cb5b7e2285d7847151020abfb4e3007d3eac0f61939a2e` | 2026-09-24 06:48:49 | yes | not shipped; VH-02 blocker |
| `heritage-corner-ornament.png` | none (unused) | 1254×1254 | 623668 | `ca090a7ffb54594705a8bfa51450ec2d45a7ae4f2caf18e6fda5bb93a67ae1fb` | 2026-09-24 06:43:20 | no | not needed |
| `heritage-double-happiness-medallion.png` | Cover medallion, hero seal | 1254×1254 | 2743439 | `dcfd787cc224bed4a91965f4c051e777a7bb18ef475b05e25e48ebfa604bd7c1` | 2026-09-24 06:43:28 | yes | not shipped; VH-02 blocker |
| `heritage-floral-bottom-right.png` | Cover/hero corner floral | 1254×1254 | 1665998 | `1b96673b6936af74974b094ccf5ffd0637e6cb224768b32c05b298a5f2441614` | 2026-09-24 06:43:21 | yes | not shipped; VH-02 blocker |
| `heritage-floral-top-left.png` | Cover/hero corner floral | 1254×1254 | 1808224 | `dcc56ca65ceab5409edee720141ce98cff6ff2c28fe8babd996d3221be9b337d` | 2026-09-24 06:43:26 | yes | not shipped; VH-02 blocker |
| `heritage-gold-divider.png` | Cover/hero/rite/RSVP divider | 2172×724 | 367426 | `e50ce4103943b38d3123ee5abfbd1b73f91df7935ee97d36571fad9992412c47` | 2026-09-24 06:42:49 | yes | not shipped; VH-02 blocker |
| `heritage-lantern.png` | none (unused) | 1024×1536 | 2072265 | `2174c6e62c1afb83f7885ff81d97f95e4d845ddc9a38fb3c627481466f0997df` | 2026-09-24 06:43:08 | no | not needed |
| `heritage-paper-ivory.png` | Ivory paper texture (hero, pages) | 1254×1254 | 2363572 | `7285e242ed21427d8057e572f1552103db4455cc8e415710aca42ea33e9ee678` | 2026-09-24 06:42:56 | yes | not shipped; VH-02 blocker |
| `heritage-paper-red.png` | Red door paper texture | 1254×1254 | 2883051 | `8d0acc96fbb357d934daee0144fe37bd17f3e8a04743977ed7e2d883e2be5001` | 2026-09-24 06:42:47 | yes | not shipped; VH-02 blocker |

The eight used files total about 13.1 MB as raw PNGs; they are never a
production payload. Any VH-02 production copy must meet P6 (raster at most
2× its largest rendered CSS size, WebP, no metadata chunks, about 1 MB decor
budget) under `public/renderers/wedding/vietnamese-heritage/v1/`.
