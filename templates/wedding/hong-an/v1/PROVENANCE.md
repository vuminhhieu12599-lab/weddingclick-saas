# Hồng Ân v1 — decor provenance

Provenance note for `wedding.hong-an.v1` (HA-INTEGRATION-01). It records the
factual source history of the decorative files. It makes no legal conclusion
about copyright ownership and records no rights decision that has not been
made.

Version path: `public/renderers/wedding/hong-an/v1/` (immutable once used by
a published invitation, P6 / CLAUDE.md §9). Two modules name these files,
each by exact literal path: `interactive/opening-geometry.ts` (the five
opening layers) and `hong-an-v1.module.css` (the seven interior ornaments).

## Open item — required before activation

- **Product Owner rights confirmation: NOT RECORDED.** Unlike Se Duyên (whose
  Product Owner grant of 2026-10-20 is recorded in its own PROVENANCE.md), no
  repository record yet states that public and commercial use of the Hồng Ân
  opening artwork and interior ornament pack is authorized. The catalog seed
  (migration 0057) registers the template INACTIVE; this confirmation should
  be recorded here before it is activated.

## Opening artwork (5 files)

- **Source:** the Product-Owner-approved V4 cathedral-door opening, whose
  masters are the V4 opening prototype checkpoint (commit `227710c`,
  `feat(hong-an): V4 opening prototype checkpoint`).
- **Derived from the approved pixels:** re-encoded for serving only, in
  HA-TEMPLATE-01 (commit `f772b9b`) — nothing redrawn, recomposed or
  re-registered. Alpha is bit-exact and the mean colour error is under 1/255
  over the opaque area. All five layers keep the masters' 1440 × 3120 canvas.

| File | Pixels | SHA-256 |
|---|---|---|
| `door-left.webp` | 1440 × 3120 | `dc71e4c0a49e8072b76768e978e8890bddcc48a4e285562242115c882d34ae9b` |
| `door-reveal.webp` | 1440 × 3120 | `5b6fa61d1bb1a1c25ab881161a3e0d81b642c43501ef06f060f98cdba0bbf81b` |
| `door-right.webp` | 1440 × 3120 | `5719d3c6ed4fabc7e89e433bcd3ea88e62526feca9ec9e086f84049f72803ca2` |
| `foreground-flowers.webp` | 1440 × 3120 | `f1b9bea4f1f1d272db42fc9bf30cf40a3daa72ed8021dcf1af24c3256d8f3272` |
| `frame-static.webp` | 1440 × 3120 | `947f8fbf0ec020ddcac01b2fae1bcd686a856974df05d477047bf7d6c3d1ab99` |

## Interior ornaments (7 files, `interior/`)

- **Source:** the Product-Owner-supplied asset pack
  `HongAn_Interior_Ornaments_v1_Claude.zip` (its README describes the pack as
  newly generated transparent atlases with candidate cutouts), selected in
  HA-DESIGN-02 (commit `5b49ea5`).
- **Derived from the supplied cutouts:** resized to display size and
  re-encoded as WebP. `gothic-window.webp` and `rose-window.webp` also had a
  plain rectangular trim that removes a separate fragment of neighbouring
  atlas art; nothing was redrawn, masked or recoloured. Cutouts with
  neighbouring-art bleed that could not be trimmed (the four lily corners,
  the bouquet) or a clipped apex (the mini arch) were rejected and are not
  shipped. The source atlases are not shipped.

| File | Pixels | Source cutout | SHA-256 |
|---|---|---|---|
| `altar-frieze.webp` | 600 × 264 | `gothic-altar-frieze.webp` | `460f65b864a6ead0fc6a51a8bb8b30bc2b610e4db9c77f0abeb61d6e96ce4fad` |
| `gold-divider.webp` | 480 × 55 | `ornament-gold-divider.webp` | `2eb895899b52a4c5972d5aa451b28b497873266edbd891a30248a806369bf9e7` |
| `gothic-arch.webp` | 420 × 631 | `gothic-arch-large.webp` | `1fc11093d9ea314346d0f6e691fb56349ba98276a224f0cc828e959cbd5cbc65` |
| `gothic-window.webp` | 140 × 357 | `gothic-window-narrow.webp` | `6a01137c51fc5e55f316daa4a832a2b4b8133e8f3ef3fed95e96ea10cb76cecb` |
| `lily-divider.webp` | 600 × 53 | `ornament-lily-divider.webp` | `b24be0027a6c60e88f703d9c07859c8a0400b1dc20056f59c97a138ac3673544` |
| `quatrefoil.webp` | 360 × 323 | `gothic-quatrefoil-large.webp` | `688b739dcca23bf0392ff25f5077cc97aa064a037b63bed9c3f1affefadcf632` |
| `rose-window.webp` | 240 × 240 | `ornament-rosette.webp` | `66be89067bd9b57ff68d5509b43656f304075de3ae05d799a32c3578d912b6bc` |
