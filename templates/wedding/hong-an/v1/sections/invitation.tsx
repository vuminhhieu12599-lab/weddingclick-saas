import { HONG_AN_V1_COPY } from "../copy";
import styles from "../hong-an-v1.module.css";

const COPY = HONG_AN_V1_COPY.invitation;

/**
 * Section 04 — the invitation itself (HA-TEMPLATE-01; composition
 * corrected in HA-FIX-04).
 *
 * Four lines that read as ONE ceremonial sentence:
 *
 *   TRONG HỒNG ÂN THIÊN CHÚA   the small Catholic kicker
 *   Trân Trọng Kính Mời        the dominant heading
 *   Anh Tuấn và gia đình       the authorized guest overlay
 *   đến hiệp lời cầu nguyện…   the configurable body
 *
 * There is no card and no stack of dividers: a single gold cross sits
 * above the kicker, one gold separator sits under the heading, and two
 * faint Gothic lancet windows stand in the margins beside the kicker and
 * heading (HA-DESIGN-02) — never behind the guest line or the message.
 *
 * THE BODY IS THE PROJECT'S. It comes from the canonical
 * `content.invitationMessage`, through the Snapshot and the ViewModel,
 * and is rendered exactly as authored — never trimmed of meaning, never
 * merged with the template's wording, never rewritten. The template's
 * own sentence appears only when a Project has configured none, which is
 * the contract's own empty case. Multi-line wording is preserved: the
 * stylesheet keeps the author's own line breaks.
 *
 * GUEST PERSONALIZATION STAYS SEPARATE from the message. The guest line
 * is the authorized overlay's free-form `display_name`, printed exactly
 * as given (CLAUDE.md §10): no honorific is added, no name is parsed or
 * title-cased, and nothing here is identity or authorization. With no
 * overlay the line is simply absent — never "Quý khách", never a
 * placeholder — and the remaining three lines still read as a sentence.
 */
export function Invitation({
  message,
  guestDisplayName,
}: {
  readonly message: string | null;
  readonly guestDisplayName: string | undefined;
}) {
  // A configured message wins outright. The template's sentence is used
  // only for the contract's empty case, never to "complete" a short one.
  const body = message === null || message.trim() === "" ? COPY.fallbackMessage : message;

  return (
    <section className={styles.sectionInvitation} aria-labelledby="ha-invitation-heading">
      <div className={styles.invitationBlock} data-reveal="rise">
        {/* The one decorative accent this section is allowed. */}
        <span className={styles.cross} aria-hidden="true" />

        <p className={styles.invitationKicker}>{COPY.kicker}</p>

        <h2 className={styles.invitationHeading} id="ha-invitation-heading">
          {COPY.heading}
        </h2>

        {/* HA-DESIGN-02: the refined gold separator under the heading. */}
        <span className={styles.invitationOrnament} aria-hidden="true" />

        {guestDisplayName === undefined ? null : (
          <p className={styles.guestName}>{guestDisplayName}</p>
        )}

        <p className={styles.invitationMessage}>{body}</p>
      </div>
    </section>
  );
}
