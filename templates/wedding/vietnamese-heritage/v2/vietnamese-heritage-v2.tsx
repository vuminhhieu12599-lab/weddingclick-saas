import { deriveEventDateTimePresentationV1 } from "../../../../lib/invitation-rendering/event-date-time-presentation";
import { startMusicOnOpen } from "../../../../lib/invitation-rendering/music-control-model";
import type { InvitationRendererPropsV1 } from "../../../../lib/invitation-rendering/renderer-component";
import { VIETNAMESE_HERITAGE_V2_FONT_VARIABLES_CLASS_NAME } from "./fonts";
import { Countdown } from "./interactive/countdown";
import { MusicControl } from "./interactive/music-control";
import { Rsvp } from "./interactive/rsvp";
import { SectionReveal } from "./interactive/section-reveal";
import { VIETNAMESE_HERITAGE_V2_PALETTE_STYLE } from "./palette";
import { Ceremonial } from "./sections/ceremonial";
import { Closing } from "./sections/closing";
import { VIETNAMESE_HERITAGE_V2_TEXTURE_STYLE } from "./sections/decor";
import { DressCode } from "./sections/dress-code";
import { Events } from "./sections/events";
import { Gallery } from "./sections/gallery";
import { Gift } from "./sections/gift";
import { Hero } from "./sections/hero";
import { LoveStory } from "./sections/love-story";
import { OpeningCover } from "./sections/opening-cover";
import { Timeline } from "./sections/timeline";
import styles from "./vietnamese-heritage-v2.module.css";

/** Palette tokens plus the two paper textures, as renderer-scoped custom properties. */
const ROOT_STYLE = Object.freeze({ ...VIETNAMESE_HERITAGE_V2_PALETTE_STYLE, ...VIETNAMESE_HERITAGE_V2_TEXTURE_STYLE });

/**
 * Vietnamese Heritage v2 (`wedding.vietnamese-heritage.v2`; docs/DECISIONS.md
 * "VH-V2-01"). A new immutable version of the released v1 (RF7/RF14): the
 * same frozen props, data contract, sections, slots and design keys, with
 * the Product Owner-approved gift intro, gift typography and the VH-V2-01
 * motion layer (cover entrance, hero choreography, gold-rule reveals,
 * tactile controls; all CSS, all off under reduced motion). v1 is untouched
 * and keeps rendering every Project pinned to it.
 *
 * Renderer (VH-01 skeleton, VH-02A visuals, VH-02B-E1 islands). It reads only
 * the frozen RF-05 K6 props: `viewModel` (canonical data with runtime media URLs), `sections` (the only
 * visibility authority for optional sections, K7) and `capabilities`. It
 * never receives a manifest, Snapshot or token, never touches a database,
 * storage, environment, browser global or current time, and computes no
 * date, weekday or lunar value itself: every temporal part comes from the
 * RF-05C derivation. The approved Task 029 direction is a visual reference
 * only; nothing here imports or reproduces prototype code, data or media.
 *
 * Islands (VH-02B-E1, VH-02B-M1): the root reads `capabilities` only as
 * presence gates. The split-door opening always exists (explicit tap only);
 * music exists only with `sections.music` and `capabilities.music`, and the
 * opening then makes one start-on-open play attempt; the countdown only with
 * `capabilities.clock`; RSVP only with `capabilities.rsvp`; the gift
 * CTA/dialog follows `sections.gift` plus honest gift content, its copy
 * control only with `capabilities.clipboard`. An absent capability is never
 * success and never a disabled stand-in. VH-02B-M2: the album lightbox
 * lives in the gallery section; `SectionReveal` progressively reveals the
 * content after the Hero (never the opening or the Hero itself).
 *
 * Layout media come only from `viewModel.media.templateSlots` (`heroPhoto`,
 * `portraitCluster`, `loveStoryPhoto`, `gallery`); `media.qr` is the only
 * other media read (VH-02A).
 *
 * Root order follows the approved direction: Opening → Hero → Ceremonial
 * page (Song Hỷ, families, portraits, invitation, rite, then the venue cards
 * and timeline on the same sheet) → Love Story → RSVP → Gift → Dress Code →
 * Gallery → Closing. Decor comes only from the immutable v1 renderer path.
 */
export function VietnameseHeritageV2({ viewModel, sections, capabilities }: InvitationRendererPropsV1) {
  const { people, families, ceremony, content, gift, media, operationalSides } = viewModel;
  const ceremonyDate = deriveEventDateTimePresentationV1(ceremony);

  // TEMPLATE_SLOTS (TE-02/TE-04): the four frozen visual positions are the
  // only layout media. An absent or empty slot is empty: never a legacy
  // COVER / PORTRAIT / LOVE_STORY_PHOTO / GALLERY substitute.
  const slots = media.templateSlots;
  const heroPhoto = (slots?.heroPhoto ?? [])[0];
  const portraitCluster = slots?.portraitCluster ?? [];
  const loveStoryPhoto = (slots?.loveStoryPhoto ?? [])[0];
  const gallery = slots?.gallery ?? [];

  // `sections.*` alone decides visibility. The null checks only narrow the
  // type: RF-04 R9 makes a visible section with null content impossible.
  const loveStory = sections.loveStory ? content.loveStory : null;
  // Music exists only with the effective section AND the runtime capability; never a fallback.
  const music = sections.music ? capabilities.music : undefined;
  const dressCode = sections.dressCode ? content.dressCode : null;

  return (
    <div
      className={`${VIETNAMESE_HERITAGE_V2_FONT_VARIABLES_CLASS_NAME} ${styles.root}`}
      style={ROOT_STYLE}
      data-renderer="vietnamese-heritage-v2"
      data-variant={viewModel.variant}
    >
      {music !== undefined ? <MusicControl music={music} /> : null}
      <main className={styles.column}>
        <OpeningCover people={people} ceremonyDate={ceremonyDate} {...(music === undefined ? {} : { onOpen: startMusicOnOpen(music) })} />
        <Hero people={people} ceremony={ceremony} photo={heroPhoto} ceremonyDate={ceremonyDate} />
        <Ceremonial
          families={families}
          portraitCluster={portraitCluster}
          ceremony={ceremony}
          ceremonyDate={ceremonyDate}
          guestDisplayName={viewModel.guest?.displayName}
        >
          <Events cards={viewModel.ceremonyCards} />
          {sections.timeline ? <Timeline items={content.timeline} /> : null}
          {capabilities.clock !== undefined ? <Countdown ceremony={ceremony} clock={capabilities.clock} /> : null}
        </Ceremonial>
        {loveStory !== null ? <LoveStory story={loveStory} photo={loveStoryPhoto} /> : null}
        {capabilities.rsvp !== undefined ? <Rsvp rsvp={capabilities.rsvp} /> : null}
        {sections.gift ? <Gift operationalSides={operationalSides} gift={gift} qr={media.qr} clipboard={capabilities.clipboard} /> : null}
        {dressCode !== null ? <DressCode dressCode={dressCode} /> : null}
        {sections.gallery ? <Gallery gallery={gallery} /> : null}
        <Closing people={people} ceremonyDate={ceremonyDate} />
        <SectionReveal hasCountdown={capabilities.clock !== undefined} />
      </main>
    </div>
  );
}
