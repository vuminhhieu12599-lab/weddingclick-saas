# Se Duyên — Pilot v0.3 gift section (demo transfer QR)

Prototype review only. **Not approved production assets.**

Two illustrative QR-shaped blocks for the Mừng Cưới envelope slip, one per
family side, so the Product Owner can judge the composition with a QR in
place.

| File | Side | Size |
|---|---|---|
| `qr-demo-groom.svg` | Nhà Trai | 600×600, 25×25 modules |
| `qr-demo-bride.svg` | Nhà Gái | 600×600, 25×25 modules |

## These are deliberately not scannable

Each file is a drawn placeholder: real finder patterns, separators, timing
lines and one alignment pattern, with the remaining modules filled from a
fixed pseudo-random seed (`20261020` groom, `20261021` bride). There is no
payload, no format information and no error correction, so no reader can
decode them.

Nothing here is generated from the prototype's fictional banking data, and no
real bank, account or VietQR payload was used, encoded or linked. The slip
itself still carries the existing demo disclaimer, and the QR carries its own
caption (`QR minh hoạ`) plus an SVG `<title>` saying the same thing.

Ink `#43301f` (`--sdi-ink`) on `#fbf5e9`, a shade above `--sdi-paper`, so the
code reads as printed label stock laid on the ivory slip rather than a pasted
white square.

Production will show the project's own uploaded bank-QR media
(`groomBankQrMediaId` / `brideBankQrMediaId`), not these files.
