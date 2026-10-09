import { deriveCeremonyCountdownV1 } from "../../../../../lib/invitation-rendering/ceremony-countdown";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { ClockCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";

const COPY = ROMANTIC_MINIMAL_V1_COPY.countdown;

type CountdownUnit = keyof typeof COPY.units;

export interface CountdownPart {
  readonly unit: CountdownUnit;
  readonly value: string;
}

/**
 * The four Task 029 tiles from the frozen RF-05C derivation (two-digit
 * padded, as the direction shows them), or `null` once the ceremony has
 * passed (the direction then hides the countdown). The only target is
 * `ceremony.startsAt`, the only current time `clock.nowEpochMs`.
 */
export function ceremonyCountdownParts(ceremony: InvitationViewModel["ceremony"], clock: ClockCapabilityV1): readonly CountdownPart[] | null {
  const countdown = deriveCeremonyCountdownV1({ ceremony }, clock);
  if (countdown.hasPassed) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    { unit: "days", value: pad(countdown.days) },
    { unit: "hours", value: pad(countdown.hours) },
    { unit: "minutes", value: pad(countdown.minutes) },
    { unit: "seconds", value: pad(countdown.seconds) },
  ];
}

/**
 * Romantic Minimal v1 countdown (docs/DECISIONS.md "RM-02"): script heading
 * over four soft cream tiles, between the rite date and the reception. Only
 * rendered while `capabilities.clock` exists (after mount), so no current
 * time enters server markup.
 */
export function Countdown({ ceremony, clock }: { ceremony: InvitationViewModel["ceremony"]; clock: ClockCapabilityV1 }) {
  const parts = ceremonyCountdownParts(ceremony, clock);
  if (parts === null) return null;
  return (
    <div className={styles.countdown} role="group" aria-label={COPY.heading} data-countdown="upcoming">
      <div className={styles.countdownHeading} aria-hidden="true">
        {COPY.heading}
      </div>
      <ol className={styles.countdownRow} role="timer">
        {parts.map((part) => (
          <li key={part.unit} className={styles.countdownUnit}>
            <span className={styles.countdownValue}>{part.value}</span>
            <span className={styles.countdownLabel}>{COPY.units[part.unit]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
