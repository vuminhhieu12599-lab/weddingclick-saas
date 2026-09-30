import { deriveCeremonyMonthGridV1 } from "../../../../lib/invitation-rendering/ceremony-month-grid";
import { deriveEventDateTimePresentationV1 } from "../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationRendererPropsV1 } from "../../../../lib/invitation-rendering/renderer-component";
import { ELEGANT_EDITORIAL_V1_COPY } from "./copy";
import styles from "./elegant-editorial-v1.module.css";
import { ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME } from "./fonts";
import { Countdown } from "./interactive/countdown";
import { MusicControl } from "./interactive/music-control";
import { Rsvp } from "./interactive/rsvp";
import { ELEGANT_EDITORIAL_V1_PALETTE_STYLE } from "./palette";
import { Calendar } from "./sections/calendar";
import { Ceremony } from "./sections/ceremony";
import { Closing } from "./sections/closing";
import { Couple } from "./sections/couple";
import { Events } from "./sections/events";
import { Families } from "./sections/families";
import { Gallery } from "./sections/gallery";
import { Gift } from "./sections/gift";
import { Hero } from "./sections/hero";
import { InvitationMessage } from "./sections/invitation-message";
import { LoveStory } from "./sections/love-story";
import { OpeningCover } from "./sections/opening-cover";

/**
 * Elegant Editorial v1 — the first production invitation renderer
 * (`wedding.elegant-editorial.v1`; docs/DECISIONS.md "RF-06-0 First
 * Production Renderer Contract Clarification" P1, P7–P13, P26).
 *
 * RF-06B static renderer. It reads only the frozen RF-05 K6 props:
 * `viewModel` (canonical data with runtime media URLs), `sections` (the only
 * visibility authority for the five optional sections, K7/P8) and
 * `capabilities`. It never receives a manifest, Snapshot or token, never
 * touches a database, storage, environment, browser global or current time,
 * and computes no date, weekday, calendar or lunar value itself: every
 * temporal part comes from the RF-05C derivations.
 *
 * Client-compatible (rendered under the client host). The root and its
 * static sections stay pure: no hooks, no state, no effects. RF-06D adds
 * the interactive islands under `interactive/`, and this root is the only
 * place that reads `capabilities`, solely to gate them (absent never means
 * success):
 *
 * - opening envelope and gift dialog: always, from canonical data only;
 * - countdown: only while `capabilities.clock` is present (K29);
 * - music control: only when `sections.music` **and** `capabilities.music`
 *   are present; otherwise nothing music-related at all (P35);
 * - copy control: only with `capabilities.clipboard` (P34);
 * - RSVP: only with `capabilities.rsvp` (K19, P30); production supplies none.
 */
export function ElegantEditorialV1({ viewModel, sections, capabilities }: InvitationRendererPropsV1) {
  const { people, families, ceremony, events, content, gift, media, operationalSides } = viewModel;
  const ceremonyDate = deriveEventDateTimePresentationV1(ceremony);
  const monthGrid = deriveCeremonyMonthGridV1(viewModel);
  const coupleText = `${people.primary.name} ${ELEGANT_EDITORIAL_V1_COPY.a11y.and} ${people.secondary.name}`;

  // `sections.*` alone decides visibility. The null checks below only narrow
  // the types: RF-04 R9 makes a visible section with null content impossible.
  const invitationMessage = sections.invitationMessage ? content.invitationMessage : null;
  const loveStory = sections.loveStory ? content.loveStory : null;

  return (
    <div
      className={`${ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME} ${styles.root}`}
      style={ELEGANT_EDITORIAL_V1_PALETTE_STYLE}
      data-renderer="elegant-editorial-v1"
      data-variant={viewModel.variant}
    >
      <main className={styles.column}>
        <OpeningCover people={people} guest={viewModel.guest} ceremonyDate={ceremonyDate} />
        <Hero people={people} ceremony={ceremony} cover={media.cover} ceremonyDate={ceremonyDate} />
        <Couple people={people} />
        {invitationMessage !== null ? <InvitationMessage message={invitationMessage} /> : null}
        <Families families={families} />
        <Ceremony ceremony={ceremony} ceremonyDate={ceremonyDate} />
        <Calendar grid={monthGrid} />
        {capabilities.clock !== undefined ? <Countdown ceremony={ceremony} clock={capabilities.clock} /> : null}
        <Events events={events} />
        {loveStory !== null ? <LoveStory story={loveStory} /> : null}
        {sections.gift ? (
          <Gift operationalSides={operationalSides} gift={gift} qr={media.qr} clipboard={capabilities.clipboard} />
        ) : null}
        {sections.gallery ? <Gallery gallery={media.gallery} coupleText={coupleText} /> : null}
        {capabilities.rsvp !== undefined ? (
          <Rsvp rsvp={capabilities.rsvp} personalized={viewModel.guest !== undefined} />
        ) : null}
        <Closing people={people} ceremonyDate={ceremonyDate} />
      </main>
      {sections.music && capabilities.music !== undefined ? <MusicControl music={capabilities.music} /> : null}
    </div>
  );
}
