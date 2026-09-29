import { parseCanonicalInstantEpochMs } from "./civil-date-time";
import type { InvitationViewModel } from "./invitation-view-model-types";
import type { ClockCapabilityV1 } from "./renderer-capabilities";

/**
 * Invitation Rendering Foundation RF-05C — shared pure ceremony countdown
 * (docs/DECISIONS.md RF-05 clarification K26–K29).
 *
 * The only target is `viewModel.ceremony.startsAt`. The current time is the
 * explicit `clock.nowEpochMs`; this module never reads a clock and owns no
 * refresh cadence (the later clock adapter does).
 */

/** Non-negative integer parts of the remaining absolute duration. */
export interface CeremonyCountdownV1 {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly hasPassed: boolean;
}

const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_MINUTE = 60;

/**
 * Fixed 24-hour-day duration arithmetic; the event timezone does not affect
 * it. A non-finite `nowEpochMs` or non-canonical `startsAt` throws `RangeError`.
 */
export function deriveCeremonyCountdownV1(
  viewModel: Pick<InvitationViewModel, "ceremony">,
  clock: ClockCapabilityV1,
): CeremonyCountdownV1 {
  const nowEpochMs: unknown = typeof clock === "object" && clock !== null ? clock.nowEpochMs : undefined;
  if (typeof nowEpochMs !== "number" || !Number.isFinite(nowEpochMs)) {
    throw new RangeError("clock.nowEpochMs must be a finite number");
  }
  const targetEpochMs = parseCanonicalInstantEpochMs(viewModel.ceremony.startsAt);

  const diffMs = targetEpochMs - nowEpochMs;
  if (diffMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, hasPassed: true };
  }

  const totalSeconds = Math.trunc(diffMs / 1000);
  return {
    days: Math.floor(totalSeconds / SECONDS_PER_DAY),
    hours: Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR),
    minutes: Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
    seconds: totalSeconds % SECONDS_PER_MINUTE,
    hasPassed: false,
  };
}
