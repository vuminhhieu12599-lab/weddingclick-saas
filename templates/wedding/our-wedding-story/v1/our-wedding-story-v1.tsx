import { deriveEventDateTimePresentationV1 } from "../../../../lib/invitation-rendering/event-date-time-presentation";
import { startMusicOnOpen } from "../../../../lib/invitation-rendering/music-control-model";
import type { InvitationRendererPropsV1 } from "../../../../lib/invitation-rendering/renderer-component";
import { OUR_WEDDING_STORY_V1_COPY } from "./copy";
import { OUR_WEDDING_STORY_V1_FONT_VARIABLES_CLASS_NAME } from "./fonts";
import { Countdown } from "./interactive/countdown";
import { MusicControl } from "./interactive/music-control";
import { OpeningStage } from "./interactive/opening-stage";
import { Rsvp } from "./interactive/rsvp";
import { SectionReveal } from "./interactive/section-reveal";
import styles from "./our-wedding-story-v1.module.css";
import { Couple } from "./sections/couple";
import { orderedCouplePeople } from "./sections/couple-people";
import { Cover } from "./sections/cover";
import { DateSection } from "./sections/date";
import { Families, familyHasContent } from "./sections/families";
import { Gallery } from "./sections/gallery";
import { Gift } from "./sections/gift";
import { giftPanels } from "./sections/gift-panels";
import { Invitation } from "./sections/invitation";
import { singleResolved } from "./sections/media-image";
import { owsPageNumbers } from "./sections/page-plan";
import { RsvpGift } from "./sections/rsvp-gift";
import { ThankYou } from "./sections/thank-you";

/**
 * Our Wedding Story v1 — the fourth production invitation renderer
 * (`wedding.our-wedding-story.v1`; docs/DECISIONS.md "OWS-01").
 *
 * Reads only the frozen RF-05 K6 props: `viewModel` (canonical data with
 * runtime media URLs), `sections` (the only visibility authority for optional
 * sections) and `capabilities` (presence gates only). It never receives a
 * manifest, Snapshot or token, never touches a database, storage,
 * environment, browser global or current time, and derives every temporal
 * part from the shared RF-05C derivations. The approved Visual Freeze v1
 * prototype is a visual reference only; nothing here imports prototype code,
 * data or media.
 *
 * Layout media come only from `viewModel.media.templateSlots` (`coverPhoto`,
 * `groomPortrait`, `bridePortrait`, `storyPhoto`, `gallery`,
 * `thankYouPhoto`); `media.qr` is the only other media read. An absent, empty
 * or `UNAVAILABLE` slot is never filled from another slot or legacy role. The
 * two portraits are person-bound (OWS-01): each follows its own person.
 *
 * Page order: 01 Cover → Our Families → The Couple → The Invitation → The
 * Date → Our Gallery → RSVP & Wedding Gift → Thank You, numbered over the
 * sections actually shown.
 */
export function OurWeddingStoryV1({ viewModel, sections, capabilities }: InvitationRendererPropsV1) {
  const { people, families, ceremony, content, gift, media, operationalSides } = viewModel;
  const ceremonyDate = deriveEventDateTimePresentationV1(ceremony);
  const guestDisplayName = viewModel.guest?.displayName;

  const slots = media.templateSlots;
  const coverPhoto = singleResolved(slots?.coverPhoto);
  const couple = orderedCouplePeople(people, {
    groom: singleResolved(slots?.groomPortrait),
    bride: singleResolved(slots?.bridePortrait),
  });
  const storyPhoto = singleResolved(slots?.storyPhoto);
  const gallery = slots?.gallery ?? [];
  const thankYouPhoto = singleResolved(slots?.thankYouPhoto);

  // `sections.*` alone decides visibility; the null checks only narrow types.
  const loveStory = sections.loveStory ? content.loveStory : null;
  const music = sections.music ? capabilities.music : undefined;
  const panels = sections.gift ? giftPanels(operationalSides, gift, media.qr) : [];
  const showGallery = sections.gallery && gallery.length > 0;

  const pages = owsPageNumbers({
    families: familyHasContent(families.groom) || familyHasContent(families.bride),
    couple: true,
    invitation: true,
    date: true,
    gallery: showGallery,
    rsvpGift: capabilities.rsvp !== undefined || panels.length > 0,
    thanks: true,
  });

  return (
    <div
      className={`${OUR_WEDDING_STORY_V1_FONT_VARIABLES_CLASS_NAME} ${styles.root}`}
      data-renderer="our-wedding-story-v1"
      data-variant={viewModel.variant}
    >
      <OpeningStage
        renderCover={(action) => (
          <Cover people={people} ceremonyDate={ceremonyDate} photo={coverPhoto} guestDisplayName={guestDisplayName} action={action} />
        )}
        music={music === undefined ? null : <MusicControl music={music} />}
        {...(music === undefined ? {} : { onOpen: startMusicOnOpen(music) })}
      >
        {pages.families === undefined ? null : <Families number={pages.families} families={families} />}
        {pages.couple === undefined ? null : <Couple number={pages.couple} people={couple} story={loveStory} storyPhoto={storyPhoto} />}
        {pages.invitation === undefined ? null : (
          <Invitation
            number={pages.invitation}
            people={people}
            ceremony={ceremony}
            ceremonyDate={ceremonyDate}
            cards={viewModel.ceremonyCards}
            guestDisplayName={guestDisplayName}
          />
        )}
        {pages.date === undefined ? null : (
          <DateSection
            number={pages.date}
            ceremony={ceremony}
            ceremonyDate={ceremonyDate}
            countdown={capabilities.clock === undefined ? null : <Countdown ceremony={ceremony} clock={capabilities.clock} />}
          />
        )}
        {pages.gallery === undefined ? null : <Gallery number={pages.gallery} gallery={gallery} />}
        {pages.rsvpGift === undefined ? null : (
          <RsvpGift
            number={pages.rsvpGift}
            rsvp={capabilities.rsvp === undefined ? null : <Rsvp rsvp={capabilities.rsvp} />}
            gift={panels.length === 0 ? null : <Gift panels={panels} clipboard={capabilities.clipboard} />}
          />
        )}
        {pages.thanks === undefined ? null : <ThankYou number={pages.thanks} people={people} ceremonyDate={ceremonyDate} photo={thankYouPhoto} />}
        <footer className={styles.footer}>
          <span className={styles.footerRule} aria-hidden="true" />
          <span className={styles.footerTitle}>{OUR_WEDDING_STORY_V1_COPY.footer}</span>
        </footer>
        <SectionReveal hasCountdown={capabilities.clock !== undefined} />
      </OpeningStage>
    </div>
  );
}
