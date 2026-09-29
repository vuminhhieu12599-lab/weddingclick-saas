import { deriveCeremonyMonthGridV1 } from "../../../../lib/invitation-rendering/ceremony-month-grid";
import { deriveEventDateTimePresentationV1 } from "../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationRendererPropsV1 } from "../../../../lib/invitation-rendering/renderer-component";
import { ELEGANT_EDITORIAL_V1_COPY } from "./copy";
import styles from "./elegant-editorial-v1.module.css";
import { ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME } from "./fonts";
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
 * Client-compatible (rendered under the client host) but pure: no hooks,
 * no state, no effects. RF-06B renders no capability-driven UI, so
 * `capabilities` is intentionally not read yet: no RSVP block (K19/P30),
 * no music control or indicator (P35), no countdown (K27), no copy control
 * (P34). Those arrive in RF-06C/D.
 */
export function ElegantEditorialV1({ viewModel, sections }: InvitationRendererPropsV1) {
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
        <Events events={events} />
        {loveStory !== null ? <LoveStory story={loveStory} /> : null}
        {sections.gift ? <Gift operationalSides={operationalSides} gift={gift} qr={media.qr} /> : null}
        {sections.gallery ? <Gallery gallery={media.gallery} coupleText={coupleText} /> : null}
        <Closing people={people} ceremonyDate={ceremonyDate} />
      </main>
    </div>
  );
}
