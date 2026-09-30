import { deriveCeremonyCountdownV1 } from "../../../../../lib/invitation-rendering/ceremony-countdown";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { ClockCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

const COPY = ELEGANT_EDITORIAL_V1_COPY.countdown;

type CountdownUnit = keyof typeof COPY.units;

export interface CountdownPart {
  readonly unit: CountdownUnit;
  readonly value: string;
}

export type CeremonyCountdownDisplay =
  | { readonly state: "UPCOMING"; readonly parts: readonly CountdownPart[] }
  | { readonly state: "PASSED" };

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Presentation of the frozen RF-05C countdown (K27–K29): the only target is
 * `ceremony.startsAt`, the only current time is `clock.nowEpochMs`. This
 * never reads a clock, parses a date or computes a duration itself; it only
 * pads the already-derived parts. `hasPassed` becomes the fixed passed copy,
 * so no negative value is ever shown.
 */
export function ceremonyCountdownDisplay(
  ceremony: InvitationViewModel["ceremony"],
  clock: ClockCapabilityV1,
): CeremonyCountdownDisplay {
  const countdown = deriveCeremonyCountdownV1({ ceremony }, clock);
  if (countdown.hasPassed) return { state: "PASSED" };
  return {
    state: "UPCOMING",
    parts: [
      { unit: "days", value: String(countdown.days) },
      { unit: "hours", value: pad2(countdown.hours) },
      { unit: "minutes", value: pad2(countdown.minutes) },
      { unit: "seconds", value: pad2(countdown.seconds) },
    ],
  };
}

interface CountdownProps {
  ceremony: InvitationViewModel["ceremony"];
  clock: ClockCapabilityV1;
}

/**
 * RF-06D live countdown island. Rendered by the root only while
 * `capabilities.clock` is present, which the RF-06C host provides after
 * mount only, so no current time ever enters server-rendered markup. Each
 * clock refresh is a normal rerender with a new `nowEpochMs`. `role="timer"`
 * keeps the per-second change out of polite announcements.
 */
export function Countdown({ ceremony, clock }: CountdownProps) {
  const display = ceremonyCountdownDisplay(ceremony, clock);

  return (
    <section
      className={styles.countdown}
      aria-labelledby="ee-countdown-heading"
      data-countdown={display.state.toLowerCase()}
    >
      <h2 id="ee-countdown-heading" className={styles.countdownHeading}>
        {COPY.heading}
      </h2>
      {display.state === "PASSED" ? (
        <p className={styles.countdownPassed}>{COPY.passed}</p>
      ) : (
        <ol className={styles.countdownParts} role="timer">
          {display.parts.map((part) => (
            <li key={part.unit} className={styles.countdownPart}>
              <span className={styles.countdownValue}>{part.value}</span>
              <span className={styles.countdownUnit}>{COPY.units[part.unit]}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
