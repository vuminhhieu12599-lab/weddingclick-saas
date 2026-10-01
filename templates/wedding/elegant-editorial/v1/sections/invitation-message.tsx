import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

const COPY = ELEGANT_EDITORIAL_V1_COPY;

interface InvitationMessageProps {
  /** `viewModel.guest.displayName`, or `undefined` for an unpersonalized invitation. */
  guestDisplayName: string | undefined;
}

/**
 * Two-line invitation block (Product Owner ruling, Micro-Checkpoint 10;
 * supersedes Design Baseline D1): the "TRÂN TRỌNG KÍNH MỜI" kicker, then
 * the guest line, the trusted `viewModel.guest.displayName` or the fixed
 * "Quý khách" when unpersonalized. The display name is presentation text
 * only, never identity (RF-03 V1, RF-05 K20). Nothing else renders here:
 * Elegant Editorial v1 is not capable of the canonical invitation message
 * (manifest `sectionCapabilities.invitationMessage: false`), so no second
 * invitation sentence can repeat the kicker.
 */
export function InvitationMessage({ guestDisplayName }: InvitationMessageProps) {
  return (
    <div className={styles.messageBand} data-guest={guestDisplayName === undefined ? "unpersonalized" : "personalized"}>
      <p className={styles.guestKicker}>{COPY.opening.salutation}</p>
      <p className={styles.guestLine}>
        <span className={styles.guestName}>{guestDisplayName ?? COPY.opening.defaultGuest}</span>
      </p>
    </div>
  );
}
