WEDDINGCLICK V2 — CHUYEN CHUNG MINH / OUR WEDDING STORY V2
AI-generated fictional wedding photo demo pack — 14 Oct 2026

CONTENTS
- photos/ : 10 source PNG images (originals preserved)
- photo-set.json : image orientation, pixel dimensions, SHA-256, suggested slot mapping

INSTALLATION (Cursor Linux)
1. Extract ZIP somewhere convenient, e.g. ~/Downloads/weddingclick_mau_4_chuyen_chung_minh_v2_album/
2. Open ~/Documents/weddingclick-p0-04 in Cursor.
3. Send the English integration prompt from ChatGPT to Claude Code.
4. Claude should first inspect the current repo state and editor manifest, then optimize source PNGs to WebP and add them to the PUBLIC SHOWROOM DEMO ONLY.
5. Keep these source PNG originals. Do not commit the source PNGs unless separately authorized. Do not delete pre-existing untracked assets.

SUGGESTED IMAGE-TO-SLOT MAPPING — verify slot contracts/maxCount first
coverPhoto      01-cover-couple-fullbody
bridePortrait   03-bride-portrait (BRIDE ONLY)
groomPortrait   04-groom-portrait (GROOM ONLY)
storyPhoto      09-editorial-seated-wide
gallery         05, 06, 07, 08, 02, 09, 03, 04, 01, 10 (only if maxCount allows 10)
thankYouPhoto   10-thank-you-couple

SOURCE AND SAFETY
Generated fictional photography, style-inspired by the user's references. This ZIP does not contain any original reference photos or third-party logos. Do not use it as an automatic fallback for customer invitations.
Renderer: wedding.our-wedding-story.v2 (UI already approved). Do not change V1/V2 renderer JSX or CSS for this photo integration.

TARGET
public/showroom/demo/our-wedding-story/photos/*.webp
Use the established DEMO_TEMPLATE_SLOT_PHOTO_SETS and exact registered renderer-key pattern in lib/showroom/demo/demo-media.ts.

NOTE
The selected image set is a demo. Product Owner must inspect final Preview and visually approve the photo integration before release.
