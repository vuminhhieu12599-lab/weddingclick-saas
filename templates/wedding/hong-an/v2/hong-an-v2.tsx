import { deriveEventDateTimePresentationV1 } from "../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationRendererPropsV1 } from "../../../../lib/invitation-rendering/renderer-component";
import { HONG_AN_V2_COPY } from "./copy";
import { HONG_AN_V2_FONT_VARIABLES_CLASS_NAME } from "./fonts";
import styles from "./hong-an-v2.module.css";
import { Countdown } from "./interactive/countdown";
import { Gallery } from "./interactive/gallery";
import { Gift } from "./interactive/gift";
import { MusicControl } from "./interactive/music-control";
import { OpeningStage } from "./interactive/opening-stage";
import { Rsvp } from "./interactive/rsvp";
import { SectionReveal } from "./interactive/section-reveal";
import { Ceremony } from "./sections/ceremony";
import { Closing } from "./sections/closing";
import { receptionEvents } from "./sections/event-selection";
import { Families } from "./sections/families";
import { giftPanels } from "./sections/gift-panels";
import { Invitation } from "./sections/invitation";
import { LoveStory } from "./sections/love-story";
import { allResolved, firstResolved } from "./sections/photo-frame";
import { Reception } from "./sections/reception";
import { Scripture } from "./sections/scripture";
import { resolveScriptureQuote } from "./sections/scripture-quote";
import { Timeline } from "./sections/timeline";

const COPY = HONG_AN_V2_COPY;

/**
 * Hồng Ân v2 — `wedding.hong-an.v2` (HA-TEMPLATE-01, HA-CONTENT-01).
 *
 * The Catholic wedding template: a light Gothic cathedral opening onto the
 * couple's own photograph, then a long, calm scroll of ivory, champagne
 * gold and stone. The opening is the Product-Owner-approved V4 artwork with
 * the HA-OPEN-03 typography fix, integrated unchanged.
 *
 * v2 IS v1's PRESENTATION-IDENTICAL SUCCESSOR. The single difference is
 * that the Scripture quote is Staff-configurable (HA-CONTENT-01): the two
 * optional `designSettings` this version's manifest declares are resolved
 * once by `sections/scripture-quote.ts` and shown in the same two approved
 * places. Styling, typography, animation, layout, spacing, the fourteen
 * sections and the RSVP / Gift / Gallery / Music behaviour are untouched,
 * and a Project that configures neither setting renders exactly what v1
 * renders. v1 itself is not modified by HA-CONTENT-01, so invitations
 * already reviewed or published on it are unaffected.
 *
 * Reads only the frozen RF-05 K6 props: `viewModel` (canonical data with
 * runtime media URLs), `sections` (the ONLY visibility authority for
 * optional sections) and `capabilities` (presence gates only). It never
 * receives a Snapshot, manifest or token, never touches Supabase, storage,
 * environment, a browser global or the current time, and derives every
 * temporal part from the shared RF-05C derivations.
 *
 * VARIANTS. Not one GROOM/BRIDE rule is implemented here. `people.primary`
 * / `people.secondary`, `families.groom` / `families.bride`,
 * `ceremony.title` and `ceremonyCards` all arrive already resolved by the
 * one central variant resolver; this renderer only places and labels them,
 * and always by each value's own explicit `side`, never by array position
 * (CLAUDE.md §5/§6). The Rule of Three is answered identically for all
 * three: same page order, same sections, resolver-ordered people and
 * families, the variant's own rite title, and one ceremony card per
 * operational side — two on COMMON, one on GROOM and BRIDE.
 *
 * PAGE ORDER, the approved fourteen parts: the opening doors (01) resolving
 * into the photo hero (02), then the countdown (03), the invitation wording
 * (04), the two houses (05), the ceremony (06), the reception (07), the
 * love story (08), the album (09), the run-of-show (10), the Scripture
 * (11), the reply card (12), the wedding gift (13) and the thank-you (14).
 *
 * VISIBILITY IS NEVER GUESSED. Every optional section is gated on
 * `sections.*` — the RF-04 effective visibility — and then on its content
 * actually existing. A section with nothing honest to show is not rendered
 * at all; nothing is padded, defaulted or invented.
 *
 * CAPABILITIES ARE PRESENCE GATES. The countdown exists exactly while the
 * host supplies `clock`, which it does only in the browser, so no current
 * time reaches server markup. The reply card appears only where an RSVP
 * capability can really record a reply. The copy and save controls appear
 * only with their own capability. Music is guest-triggered only: this
 * renderer never calls `play()` itself.
 *
 * MEDIA. Photographs come only from `viewModel.media.templateSlots`, the
 * slots this template's editor manifest declares: `openingPhoto` (the
 * photograph behind the doors, which becomes the hero), `storyPhoto`,
 * `closingPhoto` and the unbounded `gallery`. No legacy media role is read.
 * Each single frame takes the first RESOLVED item of its OWN slot; the
 * album takes the RESOLVED photographs of the `gallery` slot in the
 * customer's order. An absent, empty or UNAVAILABLE slot omits its frame —
 * never filled from another slot, another role or demo art, and never the
 * same photograph twice (docs/DECISIONS.md M6–M10).
 */
export function HongAnV2({ viewModel, sections, capabilities }: InvitationRendererPropsV1) {
  const { people, families, ceremony, content, gift, media, events, operationalSides } = viewModel;
  const ceremonyDate = deriveEventDateTimePresentationV1(ceremony);
  // HA-CONTENT-01: resolved ONCE, so the opening and the “Lối Chúa”
  // section can never show different words.
  const scripture = resolveScriptureQuote(viewModel.design);
  const dateLine = `${ceremonyDate.day} · ${ceremonyDate.month} · ${ceremonyDate.year}`;

  // The editor manifest's slot keys, each read once.
  const slots = media.templateSlots;
  const openingPhoto = firstResolved(slots?.openingPhoto);
  const storyPhoto = firstResolved(slots?.storyPhoto);
  const closingPhoto = firstResolved(slots?.closingPhoto);
  const album = allResolved(slots?.gallery);

  const coupleNames = `${people.primary.name} & ${people.secondary.name}`;
  const photoAlt = `${COPY.opening.photoAltPrefix} ${coupleNames}`;
  const albumAlt = (position: number) => `${photoAlt} — ${COPY.gallery.counter(position, album.length)}`;

  // `sections.*` alone decides visibility; the content checks only narrow types.
  const invitationMessage = sections.invitationMessage ? content.invitationMessage : null;
  const loveStory = sections.loveStory ? content.loveStory : null;
  const showAlbum = sections.gallery && album.length > 0;
  // Each step keeps its own hour: nothing here is derived from, or compared
  // with, the ceremony or the reception.
  const timeline = sections.timeline ? content.timeline : [];
  // The host builds a music capability only for `sections.music` plus a
  // RESOLVED audio slot, so presence alone is the gate: no disabled control.
  const music = sections.music ? capabilities.music : undefined;
  const panels = sections.gift ? giftPanels(operationalSides, gift, media.qr) : [];
  const receptions = receptionEvents(events);

  return (
    <div
      className={`${HONG_AN_V2_FONT_VARIABLES_CLASS_NAME} ${styles.page}`}
      data-renderer="hong-an-v2"
      data-variant={viewModel.variant}
    >
      <OpeningStage
        brand={COPY.brand}
        eyebrow={COPY.eyebrow}
        primaryName={people.primary.name}
        secondaryName={people.secondary.name}
        dateLine={dateLine}
        dateTime={ceremony.startsAt}
        verse={scripture.verse}
        verseReference={scripture.reference}
        photo={openingPhoto}
        photoAlt={photoAlt}
        floatingControl={music === undefined ? undefined : <MusicControl music={music} />}
      >
        <SectionReveal />

        {capabilities.clock === undefined ? null : <Countdown ceremony={ceremony} clock={capabilities.clock} />}

        {invitationMessage === null && viewModel.guest === undefined ? null : (
          <Invitation message={invitationMessage} guestDisplayName={viewModel.guest?.displayName} />
        )}

        <Families families={families} />

        <Ceremony cards={viewModel.ceremonyCards} ceremony={ceremony} />

        <Reception events={receptions} />

        {loveStory === null ? null : <LoveStory story={loveStory} photo={storyPhoto} photoAlt={photoAlt} />}

        {showAlbum ? <Gallery photos={album} altFor={albumAlt} /> : null}

        {timeline.length === 0 ? null : <Timeline items={timeline} />}

        <Scripture quote={scripture} />

        {capabilities.rsvp === undefined ? null : <Rsvp rsvp={capabilities.rsvp} />}

        {panels.length === 0 ? null : (
          <Gift panels={panels} clipboard={capabilities.clipboard} download={capabilities.download} />
        )}

        <Closing
          primaryName={people.primary.name}
          secondaryName={people.secondary.name}
          photo={closingPhoto}
          photoAlt={photoAlt}
        />
      </OpeningStage>
    </div>
  );
}
