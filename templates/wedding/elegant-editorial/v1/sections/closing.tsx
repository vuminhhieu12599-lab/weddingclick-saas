import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { formatDottedDate } from "./date-text";
import { OrnamentDivider } from "./decor";

const COPY = ELEGANT_EDITORIAL_V1_COPY.closing;

interface ClosingProps {
  people: InvitationViewModel["people"];
  ceremonyDate: EventDateTimePresentationV1;
}

/** Closing: fixed thank-you copy, the couple names and the RF-05C ceremony date. */
export function Closing({ people, ceremonyDate }: ClosingProps) {
  return (
    <footer className={styles.closing} aria-labelledby="ee-closing-heading">
      <OrnamentDivider className={styles.closingOrnament} />
      <h2 id="ee-closing-heading" className={styles.srOnly}>
        {COPY.heading}
      </h2>
      <p className={styles.closingLine}>{COPY.line}</p>
      <p className={styles.closingNames}>
        <span className={styles.nameLine}>{people.primary.name}</span>
        <span className={styles.closingAmp}> &amp; </span>
        <span className={styles.nameLine}>{people.secondary.name}</span>
      </p>
      <p className={styles.closingDate}>{formatDottedDate(ceremonyDate)}</p>
    </footer>
  );
}
