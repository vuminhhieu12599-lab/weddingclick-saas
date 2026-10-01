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

/**
 * Presentation of the frozen RF-05C countdown (K27–K29): the only target is
 * `ceremony.startsAt`, the only current time is `clock.nowEpochMs`. This
 * never reads a clock, parses a date or computes a duration itself; the
 * already-derived parts are shown unpadded, as Task029 shows them (Design
 * Baseline B5 item 12). `hasPassed` becomes the fixed Design Baseline D7
 * copy, so no negative value is ever shown.
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
      { unit: "hours", value: String(countdown.hours) },
      { unit: "minutes", value: String(countdown.minutes) },
      { unit: "seconds", value: String(countdown.seconds) },
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
 *
 * Task029 presentation (Design Baseline B5 item 12): ivory section, the
 * "Đếm ngược" kicker, four unboxed cells with a gold top rule. Once passed,
 * the kicker line carries "Ngày vui đã đến" (Design Baseline D7) in the same
 * kicker typography and the cells are gone.
 */
export function Countdown({ ceremony, clock }: CountdownProps) {
  const display = ceremonyCountdownDisplay(ceremony, clock);

  return (
    <section
      className={styles.countdown}
      aria-labelledby="ee-countdown-heading"
      data-countdown={display.state.toLowerCase()}
    >
      <h2 id="ee-countdown-heading" className={styles.countdownKicker}>
        {display.state === "PASSED" ? COPY.passed : COPY.heading}
      </h2>
      {display.state === "PASSED" ? null : (
        <ol className={styles.countdownRow} role="timer">
          {display.parts.map((part) => (
            <li key={part.unit} className={styles.countdownCell}>
              <span className={styles.countdownValue}>{part.value}</span>
              <span className={styles.countdownLabel}>{COPY.units[part.unit]}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
