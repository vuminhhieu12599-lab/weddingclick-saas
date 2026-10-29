import { deriveCeremonyCountdownV1 } from "../../../../../lib/invitation-rendering/ceremony-countdown";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { ClockCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { SE_DUYEN_V2_COPY } from "../copy";
import styles from "../se-duyen-v2.module.css";

const COPY = SE_DUYEN_V2_COPY.countdown;

/** The four dials, in the approved order. */
export const SE_DUYEN_COUNTDOWN_UNITS = ["days", "hours", "minutes", "seconds"] as const;

export type SeDuyenCountdownUnit = (typeof SE_DUYEN_COUNTDOWN_UNITS)[number];

export interface CountdownDial {
  readonly unit: SeDuyenCountdownUnit;
  readonly value: string;
}

/**
 * The approved dial values, or `null` once the canonical instant has been
 * reached or passed — the shared RF-05C derivation reports both as
 * `hasPassed`, and the approved composition shows one line for both.
 *
 * Hours, minutes and seconds are padded to two digits so the row's width does
 * not change as the seconds turn; the days are left as they fall, exactly as
 * the visual freeze has them. The only target is `ceremony.startsAt` and the
 * only current time is `clock.nowEpochMs`: nothing here reads a clock, and
 * the duration arithmetic is the shared one, so the countdown can never
 * disagree with the date printed elsewhere on the invitation (CLAUDE.md §7).
 */
export function countdownDials(
  ceremony: InvitationViewModel["ceremony"],
  clock: ClockCapabilityV1,
): readonly CountdownDial[] | null {
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
 * Se Duyên v1 countdown — the approved "Chờ Ngày Se Duyên" (SD-V1-02B3B).
 *
 * The hinge between the ivory ceremony page and the red album chapter: four
 * figures on one line with gold hairlines between them, no boxes, tabular
 * numerals so the row does not shift, and the tơ hồng drawn beneath.
 *
 * Each dial is a `<dt>`/`<dd>` pair with the label BEFORE the value in the
 * DOM, so a screen reader reads "Ngày 12" rather than four bare numbers; the
 * stylesheet reverses the column visually so the figure still sits above its
 * label. `role="timer"` with its own accessible name marks the region as a
 * live count without announcing every tick.
 *
 * NO TIMER AND NO MOTION LIVE HERE. The island renders the clock it is
 * given; the host's clock adapter owns the refresh cadence, as it does for
 * every other production renderer. Nothing in the section animates or
 * transitions, so the reduced-motion path is simply the finished row.
 *
 * Rendered only while `capabilities.clock` exists, which is after mount, so
 * no current time ever enters server markup.
 */
export function Countdown({
  ceremony,
  clock,
}: {
  readonly ceremony: InvitationViewModel["ceremony"];
  readonly clock: ClockCapabilityV1;
}) {
  const dials = countdownDials(ceremony, clock);

  return (
    <section className={styles.countdown} data-countdown={dials === null ? "passed" : "upcoming"} aria-labelledby="sd-countdown-heading">
      <span className={styles.countdownGlow} aria-hidden="true" />

      <div className={styles.countdownHead}>
        <h2 className={styles.countdownHeading} id="sd-countdown-heading">
          {COPY.heading}
        </h2>
        <span className={styles.countdownRule} aria-hidden="true" />
      </div>

      {dials === null ? (
        <p className={styles.countdownArrived}>{COPY.arrived}</p>
      ) : (
        <dl className={styles.countdownDials} role="timer" aria-label={COPY.label}>
          {dials.map((dial) => (
            <div key={dial.unit} className={styles.countdownDial}>
              <dt className={styles.countdownDialLabel}>{COPY.units[dial.unit]}</dt>
              <dd className={styles.countdownDialValue}>{dial.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <span className={styles.countdownThread} aria-hidden="true" />
    </section>
  );
}
