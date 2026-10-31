import { HONG_AN_V1_COPY } from "../copy";
import styles from "../hong-an-v1.module.css";
import { ArchPanel, SectionHeading } from "./arch";

const COPY = HONG_AN_V1_COPY.invitation;

/**
 * Section 04 — "Hân Hoan Báo Tin" (HA-TEMPLATE-01).
 *
 * The Project's own invitation wording, centred inside the template's arch.
 * The customer's text always wins; the template's wording appears only when
 * the Project has none, and is never mixed with it.
 *
 * GUEST PERSONALIZATION. The guest line is the authorized overlay's
 * free-form `display_name`, printed exactly as given (CLAUDE.md §10): no
 * honorific is added, no name is parsed or title-cased, and nothing here is
 * identity or authorization. With no overlay the line is simply absent —
 * never "Quý khách", never a placeholder.
 */
export function Invitation({
  message,
  guestDisplayName,
}: {
  readonly message: string | null;
  readonly guestDisplayName: string | undefined;
}) {
  const body = message === null || message.trim() === "" ? COPY.fallbackMessage : message;

  return (
    <section className={styles.section} aria-labelledby="ha-invitation-heading" data-reveal="rise">
      <SectionHeading id="ha-invitation-heading">{COPY.heading}</SectionHeading>

      <ArchPanel className={styles.invitationPanel}>
        {guestDisplayName === undefined ? null : (
          <p className={styles.guestLine}>
            <span className={styles.guestLabel}>{COPY.guestLabel}</span>
            <span className={styles.guestName}>{guestDisplayName}</span>
          </p>
        )}
        <p className={styles.invitationMessage}>{body}</p>
      </ArchPanel>
    </section>
  );
}
