# Hồng Ân v1 — decor provenance

Provenance note for `wedding.hong-an.v1` (HA-INTEGRATION-01). It records the
factual source history of the decorative files and the Product Owner's
production-use decision. It makes no legal conclusion about copyright
ownership and records no rights decision that has not been made.

Version path: `public/renderers/wedding/hong-an/v1/` (immutable once used by
a published invitation, P6 / CLAUDE.md §9). Two modules name these files,
each by exact literal path: `interactive/opening-geometry.ts` (the five
opening layers) and `hong-an-v1.module.css` (the seven interior ornaments).

## Allowed production use

- **Product Owner decision (2026-11-03): RECORDED.** Public and commercial
  use of all Hồng Ân opening artwork and interior assets in the WeddingClick
  wedding invitation service is explicitly authorized. The grant covers the
  twelve files listed below — the five opening layers and the seven interior
  ornaments — in the exact form shipped here.
- This records the confirmed **usage rights only**. It asserts no copyright
  ownership of the artwork, and it makes no legal conclusion beyond the
  authorization stated above.
- The files must not be redrawn, re-cropped or replaced; the 2026-10-01
  Product Owner ruling to use the exact approved assets applies, and the
  version path is immutable once a published invitation uses it (P6 /
  CLAUDE.md §9).
- **Extended to `wedding.hong-an.v2`.** v2 (HA-CONTENT-01) introduces no new
  decorative file: it reuses exactly these twelve files, by the same literal
  paths under `public/renderers/wedding/hong-an/v1/`. No separate grant was
  needed, because no new asset exists. See
  `../v2/PROVENANCE.md`.
- This authorization was the one open item HA-INTEGRATION-01 recorded against
  activation. Activating the template (`templates.is_active`) remains a
  separate Product Owner decision, and migrations `0057`/`0058` stay
  unapplied until they are explicitly applied.

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
