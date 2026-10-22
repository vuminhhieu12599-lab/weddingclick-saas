import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import { SE_DUYEN_V1_COPY } from "../copy";
import styles from "../se-duyen-v1.module.css";
import { formatDottedDate } from "./date-text";
import { buildInvitationWording } from "./invitation-wording";

const COPY = SE_DUYEN_V1_COPY;

interface InvitationProps {
  /** `viewModel.ceremony.title` — the variant resolver's own value, verbatim. */
  readonly ceremonyTitle: string;
  /** `viewModel.content.invitationMessage`, exactly as the customer saved it. */
  readonly message: string | null;
  /** The authorized overlay's free-form display name; absent → the default line. */
  readonly guestDisplayName: string | undefined;
  /** Every part derived from the one canonical ceremony instant (RF-05C). */
  readonly ceremonyDate: EventDateTimePresentationV1;
  /** `viewModel.ceremony.lunarDateDisplay` — stored text, never computed here. */
  readonly lunarDateDisplay: string | null;
}

/**
 * The approved invitation introduction: the ivory silk plate.
 *
 * The plate is ARTWORK ONLY — a `border-image` on the card. Every word a
 * guest reads is DOM text, which is the asset README's own ground rule, so
 * no name, date or time is ever baked into a picture.
 *
 * The rite title comes from the central variant resolver and the weekday,
 * date and time from the single canonical instant through the shared RF-05C
 * derivation, so the four can never disagree (CLAUDE.md §7). The lunar line
 * is the Project's stored companion text, printed as given and never
 * presented as computed; it is omitted when the Project has none.
 */
export function Invitation({ ceremonyTitle, message, guestDisplayName, ceremonyDate, lunarDateDisplay }: InvitationProps) {
  const guestText = guestDisplayName ?? COPY.invitation.defaultGuest;
  const wording = buildInvitationWording({
    message,
    guestText,
    salutation: COPY.invitation.salutation,
    ceremonyTitle,
  });
  const lunar = lunarDateDisplay?.trim() ?? "";

  return (
    <section className={styles.invite} aria-labelledby="sd-invite-title">
      <div className={styles.inviteSeam} aria-hidden="true" />

      <div className={styles.inviteCard}>
        <div className={styles.inviteInner}>
          <p className={styles.inviteRite} id="sd-invite-title">
            {ceremonyTitle}
          </p>

          <p className={styles.inviteSalutation}>{COPY.invitation.salutation}</p>

          {wording.lead === "" ? null : <p className={styles.inviteMessage}>{wording.lead}</p>}

          <p className={styles.inviteGuest} data-guest={guestDisplayName === undefined ? "default" : "personalized"}>
            {guestText}
          </p>

          {wording.body === "" ? null : <p className={styles.inviteMessage}>{wording.body}</p>}

          <span className={styles.inviteThread} aria-hidden="true" />

          <div className={styles.inviteWhen}>
            <span className={styles.inviteWeekday}>{ceremonyDate.weekday}</span>
            <span className={styles.inviteDate}>{formatDottedDate(ceremonyDate)}</span>
            <span className={styles.inviteTime}>{ceremonyDate.time}</span>
          </div>

          {lunar === "" ? null : (
            <p className={styles.inviteLunar}>
              ({COPY.invitation.lunarPrefix} {lunar})
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
