import type { CSSProperties } from "react";

import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { KHAN_VOAN_V1_COPY } from "../copy";
import styles from "../khan-voan-v1.module.css";
import { Monogram } from "./decor";
import { MediaImage } from "./media-image";
import { coverNameSize, dottedDate, initialOf, nameOf, spacedDate } from "./names";

const COPY = KHAN_VOAN_V1_COPY;

interface CoverProps {
  people: InvitationViewModel["people"];
  ceremonyDate: EventDateTimePresentationV1;
  photo: ResolvedMedia | undefined;
}

/** The cover under the veil: the couple's photo, their names and the day. */
export function Cover({ people, ceremonyDate, photo }: CoverProps) {
  const sizeStyle = { "--kv-name-size": coverNameSize(people.primary, people.secondary) } as CSSProperties;
  return (
    <div className={styles.cover} data-has-photo={photo === undefined ? "false" : "true"}>
      {photo === undefined ? null : <MediaImage media={photo} alt={COPY.cover.photoAlt} className={styles.coverPhoto} eager />}
      <div className={styles.coverText}>
        <p className={styles.coverKicker}>{COPY.cover.kicker}</p>
        <h1 className={styles.coverNames} style={sizeStyle}>
          <span>{nameOf(people.primary)}</span>
          <span className={styles.coverAmp} aria-hidden="true">
            &amp;
          </span>
          <span className={styles.srOnly}>{COPY.a11y.and}</span>
          <span>{nameOf(people.secondary)}</span>
        </h1>
        <p className={styles.coverDate}>{spacedDate(ceremonyDate)}</p>
        <p className={styles.coverWhen}>
          {ceremonyDate.weekday} · {ceremonyDate.time}
        </p>
        <span className={styles.coverCue} aria-hidden="true" />
      </div>
    </div>
  );
}

interface SealProps {
  people: InvitationViewModel["people"];
  ceremonyDate: EventDateTimePresentationV1;
  guestDisplayName: string | undefined;
}

/** What is written on the veil before it is lifted. */
export function Seal({ people, ceremonyDate, guestDisplayName }: SealProps) {
  const guest = guestDisplayName !== undefined && guestDisplayName.trim().length > 0 ? guestDisplayName : COPY.opening.defaultGuest;
  return (
    <>
      <p className={styles.sealKicker}>{COPY.opening.kicker}</p>
      <Monogram className={styles.monogram} first={initialOf(people.primary)} second={initialOf(people.secondary)} date={dottedDate(ceremonyDate)} />
      <p className={styles.sealTo}>{COPY.opening.salutation}</p>
      <p className={styles.sealGuest}>{guest}</p>
    </>
  );
}
