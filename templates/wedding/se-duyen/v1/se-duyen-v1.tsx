import { deriveEventDateTimePresentationV1 } from "../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationRendererPropsV1 } from "../../../../lib/invitation-rendering/renderer-component";
import { SE_DUYEN_V1_COPY } from "./copy";
import { SE_DUYEN_V1_FONT_VARIABLES_CLASS_NAME } from "./fonts";
import { Countdown } from "./interactive/countdown";
import { AlbumFrames } from "./interactive/gallery-viewer";
import { MusicControl } from "./interactive/music-control";
import { Rsvp } from "./interactive/rsvp";
import { OpeningStage } from "./interactive/opening-stage";
import { SectionReveal } from "./interactive/section-reveal";
import styles from "./se-duyen-v1.module.css";
import { Ceremony } from "./sections/ceremony";
import { Closing } from "./sections/closing";
import { Couple } from "./sections/couple";
import { Families } from "./sections/families";
import { Gift } from "./sections/gift";
import { giftPanels } from "./sections/gift-panels";
import { Gallery } from "./sections/gallery";
import { albumPhotos } from "./sections/gallery-frames";
import { Invitation } from "./sections/invitation";
import { Timeline } from "./sections/timeline";
import { formatDottedDate } from "./sections/date-text";
import { firstResolved } from "./sections/photo-frame";

const COPY = SE_DUYEN_V1_COPY;

/**
 * Se Duyên v1 — `wedding.se-duyen.v1` (SD-V1-01).
 *
 * The production renderer for the Product-Owner-approved "Se Duyên — Hộp
 * Cưới" direction, ported from its pilot v03 visual freeze (commit
 * `79971e3`). The prototype is a visual reference only: nothing here imports
 * prototype code, data or media, and every decorative file lives under the
 * renderer's own immutable version path (see PROVENANCE.md).
 *
 * Reads only the frozen RF-05 K6 props: `viewModel` (canonical data with
 * runtime media URLs), `sections` (the only visibility authority for
 * optional sections) and `capabilities` (presence gates only). It never
 * receives a manifest, Snapshot or token, never touches a database, storage,
 * environment, browser global or current time, and derives every temporal
 * part from the shared RF-05C derivations.
 *
 * VARIANTS. Not one GROOM/BRIDE rule is implemented here. `people.primary` /
 * `people.secondary`, `families.primary` / `families.secondary`,
 * `ceremony.title` and `ceremonyCards` all arrive already resolved by the
 * one central variant resolver, and this renderer only places and labels
 * them — by each value's own explicit `side`, never by array position
 * (CLAUDE.md §5/§6). The Rule of Three is therefore answered identically for
 * COMMON, GROOM and BRIDE: same page order, same sections, resolver-ordered
 * people and families, the variant's own rite title, and one ceremony card
 * per operational side (two on COMMON, one on GROOM and BRIDE).
 *
 * PAGE ORDER. Opening (box → hero) → the invitation introduction → the
 * couple → the two houses → the ceremony with its per-side rites → the
 * run-of-show → the countdown → the album → the RSVP → the wedding gift →
 * the closing, which is the approved order.
 *
 * RSVP is the public capability the `/i/[slug]` wrapper builds, so the card
 * appears only where a response can really be recorded: Staff Preview and
 * Customer Review supply an UNAVAILABLE-only capability, and the renderer
 * harness its own. The island never sees a token or a guest id — the server
 * derives the guest from the personalized route's own token — and never
 * prefills the name from the invitation's guest overlay.
 *
 * The countdown is not a section capability at all: it exists exactly while
 * the host supplies `capabilities.clock`, which it does only in the browser,
 * so no current time ever reaches server markup.
 *
 * The scroll-reveal motion of the interior is SD-V1-MOTION-01, and it is
 * where that header always said it would be: on the shared section-reveal
 * controller the other production renderers use, never a second animation
 * engine (CLAUDE.md §20). `interactive/section-reveal.tsx` holds the whole
 * of it — one `IntersectionObserver`, one attribute, one stylesheet
 * vocabulary — and it is scoped to the interior column, which is the
 * opening stage's sibling, so the frozen box sequence cannot be reached by
 * it. The frozen layout, type and ornament are unaffected: every target
 * settles into exactly its approved resting style, nothing is held back
 * from a reader without JavaScript, and under reduced motion each section
 * still simply arrives already visible.
 *
 * MEDIA. Layout photographs come only from `viewModel.media.templateSlots`
 * (`openingPhoto`, `portraitLead`, `portraitAside`, `closingPhoto` and the
 * unbounded `gallery`), the slots Se Duyên's editor manifest declares. No legacy media role is read:
 * not `media.cover`, `loveStoryPhoto`, `portrait`, `gallery`, `photoStory`,
 * `audio` or `qr`. The slot-key → frame mapping below is the one place the
 * editor's slot keys meet the frozen stylesheet's own variable stems.
 *
 * Each single frame takes the first RESOLVED item of its own slot and nothing
 * else; the album's four frames take the first four RESOLVED photographs of
 * the `gallery` slot, in the customer's own order. An absent, empty or
 * `UNAVAILABLE` slot omits its frame: never filled from another slot,
 * another role, or demo art, and never the same photograph twice
 * (docs/DECISIONS.md P7, M6–M10).
 *
 * Se Duyên V1 requires at least one real wedding photograph (Product Owner
 * decision, 2026-10-21): the opening is built around a photograph that rises
 * out of the box and grows into the hero, and this direction has no approved
 * opening without one. That requirement is enforced UPSTREAM, never here,
 * and it is not a publishing block at this checkpoint — with no
 * `openingPhoto` the box still opens onto the lacquer and the invitation
 * below it is complete.
 */
export function SeDuyenV1({ viewModel, sections, capabilities }: InvitationRendererPropsV1) {
  const { people, families, ceremony, content, gift, media, operationalSides } = viewModel;
  const ceremonyDate = deriveEventDateTimePresentationV1(ceremony);
  const guestDisplayName = viewModel.guest?.displayName;

  // The editor manifest's slot keys, each read once, in page order.
  const slots = media.templateSlots;
  const openingPhoto = firstResolved(slots?.openingPhoto);
  const portraitLead = firstResolved(slots?.portraitLead);
  const portraitAside = firstResolved(slots?.portraitAside);
  const closingPhoto = firstResolved(slots?.closingPhoto);
  const album = albumPhotos(slots?.gallery ?? []);
  const photoAlt = `${COPY.hero.photoAltPrefix} ${people.primary.name} & ${people.secondary.name}`;

  // `sections.*` alone decides visibility; the null check only narrows types.
  const invitationMessage = sections.invitationMessage ? content.invitationMessage : null;
  const loveStory = sections.loveStory ? content.loveStory : null;
  const showAlbum = sections.gallery && album.length > 0;
  // Each step keeps its own hour: nothing here is derived from, or compared
  // with, the ceremony or either side's reception (Product Owner rule).
  const timeline = sections.timeline ? content.timeline : [];
  // The host builds a music capability only for `sections.music` plus a
  // RESOLVED audio slot, so presence alone is the gate: no disabled disc.
  const music = sections.music ? capabilities.music : undefined;
  // Which families may appear, and whether any may at all, is the pure
  // model's answer over the resolver's own operational sides.
  const panels = sections.gift ? giftPanels(operationalSides, gift, media.qr) : [];

  return (
    <div
      className={`${SE_DUYEN_V1_FONT_VARIABLES_CLASS_NAME} ${styles.page}`}
      data-renderer="se-duyen-v1"
      data-variant={viewModel.variant}
    >
      <OpeningStage
        primaryName={people.primary.name}
        secondaryName={people.secondary.name}
        weekday={ceremonyDate.weekday}
        fullDate={formatDottedDate(ceremonyDate)}
        photo={openingPhoto}
        photoAlt={photoAlt}
        interiorMotion={<SectionReveal hasCountdown={capabilities.clock !== undefined} />}
      >
        {music === undefined ? null : <MusicControl music={music} />}
        <Invitation
          ceremonyTitle={ceremony.title}
          message={invitationMessage}
          guestDisplayName={guestDisplayName}
          ceremonyDate={ceremonyDate}
          lunarDateDisplay={ceremony.lunarDateDisplay}
        />
        <Couple people={people} story={loveStory} leadPhoto={portraitLead} asidePhoto={portraitAside} photoAlt={photoAlt} />
        <Families families={families} />
        <Ceremony
          ceremonyTitle={ceremony.title}
          ceremonyDate={ceremonyDate}
          hostFamily={families.primary}
          cards={viewModel.ceremonyCards}
        />
        {timeline.length === 0 ? null : <Timeline items={timeline} />}
        {capabilities.clock === undefined ? null : <Countdown ceremony={ceremony} clock={capabilities.clock} />}
        {showAlbum ? (
          <Gallery>
            <AlbumFrames gallery={slots?.gallery ?? []} />
          </Gallery>
        ) : null}
        {capabilities.rsvp === undefined ? null : <Rsvp rsvp={capabilities.rsvp} />}
        {panels.length === 0 ? null : <Gift panels={panels} clipboard={capabilities.clipboard} />}
        <Closing people={people} photo={closingPhoto} photoAlt={photoAlt} />
      </OpeningStage>
    </div>
  );
}
