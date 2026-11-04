# Hồng Ân v2 — decor provenance

Provenance note for `wedding.hong-an.v2` (HA-CONTENT-01). It records factual
source history only. It makes no legal conclusion about copyright ownership
and records no rights decision that has not been made.

## v2 introduces no new decorative file

v2 makes the Scripture quote a Staff-configurable setting and **adds,
redraws, re-crops and re-compresses nothing**. There is therefore no
`public/renderers/wedding/hong-an/v2/` directory and no new asset table
here.

Both v2 modules that name decorative files — `interactive/opening-geometry.ts`
(the five opening layers) and `hong-an-v2.module.css` (the seven interior
ornaments) — name exactly the same twelve files as v1, by the same exact
literal paths under `public/renderers/wedding/hong-an/v1/`.

**The full record for those files — source, derivation, pixel sizes and
SHA-256 hashes — is `../v1/PROVENANCE.md`, and it applies unchanged.**

### Why share the v1 path instead of copying the files

1. Those files are immutable (P6 / CLAUDE.md §9). A version path is frozen
   once a published invitation uses it, which is exactly what makes it safe
   for another renderer version to reference.
2. v2 changes no artwork, so a v2 copy would be twelve duplicated binaries
   that could only ever drift from the approved pixels — against the
   2026-10-01 Product Owner ruling to use the exact approved assets.
3. It is the established pattern: Se Duyên v2, Vietnamese Heritage v2 and
   Our Wedding Story v2 likewise ship no `public/renderers/.../v2/`
   directory and read their v1 asset paths.

## Allowed production use

- **Extended to `wedding.hong-an.v2` on the Product Owner's 2026-11-03
  authorization**, which covers all Hồng Ân opening artwork and interior
  assets for commercial use in the WeddingClick wedding invitation service
  and is recorded in `../v1/PROVENANCE.md`. No new grant was needed, because
  v2 introduces no new asset and reuses exactly v1's twelve files.
- That record states the confirmed usage rights only; it asserts no copyright
  ownership of the artwork.
- Activating the template remains a separate Product Owner decision, and
  migrations `0057`/`0058` stay unapplied until they are explicitly applied.

## Personal / customer data

None. No people, photographs, names, dates, bank details, logos or project
data are baked into any file; every word a guest reads is DOM text. The
photographs a guest sees are only ever the Project's own RESOLVED media, and
the Scripture quote is either the template's own approved default copy or
the Project's own configured text.
