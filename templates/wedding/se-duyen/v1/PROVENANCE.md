# Se Duyên v1 — decor provenance

Provenance note for `wedding.se-duyen.v1` (SD-V1-01). It records factual
source history and the Product Owner production-use decisions. It makes no
legal conclusion about copyright ownership.

Version path: `public/renderers/wedding/se-duyen/v1/` (immutable once used by
a published invitation, P6 / CLAUDE.md §9). `se-duyen-v1.module.css` is the
only module that names these files, each by exact literal path.

## Common record

- **Source:** the Product-Owner-approved visual freeze of the "Se Duyên — Hộp
  Cưới" pilot v03 prototype direction, frozen at commit `79971e3`
  (`feat(prototype): freeze Se Duyen pilot v03 visual`). The files were taken
  from the prototype demo directories named in the table below.
- **Derived from the approved prototype pixels:** **NO DERIVATION.** Each
  file is a byte-identical copy — `cp`, no resize, crop, recolour, retouch,
  re-compression or metadata change. Each SHA-256 below was verified against
  the hash recorded in the prototype's own asset record (see "Recorded
  hashes" below), so the approved pixels are provably unchanged. This follows
  the 2026-10-01 Product Owner ruling to use the exact approved assets and
  never redraw them.
- **Product Owner decision (2026-10-20):** public and commercial use of the
  Se Duyên AI-generated decorative assets in WeddingClick is explicitly
  authorized — "the lacquer background, the wedding box, the lid and the
  related ornaments". Recorded in the prototype's own asset records under
  `prototypes/invitation/demo/se-duyen/` (`assets/README.md` and
  `pilot-v03/PROVENANCE.md`). That grant supersedes the earlier "prototype
  only, not approved for Production" status of these decorative files.
- **Originals' provenance:** the source renders were AI-generated for the
  Se Duyên direction and carry OpenAI C2PA manifests (`gpt-image`,
  `trainedAlgorithmicMedia`). The 2026-10-20 authorization covers that
  provenance. The three pilot-v03 opening layers shipped here are the
  size-optimized WebP copies whose derivation, settings and verification are
  recorded in `prototypes/invitation/demo/se-duyen/pilot-v03/PROVENANCE.md`; this renderer copies those
  already-approved WebPs, it does not re-derive them.
- **Not archaeological reproductions:** the motifs are lotus / Đông Sơn
  *inspired* design concepts, not verified reproductions of specific
  historical Vietnamese artifacts, and must not be marketed as such.
- **Allowed production use:** `wedding.se-duyen.v1` public invitation
  rendering.
- **Personal / customer data:** none. No people, photographs, names, dates,
  bank details, logos or project data are baked into any file; every word a
  guest reads is DOM text.

## Files

| File | Bytes | SHA-256 | Prototype source path | Source → final |
|---|---|---|---|---|
| `bg-red-lacquer.webp` | 281210 | `49e07c177d89681fe7a4378d2f255fa14b51de2af34e82ca972afa1c9d4edb4e` | `pilot-v03/bg-red-lacquer.webp` | byte-identical |
| `box-open-base.webp` | 246792 | `ce3b7c181d69dcbf310ca3d73386b92585297a8c932c512d2fd7746d6e70cb90` | `pilot-v03/box-open-base.webp` | byte-identical |
| `box-lid.webp` | 206094 | `3a79c0b670c0e4daab4d45fddfe6279fe38ef226a7d1ff34469bedd711821dc4` | `pilot-v03/box-lid.webp` | byte-identical |
| `ivory-invitation-card.webp` | 57964 | `e345e2d221208e5b0cbbf852333380660b73e67f4b098eb1fb1dbdf28d5e6750` | `assets/ivory-invitation-card.webp` | byte-identical |
| `lotus-fate-medallion.webp` | 98894 | `0e49bb347527db30fe2b57f75d586677cf54c6a71a06a0ec3cb3ded10bb2883d` | `assets/lotus-fate-medallion.webp` | byte-identical |
| `red-thread.webp` | 40298 | `0d41e433d79c7ca64bed77f31bef7feeb8caade56324c0748e37cf672dc21372` | `se-duyen-visual-pilot-v02/red-thread.webp` | byte-identical |

### Recorded hashes checked against

- `bg-red-lacquer.webp`, `box-open-base.webp`, `box-lid.webp` — the derived
  WebP hashes in `prototypes/invitation/demo/se-duyen/pilot-v03/PROVENANCE.md`.
- `ivory-invitation-card.webp`, `lotus-fate-medallion.webp` — the optimized
  WebP hashes in `prototypes/invitation/demo/se-duyen/assets/README.md`.
- `red-thread.webp` — the asset table in
  `prototypes/invitation/demo/se-duyen/se-duyen-visual-pilot-v02/README.md`.

All six match exactly.

## `red-thread.webp` — Product Owner confirmation (2026-10-23)

**RESOLVED. This file is approved for production use.** The Product Owner
explicitly confirms that `red-thread.webp` belongs to the Se Duyên artwork
set authorized for commercial use on 2026-10-20. No further authorization is
needed, and the file must not be redrawn or replaced.

For the record, this was the one file whose authorization previously rested
on a reading rather than on a file-level grant: the 2026-10-20 authorization
names "the lacquer background, the wedding box, the lid and the **related
ornaments**", and `assets/README.md` adds that the authorized set "is the set
in this directory" — the v0.1 `assets/` directory — while `red-thread.webp`
sits in the earlier `se-duyen-visual-pilot-v02/` directory, whose own README
still carries the superseded "chưa phải asset production được duyệt" note.
The 2026-10-23 confirmation settles that: the tơ hồng is a Se Duyên
AI-generated decorative ornament of the same set and the same origin, and the
approved composition uses it in three places — the hero's single ornament,
the rule under the invitation plate, and the thread under the closing words.

## Not shipped

Deliberately left in the prototype:

- `se-duyen-visual-pilot-v02/couple-photo-demo.webp` and everything under
  `interior/` — fictional showroom demo photography. A production renderer
  never carries a photograph: every photo a guest sees is the Project's own
  media, resolved at render time (docs/DECISIONS.md P7).
- `gift/qr-demo-*.svg` — deliberately non-scannable illustrative payment-QR
  artwork, explicitly excluded from the 2026-10-20 authorization.
- `pilot-v03/*.png` and `pilot-v03/box-closed.png` — the unoptimized
  originals, and a render the approved opening does not use.
- `assets/lacquer-box-lid.webp`, `assets/lotus-gilded-portrait-frame.webp` —
  the approved pilot v03 opening composes its lid from `box-lid.webp` seated
  on `box-open-base.webp`, and the approved couple composition has no gilded
  portrait frame.
