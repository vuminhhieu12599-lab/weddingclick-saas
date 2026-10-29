# Se Duyên v2 — decor provenance

Provenance note for `wedding.se-duyen.v2` (SD-V2-01). It records factual
source history and the Product Owner production-use decisions. It makes no
legal conclusion about copyright ownership.

## v2 introduces no new decorative file

v2 corrects two compositions — the music control and the wedding album — and
**adds, redraws, re-crops and re-compresses nothing**. There is therefore no
`public/renderers/wedding/se-duyen/v2/` directory and no new asset table
here.

`se-duyen-v2.module.css` names exactly the same six decorative files as v1,
by the same exact literal paths under
`public/renderers/wedding/se-duyen/v1/`:

- `bg-red-lacquer.webp`
- `box-lid.webp`
- `box-open-base.webp`
- `ivory-invitation-card.webp`
- `lotus-fate-medallion.webp`
- `red-thread.webp`

**The full record for those files — source, byte-identical derivation,
SHA-256 hashes, the 2026-10-20 Product Owner commercial-use authorization,
the C2PA provenance of the originals and the "not archaeological
reproductions" caveat — is `../v1/PROVENANCE.md`, and it applies unchanged.**

### Why share the v1 path instead of copying the files

1. Those files are immutable (P6 / CLAUDE.md §9). A version path is frozen
   once a published invitation uses it, which is exactly what makes it safe
   for another renderer version to reference.
2. v2 changes no artwork, so a v2 copy would be six duplicated binaries that
   could only ever drift from the approved pixels — against the 2026-10-01
   Product Owner ruling to use the exact approved assets.
3. It is the established pattern: Vietnamese Heritage v2 and Our Wedding
   Story v2 likewise ship no `public/renderers/.../v2/` directory and read
   their v1 asset paths.

## Allowed production use

Extended by this version to `wedding.se-duyen.v2` public invitation
rendering, on the same 2026-10-20 authorization recorded in
`../v1/PROVENANCE.md`. No new grant was needed, because no new asset is
introduced.

## Personal / customer data

None. No people, photographs, names, dates, bank details, logos or project
data are baked into any file; every word a guest reads is DOM text. The
photographs a guest sees are only ever the Project's own RESOLVED media.
