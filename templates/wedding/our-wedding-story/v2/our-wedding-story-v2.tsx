import { deriveEventDateTimePresentationV1 } from "../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationRendererPropsV1 } from "../../../../lib/invitation-rendering/renderer-component";
import { OUR_WEDDING_STORY_V2_COPY } from "./copy";
import { OUR_WEDDING_STORY_V2_FONT_VARIABLES_CLASS_NAME } from "./fonts";
import { Countdown } from "./interactive/countdown";
import { MusicControl } from "./interactive/music-control";
import { Rsvp } from "./interactive/rsvp";
import { SectionReveal } from "./interactive/section-reveal";
import styles from "./our-wedding-story-v2.module.css";
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
 * Our Wedding Story v2 — `wedding.our-wedding-story.v2` (docs/DECISIONS.md
 * "OWS-V2-01"). Same data contract, sections, slots and design keys as the
 * released v1 (never edited); v2 changes presentation only:
 *
 * - no opening gate: the cover is the first screen and the whole invitation
 *   is in the page from the first paint (nothing to tap, nothing hidden);
 * - the music control is present from the first paint and plays only on its
 *   own explicit tap (no gesture is borrowed from an opening tap);
 * - no "scroll down" or "tap a photo" helper text and no guest-name
 *   placeholder; a larger, full-ink wedding-gift note;
 * - a CSS-only motion system (cover choreography on load, per-role section
 *   reveals through the shared controller, limited native scroll-linked
 *   parallax, tactile controls), all inside `prefers-reduced-motion:
 *   no-preference`.
 *
 * Reads only the frozen RF-05 K6 props: `viewModel`, `sections` (the only
 * visibility authority for optional sections) and `capabilities` (presence
 * gates only). It never receives a manifest, Snapshot or token, never touches
 * a database, storage, environment, browser global or current time, and
 * derives every temporal part from the shared RF-05C derivations.
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
export function OurWeddingStoryV2({ viewModel, sections, capabilities }: InvitationRendererPropsV1) {
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
      className={`${OUR_WEDDING_STORY_V2_FONT_VARIABLES_CLASS_NAME} ${styles.root}`}
      data-renderer="our-wedding-story-v2"
      data-variant={viewModel.variant}
    >
      <main className={styles.column} data-music={music === undefined ? undefined : "present"}>
        {music === undefined ? null : <MusicControl music={music} />}
        <Cover people={people} ceremonyDate={ceremonyDate} photo={coverPhoto} guestDisplayName={guestDisplayName} />
        <div className={styles.body}>
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
              gift={panels.length === 0 ? null : <Gift panels={panels} clipboard={capabilities.clipboard} download={capabilities.download} />}
            />
          )}
          {pages.thanks === undefined ? null : <ThankYou number={pages.thanks} people={people} ceremonyDate={ceremonyDate} photo={thankYouPhoto} />}
          <footer className={styles.footer}>
            <span className={styles.footerRule} aria-hidden="true" />
            <span className={styles.footerTitle}>{OUR_WEDDING_STORY_V2_COPY.footer}</span>
          </footer>
          <SectionReveal hasCountdown={capabilities.clock !== undefined} />
        </div>
      </main>
    </div>
  );
}
