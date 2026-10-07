import { deriveEventDateTimePresentationV1 } from "../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationRendererPropsV1 } from "../../../../lib/invitation-rendering/renderer-component";
import { VIETNAMESE_HERITAGE_V1_FONT_VARIABLES_CLASS_NAME } from "./fonts";
import { VIETNAMESE_HERITAGE_V1_PALETTE_STYLE } from "./palette";
import { Ceremonial } from "./sections/ceremonial";
import { Closing } from "./sections/closing";
import { DressCode } from "./sections/dress-code";
import { Events } from "./sections/events";
import { Gallery } from "./sections/gallery";
import { Gift } from "./sections/gift";
import { Hero } from "./sections/hero";
import { LoveStory } from "./sections/love-story";
import { OpeningCover } from "./sections/opening-cover";
import { Timeline } from "./sections/timeline";
import styles from "./vietnamese-heritage-v1.module.css";

/**
 * Vietnamese Heritage v1 — the second production invitation renderer
 * (`wedding.vietnamese-heritage.v1`; docs/DECISIONS.md "VH-01 — Vietnamese
 * Heritage v1 Production Contract").
 *
 * VH-01 static skeleton. It reads only the frozen RF-05 K6 props:
 * `viewModel` (canonical data with runtime media URLs), `sections` (the only
 * visibility authority for optional sections, K7) and `capabilities`. It
 * never receives a manifest, Snapshot or token, never touches a database,
 * storage, environment, browser global or current time, and computes no
 * date, weekday or lunar value itself: every temporal part comes from the
 * RF-05C derivation. The approved Task 029 direction is a visual reference
 * only; nothing here imports or reproduces prototype code, data or media.
 *
 * Static only: no hooks, state or effects, and `capabilities` is not read.
 * Absent capability UI is never success: RSVP, countdown, music, the gift
 * dialog with copy, the album lightbox and the split-door opening are the
 * VH-02 interactive islands.
 *
 * Root order follows the approved direction: Opening → Hero → Ceremonial
 * page (Song Hỷ, families, portraits, invitation, rite) → Events → Timeline →
 * Love Story → Gift → Dress Code → Gallery → Closing.
 */
export function VietnameseHeritageV1({ viewModel, sections }: InvitationRendererPropsV1) {
  const { people, families, ceremony, content, gift, media, operationalSides } = viewModel;
  const ceremonyDate = deriveEventDateTimePresentationV1(ceremony);

  // `sections.*` alone decides visibility. The null checks only narrow the
  // type: RF-04 R9 makes a visible section with null content impossible.
  const loveStory = sections.loveStory ? content.loveStory : null;
  const dressCode = sections.dressCode ? content.dressCode : null;

  return (
    <div
      className={`${VIETNAMESE_HERITAGE_V1_FONT_VARIABLES_CLASS_NAME} ${styles.root}`}
      style={VIETNAMESE_HERITAGE_V1_PALETTE_STYLE}
      data-renderer="vietnamese-heritage-v1"
      data-variant={viewModel.variant}
    >
      <main className={styles.column}>
        <OpeningCover people={people} ceremonyDate={ceremonyDate} />
        <Hero people={people} ceremony={ceremony} cover={media.cover} ceremonyDate={ceremonyDate} />
        <Ceremonial
          people={people}
          families={families}
          portrait={media.portrait}
          ceremony={ceremony}
          ceremonyDate={ceremonyDate}
          guestDisplayName={viewModel.guest?.displayName}
        />
        <Events cards={viewModel.ceremonyCards} />
        {sections.timeline ? <Timeline items={content.timeline} /> : null}
        {loveStory !== null ? <LoveStory story={loveStory} photo={media.loveStoryPhoto} /> : null}
        {sections.gift ? <Gift operationalSides={operationalSides} gift={gift} qr={media.qr} /> : null}
        {dressCode !== null ? <DressCode dressCode={dressCode} /> : null}
        {sections.gallery ? <Gallery gallery={media.gallery} /> : null}
        <Closing people={people} ceremonyDate={ceremonyDate} />
      </main>
    </div>
  );
}
