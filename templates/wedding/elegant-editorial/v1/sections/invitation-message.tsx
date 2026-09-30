import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

const COPY = ELEGANT_EDITORIAL_V1_COPY;

interface InvitationMessageProps {
  /** `viewModel.guest.displayName`, or `undefined` for an unpersonalized invitation. */
  guestDisplayName: string | undefined;
  /** `content.invitationMessage` when `sections.invitationMessage` is on, otherwise `null`. */
  message: string | null;
}

/**
 * Task029 invitation-message composition (Design Baseline B5 item 8, D1).
 *
 * The guest line comes first: "Trân trọng kính mời {displayName}", or the
 * fixed "Quý khách" when unpersonalized. The display name is presentation
 * text only, never identity (RF-03 V1, RF-05 K20), and it is never
 * interpolated into the message. The canonical message follows verbatim as
 * text (P7): no token substitution, no templating, no HTML. Visibility of
 * the message is decided by the caller from `sections.invitationMessage`
 * only; the guest line is not an optional section and always renders.
 */
export function InvitationMessage({ guestDisplayName, message }: InvitationMessageProps) {
  const guestLine = (
    <p className={styles.guestLine} data-guest={guestDisplayName === undefined ? "unpersonalized" : "personalized"}>
      {COPY.opening.salutation}{" "}
      <span className={styles.guestName}>{guestDisplayName ?? COPY.opening.defaultGuest}</span>
    </p>
  );

  if (message === null) {
    return <div className={styles.messageBand}>{guestLine}</div>;
  }

  return (
    <section className={styles.messageBand} aria-labelledby="ee-message-heading">
      <h2 id="ee-message-heading" className={styles.srOnly}>
        {COPY.message.heading}
      </h2>
      {guestLine}
      <p className={styles.message}>{message}</p>
    </section>
  );
}
