# Se Duyên — Vietnamese 3D visual pilot (v0.1)

## Rights

**Product Owner authorization, 2026-10-20.** The Product Owner explicitly authorizes **public and commercial use** of the Se Duyên AI-generated decorative assets in WeddingClick — the lacquer background, the wedding box, the lid and the related ornaments, which is the set in this directory. This supersedes the earlier "prototype only, not approved for Production" status of these decorative files.

The authorization is scoped to these Se Duyên decorative assets. It does **not** extend to unrelated photography (the fictional showroom demo photographs under `../interior/`, which carry their own separate approval) or to the demo payment-QR artwork under `../gift/`, which stays illustrative, deliberately non-scannable prototype material. See `../pilot-v03/PROVENANCE.md` for the opening layers' derivation and hashes.

These images were AI-generated on request for the WeddingClick Se Duyên direction, aiming at Vietnamese lacquer craftsmanship and lotus / Đông Sơn-inspired *visual motifs* with no Chinese-style characters or palace ornaments. They are design concepts, **not verified reproductions of specific historical Vietnamese artifacts**.

## Assets / integration roles

| File under `web/` | Intended role | Use |
|---|---|---|
| `lacquer-box-lid.webp` | Depth-focused sơn mài box lid with lotus and drum-inspired side bands | Position as **static lid artwork**; movable opening CSS layer. Contains no wedding names/dates. |
| `lotus-fate-medallion.webp` | Embossed gold lotus medallion with red intertwined thread | Overlay on cover (use as **brand-seal ornament**). It deliberately avoids a Chinese-style double-happiness glyph. |
| `lotus-gilded-portrait-frame.webp` | Embossed gold lotus portrait frame | Position image **behind** the frame; inner opening is transparent. |
| `ivory-invitation-card.webp` | Ivory silk/paper invitation plate with gold lotus frame | Layer **under dynamic HTML text**; all real names, ceremony data, dates and labels stay DOM text. |

## Ground rules

- All four WEBP files retain alpha transparency. Original high-resolution PNG files are in `source/`.
- No baked-in person names, wedding dates, bank details, RSVP content, sample logos or externally hosted assets.
- **Use these as visual direction prototype assets only.** Do not deploy to public showroom, seed database, or update frozen production renderer yet.
- Keep current cover / couple interaction logic unchanged. Integrate incrementally: first place the cover lid; then layer medallion; then the framed couple photo; then inner card. Check at 360/390/430 px.
- Preserve tappable open button. Raise “CHẠM ĐỂ MỞ THIỆP” safely above bottom: use viewport-dependent layout plus env(safe-area-inset-bottom); never a fixed viewport absolute pixel on all heights.
- Important: not every generated detail is archaeologically exact; no culturally specific icon should be marketed as a historical replica without independent verification.
- Photographs of demo couples are a separate layer; these four files intentionally contain **no photos**.
- If the box and medallion overlap too heavily, simplify ornaments via layout/scale instead of adding more.

## SHA-256 for optimized WebP (content integrity)

- `lacquer-box-lid.webp`: 720×1279, 182,314 B, SHA-256 `7c0e86a268ba437353be0e06d0f096ef8887001f933e4f2b27b3fe318bc3d473`
- `lotus-fate-medallion.webp`: 620×620, 98,894 B, SHA-256 `0e49bb347527db30fe2b57f75d586677cf54c6a71a06a0ec3cb3ded10bb2883d`
- `lotus-gilded-portrait-frame.webp`: 740×925, 161,188 B, SHA-256 `5c7fc26083d3f74d57553c88b24e0447fb9de185c1dcf1c23e8f7a1caa9aeb78`
- `ivory-invitation-card.webp`: 720×1279, 57,964 B, SHA-256 `e345e2d221208e5b0cbbf852333380660b73e67f4b098eb1fb1dbdf28d5e6750`

## Handoff

Copy **only** `web/*.webp` into `public/prototypes/invitation/demo/se-duyen/assets/` on `template-05-se-duyen-prototype`, after checking the current branch. Do not copy originals into Git and do not touch `public/showroom/` or Production. The public URL for one copied file would then be `/prototypes/invitation/demo/se-duyen/assets/lacquer-box-lid.webp`.

Artwork v0.1 is directional. In particular, medallion is not a historically attested emblem, and artistic motifs should be reviewed by the Product Owner for Vietnamese appropriateness. Renderer/photo integration will be a separate code task.
