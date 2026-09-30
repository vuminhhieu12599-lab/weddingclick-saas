import { useReducer, useState, type FormEvent } from "react";

import { RSVP_ATTENDANCE_STATUSES } from "../../../../../lib/domain";
import {
  RSVP_SUBMIT_RESULT_STATUSES,
  type RsvpCapabilityV1,
  type RsvpSubmitInputV1,
  type RsvpSubmitResultStatusV1,
} from "../../../../../lib/invitation-rendering/rsvp-capability";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import {
  INITIAL_RSVP_DRAFT,
  RSVP_MESSAGE_MAX_LENGTH,
  RSVP_PARTY_SIZE_CHOICES,
  buildRsvpSubmitInput,
  rsvpMessageLength,
  rsvpPhaseReducer,
  type RsvpDraft,
  type RsvpDraftError,
  type RsvpSubmitOutcome,
} from "./rsvp-model";

const COPY = ELEGANT_EDITORIAL_V1_COPY.rsvp;

function isRsvpSubmitResultStatus(value: unknown): value is RsvpSubmitResultStatusV1 {
  return (RSVP_SUBMIT_RESULT_STATUSES as readonly unknown[]).includes(value);
}

/**
 * Submits once through the frozen RF-05 RSVP capability (K15, K17, K18).
 * Resolves the capability's own status; an unexpected rejection becomes
 * `REJECTED` (never success, never an unhandled rejection), and a malformed
 * result is `FAILED`. Nothing is stored or sent anywhere else.
 */
export async function settleRsvpSubmit(
  rsvp: RsvpCapabilityV1,
  input: RsvpSubmitInputV1,
): Promise<RsvpSubmitOutcome> {
  try {
    const result: unknown = await rsvp.submit(input);
    const status: unknown =
      typeof result === "object" && result !== null ? (result as { status?: unknown }).status : undefined;
    return isRsvpSubmitResultStatus(status) ? status : "FAILED";
  } catch {
    return "REJECTED";
  }
}

export interface RsvpSubmissionGate {
  /** Starts a submission, or returns `null` while one is still in flight. */
  run(rsvp: RsvpCapabilityV1, input: RsvpSubmitInputV1): Promise<RsvpSubmitOutcome> | null;
}

/**
 * P32 duplicate-submission guard. Synchronous, so repeated clicks or Enter
 * presses before React rerenders can never start a parallel request. It is
 * released once the submission settles, so an explicit retry is possible.
 */
export function createRsvpSubmissionGate(): RsvpSubmissionGate {
  let inFlight = false;
  return Object.freeze({
    run(rsvp: RsvpCapabilityV1, input: RsvpSubmitInputV1): Promise<RsvpSubmitOutcome> | null {
      if (inFlight) return null;
      inFlight = true;
      return settleRsvpSubmit(rsvp, input).finally(() => {
        inFlight = false;
      });
    },
  });
}

const DRAFT_ERROR_COPY: Readonly<Record<RsvpDraftError, string>> = Object.freeze({
  ATTENDANCE_REQUIRED: COPY.errors.attendanceRequired,
  GUEST_NAME_REQUIRED: COPY.errors.guestNameRequired,
  PARTY_SIZE_RANGE: COPY.errors.partySizeRange,
  MESSAGE_TOO_LONG: COPY.errors.messageTooLong,
  INPUT_REJECTED: COPY.errors.inputRejected,
});

const IDS = Object.freeze({
  heading: "ee-rsvp-heading",
  guestName: "ee-rsvp-guest-name",
  guestNameError: "ee-rsvp-guest-name-error",
  attendanceError: "ee-rsvp-attendance-error",
  partySize: "ee-rsvp-party-size",
  partySizeError: "ee-rsvp-party-size-error",
  message: "ee-rsvp-message",
  messageHint: "ee-rsvp-message-hint",
  messageError: "ee-rsvp-message-error",
  formError: "ee-rsvp-form-error",
});

interface RsvpProps {
  rsvp: RsvpCapabilityV1;
  /** K16: `viewModel.guest` is present. Never identity: the display name is not sent. */
  personalized: boolean;
}

/**
 * RF-06D RSVP island (P30–P33). Rendered by the root only when
 * `capabilities.rsvp` is present, which production does not supply before
 * Task 033; the internal harness supplies its `UNAVAILABLE`-only
 * capability. Choices are exactly `ATTENDING` / `NOT_ATTENDING`. Success is
 * shown only after the capability resolved `SUCCESS`; every other outcome
 * keeps the form editable for an explicit retry.
 */
export function Rsvp({ rsvp, personalized }: RsvpProps) {
  const [draft, setDraft] = useState<RsvpDraft>(INITIAL_RSVP_DRAFT);
  const [errors, setErrors] = useState<readonly RsvpDraftError[]>([]);
  const [phase, dispatch] = useReducer(rsvpPhaseReducer, "IDLE");
  const [gate] = useState(createRsvpSubmissionGate);
  const pending = phase === "PENDING";

  const hasError = (error: RsvpDraftError) => errors.includes(error);

  function update(change: Partial<RsvpDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || phase === "SUCCESS") return;
    const built = buildRsvpSubmitInput(draft, personalized);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors([]);
    const submission = gate.run(rsvp, built.input);
    if (submission === null) return;
    dispatch({ type: "SUBMIT_STARTED" });
    void submission.then((outcome) => dispatch({ type: "SUBMIT_SETTLED", outcome }));
  }

  const result = phase === "IDLE" || phase === "PENDING" ? null : COPY.results[phase];
  const messageLength = rsvpMessageLength(draft.message);

  return (
    <section className={styles.section} aria-labelledby={IDS.heading} data-rsvp-phase={phase.toLowerCase()}>
      <h2 id={IDS.heading} className={styles.sectionHeading}>
        {COPY.heading}
      </h2>
      {phase === "SUCCESS" ? null : (
        <form
          className={styles.rsvpForm}
          onSubmit={handleSubmit}
          noValidate
          aria-describedby={hasError("INPUT_REJECTED") ? IDS.formError : undefined}
        >
          <p className={styles.rsvpIntro}>{COPY.intro}</p>
          {personalized ? null : (
            <div className={styles.rsvpField}>
              <label htmlFor={IDS.guestName} className={styles.rsvpLabel}>
                {COPY.guestNameLabel}
              </label>
              <input
                id={IDS.guestName}
                name="guestName"
                type="text"
                autoComplete="name"
                className={styles.rsvpInput}
                value={draft.guestName}
                onChange={(event) => update({ guestName: event.currentTarget.value })}
                required
                aria-invalid={hasError("GUEST_NAME_REQUIRED") ? true : undefined}
                aria-describedby={hasError("GUEST_NAME_REQUIRED") ? IDS.guestNameError : undefined}
              />
              {hasError("GUEST_NAME_REQUIRED") ? (
                <p id={IDS.guestNameError} className={styles.rsvpError}>
                  {DRAFT_ERROR_COPY.GUEST_NAME_REQUIRED}
                </p>
              ) : null}
            </div>
          )}
          <fieldset
            className={styles.rsvpFieldset}
            aria-describedby={hasError("ATTENDANCE_REQUIRED") ? IDS.attendanceError : undefined}
          >
            <legend className={styles.rsvpLabel}>{COPY.attendanceLegend}</legend>
            {RSVP_ATTENDANCE_STATUSES.map((status) => (
              <label key={status} className={styles.rsvpChoice}>
                <input
                  type="radio"
                  name="attendance"
                  value={status}
                  className={styles.rsvpRadio}
                  checked={draft.attendance === status}
                  onChange={() => update({ attendance: status })}
                />
                <span>{COPY.attendanceLabels[status]}</span>
              </label>
            ))}
            {hasError("ATTENDANCE_REQUIRED") ? (
              <p id={IDS.attendanceError} className={styles.rsvpError}>
                {DRAFT_ERROR_COPY.ATTENDANCE_REQUIRED}
              </p>
            ) : null}
          </fieldset>
          {draft.attendance === "ATTENDING" ? (
            <div className={styles.rsvpField}>
              <label htmlFor={IDS.partySize} className={styles.rsvpLabel}>
                {COPY.partySizeLabel}
              </label>
              <select
                id={IDS.partySize}
                name="partySize"
                className={styles.rsvpInput}
                value={String(draft.partySize)}
                onChange={(event) => update({ partySize: Number(event.currentTarget.value) })}
                aria-invalid={hasError("PARTY_SIZE_RANGE") ? true : undefined}
                aria-describedby={hasError("PARTY_SIZE_RANGE") ? IDS.partySizeError : undefined}
              >
                {RSVP_PARTY_SIZE_CHOICES.map((size) => (
                  <option key={size} value={String(size)}>
                    {size}
                  </option>
                ))}
              </select>
              {hasError("PARTY_SIZE_RANGE") ? (
                <p id={IDS.partySizeError} className={styles.rsvpError}>
                  {DRAFT_ERROR_COPY.PARTY_SIZE_RANGE}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className={styles.rsvpField}>
            <label htmlFor={IDS.message} className={styles.rsvpLabel}>
              {COPY.messageLabel}
            </label>
            <textarea
              id={IDS.message}
              name="message"
              rows={4}
              className={styles.rsvpTextarea}
              value={draft.message}
              onChange={(event) => update({ message: event.currentTarget.value })}
              aria-invalid={hasError("MESSAGE_TOO_LONG") ? true : undefined}
              aria-describedby={
                hasError("MESSAGE_TOO_LONG") ? `${IDS.messageHint} ${IDS.messageError}` : IDS.messageHint
              }
            />
            <p
              id={IDS.messageHint}
              className={styles.rsvpHint}
              data-over-limit={messageLength > RSVP_MESSAGE_MAX_LENGTH ? "true" : undefined}
            >
              {messageLength}/{RSVP_MESSAGE_MAX_LENGTH} · {COPY.messageLimitPrefix} {RSVP_MESSAGE_MAX_LENGTH}{" "}
              {COPY.messageLimitSuffix}
            </p>
            {hasError("MESSAGE_TOO_LONG") ? (
              <p id={IDS.messageError} className={styles.rsvpError}>
                {DRAFT_ERROR_COPY.MESSAGE_TOO_LONG}
              </p>
            ) : null}
          </div>
          {hasError("INPUT_REJECTED") ? (
            <p id={IDS.formError} className={styles.rsvpError}>
              {DRAFT_ERROR_COPY.INPUT_REJECTED}
            </p>
          ) : null}
          <button type="submit" className={styles.rsvpSubmit} aria-disabled={pending ? true : undefined}>
            {pending ? COPY.submitting : COPY.submit}
          </button>
        </form>
      )}
      <p
        className={result === null ? styles.srOnly : styles.rsvpResult}
        role="status"
        data-rsvp-result={phase.toLowerCase()}
      >
        {result}
      </p>
    </section>
  );
}
