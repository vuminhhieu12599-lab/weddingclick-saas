import { deriveCeremonyCountdownV1 } from "../../../../../lib/invitation-rendering/ceremony-countdown";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { ClockCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { HONG_AN_V1_COPY } from "../copy";
import styles from "../hong-an-v1.module.css";
import { SectionHeading } from "../sections/arch";

const COPY = HONG_AN_V1_COPY.countdown;

/** The four fields, in the approved order. */
export const HONG_AN_COUNTDOWN_UNITS = ["days", "hours", "minutes", "seconds"] as const;

export type HongAnCountdownUnit = (typeof HONG_AN_COUNTDOWN_UNITS)[number];

export interface CountdownField {
  readonly unit: HongAnCountdownUnit;
  readonly value: string;
}

/**
 * The approved field values, or `null` once the canonical instant has been
 * reached or passed — the shared derivation reports both as `hasPassed`,
 * and the approved composition shows one line for both.
 *
 * Hours, minutes and seconds are padded to two digits so the row's width
 * cannot change as the seconds turn. The only target is
 * `ceremony.startsAt` and the only current time is `clock.nowEpochMs`:
 * nothing here reads a clock, there is no interval of its own, and the
 * duration arithmetic is the shared one — so the countdown can never
 * disagree with the date printed elsewhere on the invitation
 * (CLAUDE.md §7). Negative values are impossible by construction.
 */
export function countdownFields(
  ceremony: InvitationViewModel["ceremony"],
  clock: ClockCapabilityV1,
): readonly CountdownField[] | null {
  const countdown = deriveCeremonyCountdownV1({ ceremony }, clock);
  if (countdown.hasPassed) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    { unit: "days", value: String(countdown.days) },
    { unit: "hours", value: pad(countdown.hours) },
    { unit: "minutes", value: pad(countdown.minutes) },
    { unit: "seconds", value: pad(countdown.seconds) },
  ];
}

/**
 * Section 03 — "Chờ Ngày Hồng Ân" (HA-TEMPLATE-01).
 *
 * Four ivory fields under gold hairlines, tabular numerals so nothing
 * shifts as the seconds turn, and a small cross beneath. Each field is a
 * `<dt>`/`<dd>` pair with the LABEL BEFORE the value in the DOM, so a
 * screen reader says "Ngày 12" rather than four bare numbers; the
 * stylesheet reverses the column visually so the figure still sits above
 * its label. `role="timer"` marks it a live count without announcing every
 * tick.
 *
 * NO TIMER AND NO MOTION LIVE HERE. The island renders the clock it is
 * given; the host's shared clock adapter owns the refresh cadence, as it
 * does for every other production renderer (CLAUDE.md §20). Nothing in the
 * section animates, so the reduced-motion path is simply the finished row.
 *
 * Rendered only while `capabilities.clock` exists — which is after mount —
 * so no current time ever enters server markup.
 */
export function Countdown({
  ceremony,
  clock,
}: {
  readonly ceremony: InvitationViewModel["ceremony"];
  readonly clock: ClockCapabilityV1;
}) {
  const fields = countdownFields(ceremony, clock);

  return (
    <section
      className={styles.section}
      data-countdown={fields === null ? "passed" : "upcoming"}
      aria-labelledby="ha-countdown-heading"
      data-reveal-section
    >
      <SectionHeading id="ha-countdown-heading">{COPY.heading}</SectionHeading>

      {fields === null ? (
        <p className={styles.countdownArrived}>{COPY.arrived}</p>
      ) : (
        <dl className={styles.countdownFields} role="timer" aria-label={COPY.label}>
          {fields.map((field) => (
            <div key={field.unit} className={styles.countdownField}>
              <dt className={styles.countdownUnit}>{COPY.units[field.unit]}</dt>
              <dd className={styles.countdownValue}>{field.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <span className={styles.countdownCross} aria-hidden="true" />
    </section>
  );
}
