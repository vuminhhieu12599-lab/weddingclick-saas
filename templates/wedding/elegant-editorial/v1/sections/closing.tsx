import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { formatDottedDate } from "./date-text";
import { CoupleAmpersand, decorAssetSrc } from "./decor";

const COPY = ELEGANT_EDITORIAL_V1_COPY.closing;

interface ClosingProps {
  people: InvitationViewModel["people"];
  ceremonyDate: EventDateTimePresentationV1;
}

/**
 * Task029 closing bookend (Design Baseline B5 item 17): the dark moss
 * gradient band, the gold ❧ (the moss production fleuron, tinted gold by
 * renderer CSS), the exact Task029 thank-you copy as one flowing italic
 * paragraph, the couple names in white-soft and the dotted RF-05C ceremony
 * date in gold. The heading is an accessible name only.
 */
export function Closing({ people, ceremonyDate }: ClosingProps) {
  return (
    <footer className={styles.closing} aria-labelledby="ee-closing-heading">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed v1 decor file, rendered at its designed size */}
      <img
        className={styles.closingOrnament}
        src={decorAssetSrc("ornament-fleuron.svg")}
        alt=""
        aria-hidden="true"
        width={30}
        height={22}
        loading="lazy"
        decoding="async"
      />
      <h2 id="ee-closing-heading" className={styles.srOnly}>
        {COPY.heading}
      </h2>
      <p className={styles.closingLine}>{COPY.line}</p>
      <p className={styles.closingNames}>
        <span className={styles.name}>{people.primary.name}</span>
        <CoupleAmpersand />
        <span className={styles.name}>{people.secondary.name}</span>
      </p>
      <p className={styles.closingDate}>{formatDottedDate(ceremonyDate)}</p>
    </footer>
  );
}
