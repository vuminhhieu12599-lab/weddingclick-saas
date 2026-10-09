import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";

const COPY = ROMANTIC_MINIMAL_V1_COPY.invite;

/** The Task 029 diamond rule (hairline · diamond · hairline). */
export function Ornament({ className }: { className?: string }) {
  return (
    <span className={className === undefined ? styles.ornament : `${styles.ornament} ${className}`} aria-hidden="true">
      <span />
      <span className={styles.ornamentDot} />
      <span />
    </span>
  );
}

/**
 * Task 029 invitation intro: the script salutation, then the guest line —
 * the authorized overlay's free-form `displayName` verbatim, else the fixed
 * "Quý Khách" — and the diamond rule. No free-text invitation message
 * (`invitationMessage: false`).
 */
export function Invite({ guestDisplayName }: { guestDisplayName: string | undefined }) {
  return (
    <section className={styles.invite}>
      <div className={styles.inviteSalutationWrap}>
        <p className={styles.inviteSalutation}>{COPY.salutation}</p>
      </div>
      <div className={styles.inviteGuestWrap}>
        <p className={styles.inviteGuest} data-guest={guestDisplayName === undefined ? "default" : "personalized"}>
          {guestDisplayName ?? COPY.defaultGuest}
        </p>
      </div>
      <div className={styles.inviteRuleWrap}>
        <Ornament />
      </div>
    </section>
  );
}
