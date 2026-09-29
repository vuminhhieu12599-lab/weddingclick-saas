import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

interface InvitationMessageProps {
  message: string;
}

/**
 * `content.invitationMessage` rendered verbatim as text (P7): no token
 * substitution, no templating, no HTML. Visibility is decided by the caller
 * from `sections.invitationMessage` only.
 */
export function InvitationMessage({ message }: InvitationMessageProps) {
  return (
    <section className={styles.section} aria-labelledby="ee-message-heading">
      <h2 id="ee-message-heading" className={styles.sectionHeading}>
        {ELEGANT_EDITORIAL_V1_COPY.message.heading}
      </h2>
      <p className={styles.message}>{message}</p>
    </section>
  );
}
