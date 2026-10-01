import type { InvitationViewModel, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { formatCoupleDisplayName } from "./display-name";
import { MediaImage } from "./media-image";

const COPY = ELEGANT_EDITORIAL_V1_COPY.couple;

/** Task029 portrait-story floral strip (size-optimized approved Task029 art, served from the immutable v1 decor path, P6). */
const FLORAL_DIVIDER_SRC = "/renderers/wedding/elegant-editorial/v1/portrait-divider-floral-strip.webp";

interface CoupleProps {
  people: InvitationViewModel["people"];
  /** `viewModel.media.portrait` as given (RF7 Product Owner amendment): optional per side. */
  portrait: InvitationViewModel["media"]["portrait"];
}

type CouplePerson = InvitationViewModel["people"]["primary"];

/** The person's own portrait, chosen by explicit side; only a `RESOLVED` slot ever renders an image. */
function portraitFor(portrait: CoupleProps["portrait"], side: CouplePerson["side"]): ResolvedMedia | null {
  const slot = side === "GROOM" ? portrait.groom : portrait.bride;
  return slot !== undefined && slot.status === "RESOLVED" ? slot : null;
}

/**
 * One couple block. With a `RESOLVED` portrait: the Task029 `portraitBlock`
 * (3:4 photo at 62% of the band, the label/name plate bottom-aligned beside
 * it; the `end` block mirrored). Otherwise (no portrait referenced, or
 * `UNAVAILABLE`): the existing typographic plate, honestly, with no image
 * frame and no substitute media.
 */
function CoupleBlock({ person, align, photo }: { person: CouplePerson; align: "start" | "end"; photo: ResolvedMedia | null }) {
  const role = COPY.roleBySide[person.side];
  const name = formatCoupleDisplayName(person.name);
  const plate = (
    <>
      <p className={styles.coupleRole}>{role}</p>
      <p className={styles.coupleName}>{name}</p>
    </>
  );

  if (photo === null) {
    return (
      <div className={styles.couplePlate} data-align={align} data-side={person.side}>
        {plate}
      </div>
    );
  }

  return (
    <div className={styles.couplePortraitBlock} data-align={align} data-side={person.side}>
      <MediaImage
        media={photo}
        alt={`${ELEGANT_EDITORIAL_V1_COPY.a11y.portraitImageAltBySide[person.side]} ${name}`}
        className={styles.couplePortrait}
      />
      <div className={styles.couplePortraitPlate}>{plate}</div>
    </div>
  );
}

/**
 * Task029 couple / portrait story (Design Baseline B5 item 6; RF7 Product
 * Owner amendment): the white-soft band carries the Great Vibes quote, the
 * primary block, the floral strip, then the mirrored secondary block. Order
 * is the ViewModel's primary → secondary (groom first for COMMON / GROOM,
 * bride first for BRIDE); each label and portrait is chosen by the person's
 * explicit `side`, never by position (RF5). Each side independently shows its
 * portrait or falls back to the typographic plate. The section heading is an
 * accessible name only.
 */
export function Couple({ people, portrait }: CoupleProps) {
  const [primary, secondary] = [people.primary, people.secondary];

  return (
    <section className={styles.coupleBand} aria-labelledby="ee-couple-heading">
      <h2 id="ee-couple-heading" className={styles.srOnly}>
        {COPY.heading}
      </h2>
      <p className={styles.coupleQuote}>
        {COPY.quote.map((line) => (
          <span key={line} className={styles.coupleQuoteLine}>
            {line}
          </span>
        ))}
      </p>
      <CoupleBlock person={primary} align="start" photo={portraitFor(portrait, primary.side)} />
      <div className={styles.coupleDivider} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed v1 decor file, rendered at its designed size */}
        <img className={styles.coupleDividerImage} src={FLORAL_DIVIDER_SRC} alt="" width={600} height={200} decoding="async" />
      </div>
      <CoupleBlock person={secondary} align="end" photo={portraitFor(portrait, secondary.side)} />
    </section>
  );
}
