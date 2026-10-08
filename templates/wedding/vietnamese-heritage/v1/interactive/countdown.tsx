import { deriveCeremonyCountdownV1 } from "../../../../../lib/invitation-rendering/ceremony-countdown";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { ClockCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.countdown;

type CountdownUnit = keyof typeof COPY.units;

export interface CountdownPart {
  readonly unit: CountdownUnit;
  readonly value: string;
}

/**
 * The four Task 029 cells from the frozen RF-05C derivation, or `null` once
 * the ceremony has passed (the approved Vietnamese Heritage direction then
 * simply hides the countdown; no negative value, no "ended" message). The
 * only target is `ceremony.startsAt`, the only current time
 * `clock.nowEpochMs`; nothing here reads a clock or computes a duration.
 */
export function ceremonyCountdownParts(ceremony: InvitationViewModel["ceremony"], clock: ClockCapabilityV1): readonly CountdownPart[] | null {
  const countdown = deriveCeremonyCountdownV1({ ceremony }, clock);
  if (countdown.hasPassed) return null;
  return [
    { unit: "days", value: String(countdown.days) },
    { unit: "hours", value: String(countdown.hours) },
    { unit: "minutes", value: String(countdown.minutes) },
    { unit: "seconds", value: String(countdown.seconds) },
  ];
}

/**
 * Vietnamese Heritage v1 live countdown (docs/DECISIONS.md "VH-02B-M1").
 * Rendered by the root only while `capabilities.clock` exists, which the
 * runtime host provides after mount only, so no current time ever enters
 * server-rendered markup; each clock refresh is an ordinary rerender.
 * Task 029 placement and look: on the ceremonial sheet after the schedule,
 * four unboxed cells (Ngày · Giờ · Phút · Giây) under a gold rule. Once the
 * ceremony has passed it renders nothing. `role="timer"` keeps the
 * per-second change out of polite announcements.
 */
export function Countdown({ ceremony, clock }: { ceremony: InvitationViewModel["ceremony"]; clock: ClockCapabilityV1 }) {
  const parts = ceremonyCountdownParts(ceremony, clock);
  if (parts === null) return null;
  return (
    <div className={styles.countdown} role="group" aria-label={COPY.heading} data-countdown="upcoming">
      <ol className={styles.countdownRow} role="timer">
        {parts.map((part) => (
          <li key={part.unit} className={styles.countdownCell}>
            <span className={styles.countdownValue}>{part.value}</span>
            <span className={styles.countdownLabel}>{COPY.units[part.unit]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
