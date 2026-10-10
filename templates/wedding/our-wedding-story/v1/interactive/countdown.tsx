import { deriveCeremonyCountdownV1 } from "../../../../../lib/invitation-rendering/ceremony-countdown";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { ClockCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import styles from "../our-wedding-story-v1.module.css";

const COPY = OUR_WEDDING_STORY_V1_COPY.date;

type CountdownUnit = keyof typeof COPY.units;

export interface CountdownPart {
  readonly unit: CountdownUnit;
  readonly value: string;
}

/**
 * The four Visual Freeze v1 units from the frozen RF-05C derivation
 * (two-digit padded), or `null` once the ceremony has passed. The only
 * target is `ceremony.startsAt`, the only current time `clock.nowEpochMs`.
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
 * Our Wedding Story v1 countdown (docs/DECISIONS.md "OWS-01"): four ruled
 * units inside the date panel, or "Ngày chung đôi đã đến" once passed. Only
 * rendered while `capabilities.clock` exists (after mount), so no current
 * time enters server markup.
 */
export function Countdown({ ceremony, clock }: { ceremony: InvitationViewModel["ceremony"]; clock: ClockCapabilityV1 }) {
  const parts = ceremonyCountdownParts(ceremony, clock);
  return (
    <div className={styles.countdown} data-countdown={parts === null ? "passed" : "upcoming"}>
      {parts === null ? (
        <p className={styles.countdownPassed}>{COPY.passed}</p>
      ) : (
        <ol className={styles.countdownRow} role="timer" aria-label={COPY.countdownLabel}>
          {parts.map((part) => (
            <li key={part.unit} className={styles.countdownUnit}>
              <span className={styles.countdownValue}>{part.value}</span>
              <span className={styles.countdownLabel}>{COPY.units[part.unit]}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
