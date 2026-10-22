import { deriveEventDateTimePresentationV1 } from "../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationRendererPropsV1 } from "../../../../lib/invitation-rendering/renderer-component";
import { SE_DUYEN_V1_COPY } from "./copy";
import { SE_DUYEN_V1_FONT_VARIABLES_CLASS_NAME } from "./fonts";
import { OpeningStage } from "./interactive/opening-stage";
import styles from "./se-duyen-v1.module.css";
import { Ceremony } from "./sections/ceremony";
import { Closing } from "./sections/closing";
import { Couple } from "./sections/couple";
import { Families } from "./sections/families";
import { Invitation } from "./sections/invitation";
import { formatDottedDate } from "./sections/date-text";
import { resolvedOrNone } from "./sections/photo-frame";

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
 * closing.
 *
 * WHAT SD-V1-01 DELIBERATELY DOES NOT DO. The approved direction also has a
 * wedding gallery, a wedding-day timeline, a countdown, a gift envelope, a
 * music control and an RSVP form, and the prototype shows all of them — with
 * demo QR artwork, an inert music button and a local, unpersisted RSVP. None
 * of that is rendered here. A guest is never shown a control that looks like
 * working customer functionality and is not: the manifest declares `gallery`,
 * `music`, `gift` and `timeline` as sections this renderer cannot do, no
 * capability-backed island is mounted, and SD-V1-02 connects them for real.
 *
 * The scroll-reveal motion of the interior (the prototype's shared `Reveal`)
 * is also SD-V1-02 work: it belongs on the shared section-reveal controller
 * the other production renderers use, not on a second animation engine
 * (CLAUDE.md §20). The frozen layout, type and ornament are unaffected —
 * each section simply arrives already visible.
 *
 * MEDIA. Se Duyên V1 requires at least one real wedding photograph (Product
 * Owner decision, 2026-10-21): the opening is built around a photograph that
 * rises out of the box and grows into the hero, and this direction has no
 * approved opening without one. That requirement is enforced UPSTREAM, in
 * Se Duyên's editor readiness, never here — and it is not a publishing
 * block at this checkpoint. This renderer fills the frames it can and omits
 * the rest: an absent, empty or `UNAVAILABLE` slot is never filled from
 * another slot, another role, or demo art (docs/DECISIONS.md P7, M6–M10).
 * SD-V1-01 reads the canonical `media.cover` for the opening photograph and
 * `media.loveStoryPhoto` for the couple's frame; the eight art-directed
 * frames of the approved direction need Se Duyên's own template media slots,
 * which is SD-V1-02.
 */
export function SeDuyenV1({ viewModel, sections }: InvitationRendererPropsV1) {
  const { people, families, ceremony, content, media } = viewModel;
  const ceremonyDate = deriveEventDateTimePresentationV1(ceremony);
  const guestDisplayName = viewModel.guest?.displayName;

  const openingPhoto = resolvedOrNone(media.cover);
  const couplePhoto = resolvedOrNone(media.loveStoryPhoto);
  const photoAlt = `${COPY.hero.photoAltPrefix} ${people.primary.name} & ${people.secondary.name}`;

  // `sections.*` alone decides visibility; the null check only narrows types.
  const invitationMessage = sections.invitationMessage ? content.invitationMessage : null;
  const loveStory = sections.loveStory ? content.loveStory : null;

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
      >
        <Invitation
          ceremonyTitle={ceremony.title}
          message={invitationMessage}
          guestDisplayName={guestDisplayName}
          ceremonyDate={ceremonyDate}
          lunarDateDisplay={ceremony.lunarDateDisplay}
        />
        <Couple people={people} story={loveStory} photo={couplePhoto} photoAlt={photoAlt} />
        <Families families={families} />
        <Ceremony
          ceremonyTitle={ceremony.title}
          ceremonyDate={ceremonyDate}
          hostFamily={families.primary}
          cards={viewModel.ceremonyCards}
        />
        <Closing people={people} />
      </OpeningStage>
    </div>
  );
}
