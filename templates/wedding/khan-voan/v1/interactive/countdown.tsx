import { deriveCeremonyCountdownV1 } from "../../../../../lib/invitation-rendering/ceremony-countdown";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { ClockCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { KHAN_VOAN_V1_COPY } from "../copy";
import styles from "../khan-voan-v1.module.css";

const COPY = KHAN_VOAN_V1_COPY.countdown;

type CountdownUnit = keyof typeof COPY.units;

export function Countdown({ ceremony, clock }: { ceremony: InvitationViewModel["ceremony"]; clock: ClockCapabilityV1 }) {
  const countdown = deriveCeremonyCountdownV1({ ceremony }, clock);
  if (countdown.hasPassed) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  const parts: readonly { unit: CountdownUnit; value: string }[] = [
    { unit: "days", value: String(countdown.days) },
    { unit: "hours", value: pad(countdown.hours) },
    { unit: "minutes", value: pad(countdown.minutes) },
    { unit: "seconds", value: pad(countdown.seconds) },
  ];
  return (
    <div className={`${styles.countdown} ${styles.reveal}`} role="group" aria-label={COPY.heading} data-countdown="upcoming">
      <p className={styles.countdownTitle} aria-hidden="true">
        <span className={styles.foil}>{COPY.heading}</span>
      </p>
      <ol className={styles.countdownRow} role="timer">
        {parts.map((part) => (
          <li key={part.unit}>
            <b>{part.value}</b>
            <small>{COPY.units[part.unit]}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
