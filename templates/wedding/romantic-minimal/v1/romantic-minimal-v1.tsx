import { deriveEventDateTimePresentationV1 } from "../../../../lib/invitation-rendering/event-date-time-presentation";
import { startMusicOnOpen } from "../../../../lib/invitation-rendering/music-control-model";
import type { InvitationRendererPropsV1 } from "../../../../lib/invitation-rendering/renderer-component";
import { ROMANTIC_MINIMAL_V1_FONT_VARIABLES_CLASS_NAME } from "./fonts";
import { Countdown } from "./interactive/countdown";
import { MusicControl } from "./interactive/music-control";
import { OpeningStage } from "./interactive/opening-stage";
import { Rsvp } from "./interactive/rsvp";
import { SectionReveal } from "./interactive/section-reveal";
import styles from "./romantic-minimal-v1.module.css";
import { Album } from "./sections/album";
import { Calendar } from "./sections/calendar";
import { Ceremony } from "./sections/ceremony";
import { ROMANTIC_MINIMAL_V1_TEXTURE_STYLE } from "./sections/decor";
import { Gift } from "./sections/gift";
import { Identity } from "./sections/identity";
import { Invite } from "./sections/invite";
import { JustMarried } from "./sections/just-married";
import { singleResolved } from "./sections/media-image";
import { CoverCard } from "./sections/opening-cover";
import { OurLove } from "./sections/our-love";
import { SaveTheDate } from "./sections/save-the-date";
import { ThankYou } from "./sections/thank-you";
import { Timeline } from "./sections/timeline";

/**
 * Romantic Minimal v1 — the third production invitation renderer
 * (`wedding.romantic-minimal.v1`; docs/DECISIONS.md "RM-01" / "RM-02").
 *
 * Reads only the frozen RF-05 K6 props: `viewModel` (canonical data with
 * runtime media URLs), `sections` (the only visibility authority for optional
 * sections) and `capabilities` (presence gates only). It never receives a
 * manifest, Snapshot or token, never touches a database, storage,
 * environment, browser global or current time, and derives every temporal
 * part from the shared RF-05C derivations. The approved Task 029 direction is
 * a visual reference only; nothing here imports prototype code, data or media.
 *
 * Layout media come only from `viewModel.media.templateSlots`
 * (`saveTheDatePhoto`, `justMarriedPhoto`, `ourLovePhotos`, `gallery`,
 * `thankYouPhoto`); `media.qr` is the only other media read. An absent, empty
 * or `UNAVAILABLE` slot is never filled from another slot or legacy role.
 *
 * Order follows the approved direction: Opening → Save The Date → couple and
 * families → Just Married → invitation intro → rite / countdown / reception
 * → Timeline → Our Love → calendar → RSVP → Gift → Wedding Album → Thank You.
 * Decor comes only from the immutable v1 renderer path.
 */
export function RomanticMinimalV1({ viewModel, sections, capabilities }: InvitationRendererPropsV1) {
  const { people, families, ceremony, content, gift, media, operationalSides } = viewModel;
  const ceremonyDate = deriveEventDateTimePresentationV1(ceremony);

  const slots = media.templateSlots;
  const saveTheDatePhoto = singleResolved(slots?.saveTheDatePhoto);
  const justMarriedPhoto = singleResolved(slots?.justMarriedPhoto);
  const ourLoveSlot = slots?.ourLovePhotos ?? [];
  const gallery = slots?.gallery ?? [];
  const thankYouPhoto = singleResolved(slots?.thankYouPhoto);

  // `sections.*` alone decides visibility; the null checks only narrow types.
  const loveStory = sections.loveStory ? content.loveStory : null;
  const music = sections.music ? capabilities.music : undefined;
  const timeline = sections.timeline && content.timeline.length > 0 ? content.timeline : null;

  return (
    <div
      className={`${ROMANTIC_MINIMAL_V1_FONT_VARIABLES_CLASS_NAME} ${styles.root}`}
      style={ROMANTIC_MINIMAL_V1_TEXTURE_STYLE}
      data-renderer="romantic-minimal-v1"
      data-variant={viewModel.variant}
    >
      <OpeningStage
        music={music === undefined ? null : <MusicControl music={music} />}
        renderCover={(openButton) => <CoverCard people={people} ceremonyDate={ceremonyDate} openButton={openButton} />}
        {...(music === undefined ? {} : { onOpen: startMusicOnOpen(music) })}
      >
        <SaveTheDate people={people} ceremonyDate={ceremonyDate} photo={saveTheDatePhoto} />
        <Identity people={people} families={families} ceremonyTitle={ceremony.title} />
        {justMarriedPhoto === undefined ? null : <JustMarried photo={justMarriedPhoto} people={people} />}
        <Invite guestDisplayName={viewModel.guest?.displayName} />
        <Ceremony
          ceremony={ceremony}
          ceremonyDate={ceremonyDate}
          cards={viewModel.ceremonyCards}
          countdown={capabilities.clock === undefined ? null : <Countdown ceremony={ceremony} clock={capabilities.clock} />}
        />
        {timeline === null ? null : <Timeline items={timeline} />}
        {loveStory === null ? null : <OurLove story={loveStory} slot={ourLoveSlot} />}
        <Calendar ceremony={ceremony} />
        {capabilities.rsvp === undefined ? null : <Rsvp rsvp={capabilities.rsvp} />}
        {sections.gift ? <Gift operationalSides={operationalSides} gift={gift} qr={media.qr} clipboard={capabilities.clipboard} /> : null}
        {sections.gallery && gallery.length > 0 ? <Album gallery={gallery} /> : null}
        <ThankYou people={people} ceremonyDate={ceremonyDate} photo={thankYouPhoto} />
        <SectionReveal hasCountdown={capabilities.clock !== undefined} />
      </OpeningStage>
    </div>
  );
}
