# Vietnamese Heritage v1 — provenance

Renderer: `wedding.vietnamese-heritage.v1`. Contract and mapping:
`docs/DECISIONS.md` "VH-01 — Vietnamese Heritage v1 Production Contract".

## Shipped production decor (VH-02A)

Eight size-optimized WebP derivatives of eight Task 029 Vietnamese Heritage
PNGs, under `public/renderers/wedding/vietnamese-heritage/v1/`. They are
named only in `sections/decor.tsx` (exact literal paths; the two paper
textures as renderer-scoped custom properties). No renderer module, CSS rule
or runtime path references the prototype directory.

**Authorization:** the Product Owner explicitly authorized production use of
exactly these eight Task 029 Vietnamese Heritage prototype assets for
`wedding.vietnamese-heritage.v1` only (VH-02A task brief, 2026-10-08;
docs/DECISIONS.md "VH-02A …" ruling D1). This resolves the VH-01 blocker
recorded below. The authorization is renderer-specific: it does not extend
to any other renderer or version, nor to `heritage-lantern.png` or
`heritage-corner-ornament.png`, which are not approved and not shipped.

**Allowed production use:** `wedding.vietnamese-heritage.v1`.

| Production file | Source PNG | Pixels | Bytes | Production SHA-256 | Chunks |
|---|---|---|---|---|---|
| `paper-red.webp` | `heritage-paper-red.png` | 1240×1240 | 213462 | `b4cd7fadfb18591642a72fe69eb092abf60f7feb277ee45998e66248ed7da6ae` | `VP8 ` |
| `paper-ivory.webp` | `heritage-paper-ivory.png` | 1240×1240 | 114682 | `e31423f371220e3e6d582f8aef25cb48680ee5af83bc8cf99d7fdd65cc1cc169` | `VP8 ` |
| `border-left.webp` | `heritage-border-left.png` | 360×1080 | 74858 | `a26f8fa974cc947c18fee29a075aafd8fa32daa33cfd01b97ed15245278d6084` | `VP8X`, `ALPH`, `VP8 ` |
| `border-right.webp` | `heritage-border-right.png` | 360×1080 | 72254 | `da6324c5a268a9d6c63b6b35439b6dd476a331ae1feef230d54c4d938c61b026` | `VP8X`, `ALPH`, `VP8 ` |
| `medallion-double-happiness.webp` | `heritage-double-happiness-medallion.png` | 372×372 | 63136 | `33bf8e12a72682b6910c73006b563e77d9488b2943c19a31afcf22347571adc0` | `VP8X`, `ALPH`, `VP8 ` |
| `floral-top-left.webp` | `heritage-floral-top-left.png` | 200×200 | 25242 | `b83ddaf0f57a5e9b6d4eeaa13b7ed2bc210a1b09f349014fad28542f02442fef` | `VP8X`, `ALPH`, `VP8 ` |
| `floral-bottom-right.webp` | `heritage-floral-bottom-right.png` | 200×200 | 23840 | `0f3a1cc1b35a37b721fc5b6886ea215db887498e8b29863d8d6f25bdb8830921` | `VP8X`, `ALPH`, `VP8 ` |
| `gold-divider.webp` | `heritage-gold-divider.png` | 225×75 | 4908 | `04ce59d4570cdb98f8c8378dc5317e9a4091aaf6c85adf35a2e7893d92fbc07d` | `VP8X`, `ALPH`, `VP8 ` |

Total: **592382 bytes** (about 0.56 MiB), within the RF-06-0 P6 decor budget
of about 1 MB. Source pixels, bytes and SHA-256 are in the audit table
below; every source hash was recomputed from the files on disk at VH-02A and
matches the VH-01 record.

**What is proven (recomputed at VH-02A from the files themselves):**

- every file is a RIFF/WebP container; the two papers are opaque lossy
  WebP (`VP8 ` only), the six ornaments lossy WebP with a separate `ALPH`
  chunk; no `EXIF`, `XMP ` or `ICCP` chunk is present in any file;
- dimensions and bytes are exactly as tabled;
- each derivative is the same artwork as its source: the source
  Lanczos-downscaled to the derivative size and composited on black differs
  from the composited derivative by a mean of 0.1–4.6 / 255 per channel, and
  the alpha channels by at most 0.1 / 255 (consistent with resizing plus
  lossy compression; no redraw, crop or recolour). The papers are full-frame
  downscales (1254 → 1240), not crops.

**Not recoverable:** the exact conversion tool, quality and alpha settings
used when these derivatives were made during the earlier VH-02A session are
not recorded anywhere in the repository or session scratch space. They are
not asserted here. The intended pipeline was the Elegant Editorial one
(its PROVENANCE.md: premultiplied Lanczos downscale, lossy WebP with alpha,
no metadata), but only the properties above are verified.

- **Source:** the Task 029 Vietnamese Heritage prototype decor directory
  (`invitation/decor/vietnamese-heritage/` in the prototype public assets,
  commit `0313181`), PNGs listed in the audit table.
- **Author / owner:** see the audit below (OpenAI image generation through
  ChatGPT for the WeddingClick prototype).
- **Rights basis:** Product Owner authorization for this renderer only
  (above).

### Repository-authored vector marks

Generic Song Hỷ marks (ceremonial page header, closing seal) and the lotus
are repository-authored SVG geometry in `sections/decor.tsx`
(`SongHyGlyph`, `LotusMark`): no Unicode 囍 glyph is drawn, no CJK or device
font is involved, nothing is fetched, and the geometry renders identically
on every device. The accessible name "Song Hỷ" stays on the wrapper; the SVG
is `aria-hidden`. The raster medallion is used only where the approved
design calls for the ornamental medallion (opening cover, hero seal and the
typographic hero).

- **Source:** repository-authored renderer code and CSS (VH-01/VH-02A,
  Claude Code assistance, directed by the Product Owner's task briefs).
- **Author / owner:** WeddingClick.
- **Rights basis:** original work authored in this repository.

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

## Task 029 prototype decor — audit (VH-01, rechecked VH-02A)

**Source:** the ten Task 029 Vietnamese Heritage reference PNGs in the
Task 029 prototype decor directory (added by commit `0313181`, 2026-09-26),
listed below. Each file carries an OpenAI-signed C2PA content-credentials
manifest naming the claim generator "ChatGPT" / `gpt-image`, digital source
type `trainedAlgorithmicMedia`, created 2026-09-24 (UTC times below).

**Author / owner:** generated with OpenAI image generation through ChatGPT
for the WeddingClick prototype. Who directed the generation is not recorded
in the repository.

**Rights basis (VH-01):** not established for this renderer at VH-01; the
2026-10-01 ruling covered only Elegant Editorial v1, so VH-01 shipped none of
these files.

**Resolved at VH-02A:** the VH-01 blocker is closed by the Product Owner's
renderer-specific authorization of the eight used files (see "Shipped
production decor (VH-02A)" above). The two unused files remain unapproved
and unshipped.

| File | Task 029 role | Pixels | Bytes | Source SHA-256 | C2PA created (UTC) | Used by prototype | Decision |
|---|---|---|---|---|---|---|---|
| `heritage-border-left.png` | Cover/page left border end caps | 724×2172 | 701572 | `b9997fbda5c9ec032bf828484343b7e29206c9659fd0dd02bf48f3077c58bbbb` | 2026-09-24 06:48:46 | yes | shipped as WebP derivative (VH-02A) |
| `heritage-border-right.png` | Cover/page right border end caps | 724×2172 | 648935 | `8caa2b2bc290a80e90cb5b7e2285d7847151020abfb4e3007d3eac0f61939a2e` | 2026-09-24 06:48:49 | yes | shipped as WebP derivative (VH-02A) |
| `heritage-corner-ornament.png` | none (unused) | 1254×1254 | 623668 | `ca090a7ffb54594705a8bfa51450ec2d45a7ae4f2caf18e6fda5bb93a67ae1fb` | 2026-09-24 06:43:20 | no | not approved; not shipped |
| `heritage-double-happiness-medallion.png` | Cover medallion, hero seal | 1254×1254 | 2743439 | `dcfd787cc224bed4a91965f4c051e777a7bb18ef475b05e25e48ebfa604bd7c1` | 2026-09-24 06:43:28 | yes | shipped as WebP derivative (VH-02A) |
| `heritage-floral-bottom-right.png` | Cover/hero corner floral | 1254×1254 | 1665998 | `1b96673b6936af74974b094ccf5ffd0637e6cb224768b32c05b298a5f2441614` | 2026-09-24 06:43:21 | yes | shipped as WebP derivative (VH-02A) |
| `heritage-floral-top-left.png` | Cover/hero corner floral | 1254×1254 | 1808224 | `dcc56ca65ceab5409edee720141ce98cff6ff2c28fe8babd996d3221be9b337d` | 2026-09-24 06:43:26 | yes | shipped as WebP derivative (VH-02A) |
| `heritage-gold-divider.png` | Cover/hero/rite/RSVP divider | 2172×724 | 367426 | `e50ce4103943b38d3123ee5abfbd1b73f91df7935ee97d36571fad9992412c47` | 2026-09-24 06:42:49 | yes | shipped as WebP derivative (VH-02A) |
| `heritage-lantern.png` | none (unused) | 1024×1536 | 2072265 | `2174c6e62c1afb83f7885ff81d97f95e4d845ddc9a38fb3c627481466f0997df` | 2026-09-24 06:43:08 | no | not approved; not shipped |
| `heritage-paper-ivory.png` | Ivory paper texture (hero, pages) | 1254×1254 | 2363572 | `7285e242ed21427d8057e572f1552103db4455cc8e415710aca42ea33e9ee678` | 2026-09-24 06:42:56 | yes | shipped as WebP derivative (VH-02A) |
| `heritage-paper-red.png` | Red door paper texture | 1254×1254 | 2883051 | `8d0acc96fbb357d934daee0144fe37bd17f3e8a04743977ed7e2d883e2be5001` | 2026-09-24 06:42:47 | yes | shipped as WebP derivative (VH-02A) |

The eight used files total about 13.1 MB as raw PNGs; they are never a
production payload. The shipped derivatives meet P6 (WebP, no metadata
chunks, about 0.56 MiB in total) under
`public/renderers/wedding/vietnamese-heritage/v1/`.
