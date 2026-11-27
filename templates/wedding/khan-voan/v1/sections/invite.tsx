import { KHAN_VOAN_V1_COPY } from "../copy";
import styles from "../khan-voan-v1.module.css";
import { Vine } from "./decor";

const COPY = KHAN_VOAN_V1_COPY;

interface InviteProps {
  guestDisplayName: string | undefined;
  /** Staff's own invitation wording; `null` keeps the template's default lead. */
  message: string | null;
}

export function Invite({ guestDisplayName, message }: InviteProps) {
  const guest = guestDisplayName !== undefined && guestDisplayName.trim().length > 0 ? guestDisplayName : COPY.opening.defaultGuest;
  const lead = message !== null && message.trim().length > 0 ? message : COPY.invite.lead;
  return (
    <section className={`${styles.section} ${styles.invite}`} aria-labelledby="kv-invite-heading">
      <Vine className={`${styles.vine} ${styles.reveal}`} />
      <h2 id="kv-invite-heading" className={`${styles.eyebrow} ${styles.reveal}`}>
        {COPY.invite.salutation}
      </h2>
      <p className={`${styles.inviteGuest} ${styles.reveal}`}>
        <span className={styles.foil}>{guest}</span>
      </p>
      <p className={`${styles.lead} ${styles.reveal}`}>{lead}</p>
    </section>
  );
}
