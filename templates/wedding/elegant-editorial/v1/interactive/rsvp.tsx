import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";

import { RSVP_ATTENDANCE_STATUSES, type RsvpAttendanceStatus } from "../../../../../lib/domain";
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
  RSVP_GUEST_NAME_MAX_LENGTH,
  buildRsvpSubmitInput,
  rsvpMessageLength,
  rsvpTakesPartySize,
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
  attendance: "ee-rsvp-attendance",
  attendanceError: "ee-rsvp-attendance-error",
  partySize: "ee-rsvp-party-size",
  partySizeError: "ee-rsvp-party-size-error",
  message: "ee-rsvp-message",
  messageHint: "ee-rsvp-message-hint",
  messageError: "ee-rsvp-message-error",
  formError: "ee-rsvp-form-error",
});

/** What the success UI recalls about the submission it confirms: presentation only, never sent. */
export interface RsvpSuccessRecap {
  readonly attendance: RsvpAttendanceStatus;
  /** The submitted response name (typed, trimmed). */
  readonly name: string;
  /** The sent message, trimmed, or `null` when none was sent. */
  readonly message: string | null;
}

/**
 * Design Baseline D11 success wording, exactly the Task029 sentence around
 * the presentation-only name.
 */
export function rsvpSuccessText(recap: RsvpSuccessRecap): string {
  const tail = recap.attendance === "ATTENDING" ? ` ${COPY.success.attendingTail}` : COPY.success.notAttendingTail;
  return `${COPY.success.thanks} ${recap.name} ${COPY.success.responded}${tail}`;
}

function attendanceFromValue(value: string): RsvpAttendanceStatus | null {
  return RSVP_ATTENDANCE_STATUSES.find((status) => status === value) ?? null;
}

interface RsvpProps {
  rsvp: RsvpCapabilityV1;
}

/**
 * RF-06D RSVP island (P30–P33). Rendered by the root only when
 * `capabilities.rsvp` is present, which production does not supply before
 * Task 033; the internal harness supplies its `UNAVAILABLE`-only
 * capability. Choices are exactly `ATTENDING` / `MAYBE` / `NOT_ATTENDING`
 * (RSVP completion amendment). Success is
 * shown only after the capability resolved `SUCCESS`; every other outcome
 * keeps the form editable for an explicit retry.
 *
 * Task029 presentation (Design Baseline B5 item 16, D10–D12): the gold
 * bordered card with the two-line heading, then in this order (Product Owner
 * ruling): the always-visible "Tên bạn là gì?" name input (always
 * starting empty, personalized or not: the guest types the name to leave;
 * it is never identity, Micro-Checkpoint 10), the attendance
 * select, the "Số người tham dự" 1–20 select for `ATTENDING` / `MAYBE`, the
 * message textarea and the square "Gửi lời chúc" submit. The name input and
 * textarea are carried by their placeholders (labels for assistive
 * technology). After
 * `SUCCESS`: the Task029 thank-you sentence, a quoted recap of the message,
 * and "Sửa lại", a local return to the form. Focus follows: to "Sửa lại"
 * after success, back to the first field after "Sửa lại".
 */
export function Rsvp({ rsvp }: RsvpProps) {
  const [draft, setDraft] = useState<RsvpDraft>(INITIAL_RSVP_DRAFT);
  const [errors, setErrors] = useState<readonly RsvpDraftError[]>([]);
  const [recap, setRecap] = useState<RsvpSuccessRecap | null>(null);
  const [phase, dispatch] = useReducer(rsvpPhaseReducer, "IDLE");
  const [gate] = useState(createRsvpSubmissionGate);
  const editRef = useRef<HTMLButtonElement>(null);
  const guestNameRef = useRef<HTMLInputElement>(null);
  const attendanceRef = useRef<HTMLSelectElement>(null);
  const returningFromEdit = useRef(false);
  const pending = phase === "PENDING";

  useEffect(() => {
    if (phase === "SUCCESS") {
      editRef.current?.focus();
    } else if (phase === "IDLE" && returningFromEdit.current) {
      returningFromEdit.current = false;
      guestNameRef.current?.focus();
    }
  }, [phase]);

  const hasError = (error: RsvpDraftError) => errors.includes(error);

  function update(change: Partial<RsvpDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || phase === "SUCCESS") return;
    const built = buildRsvpSubmitInput(draft);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors([]);
    const submission = gate.run(rsvp, built.input);
    if (submission === null) return;
    const sentMessage = built.input.message?.trim() ?? "";
    setRecap({
      attendance: built.input.attendance,
      name: built.input.guestName,
      message: sentMessage.length === 0 ? null : sentMessage,
    });
    dispatch({ type: "SUBMIT_STARTED" });
    void submission.then((outcome) => dispatch({ type: "SUBMIT_SETTLED", outcome }));
  }

  function handleEdit() {
    returningFromEdit.current = true;
    dispatch({ type: "EDIT" });
  }

  const succeeded = phase === "SUCCESS" && recap !== null;
  const statusText = succeeded
    ? rsvpSuccessText(recap)
    : phase === "IDLE" || phase === "PENDING" || phase === "SUCCESS"
      ? null
      : COPY.results[phase];
  const messageLength = rsvpMessageLength(draft.message);
  const overLimit = messageLength > RSVP_MESSAGE_MAX_LENGTH;

  return (
    <section className={styles.rsvpSection} aria-labelledby={IDS.heading} data-rsvp-phase={phase.toLowerCase()}>
      <div className={styles.rsvpCard}>
        <h2 id={IDS.heading} className={styles.rsvpHeading}>
          <span className={styles.rsvpHeadingLine}>{COPY.heading}</span>{" "}
          <span className={styles.rsvpHeadingLine}>
            <span className={styles.rsvpHeadingAmp}>&amp;</span>
            {COPY.headingSecondLine}
          </span>
        </h2>
        {phase === "SUCCESS" ? null : (
          <form
            className={styles.rsvpForm}
            onSubmit={handleSubmit}
            noValidate
            aria-describedby={hasError("INPUT_REJECTED") ? IDS.formError : undefined}
          >
            {/* Always visible and always first (Product Owner ruling); never identity. */}
            <div className={styles.rsvpField}>
              <label htmlFor={IDS.guestName} className={styles.srOnly}>
                {COPY.guestNameLabel}
              </label>
              <input
                ref={guestNameRef}
                id={IDS.guestName}
                name="guestName"
                type="text"
                autoComplete="name"
                className={styles.rsvpInput}
                placeholder={COPY.guestNamePlaceholder}
                value={draft.guestName}
                maxLength={RSVP_GUEST_NAME_MAX_LENGTH}
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
            <div className={styles.rsvpField}>
              <label htmlFor={IDS.attendance} className={styles.rsvpSelectLabel}>
                {COPY.attendanceLabel}
              </label>
              <select
                ref={attendanceRef}
                id={IDS.attendance}
                name="attendance"
                className={styles.rsvpSelect}
                value={draft.attendance ?? ""}
                onChange={(event) => update({ attendance: attendanceFromValue(event.currentTarget.value) })}
                required
                aria-invalid={hasError("ATTENDANCE_REQUIRED") ? true : undefined}
                aria-describedby={hasError("ATTENDANCE_REQUIRED") ? IDS.attendanceError : undefined}
              >
                {RSVP_ATTENDANCE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {COPY.attendanceLabels[status]}
                  </option>
                ))}
              </select>
              {hasError("ATTENDANCE_REQUIRED") ? (
                <p id={IDS.attendanceError} className={styles.rsvpError}>
                  {DRAFT_ERROR_COPY.ATTENDANCE_REQUIRED}
                </p>
              ) : null}
            </div>
            {rsvpTakesPartySize(draft.attendance) ? (
              <div className={styles.rsvpField}>
                <label htmlFor={IDS.partySize} className={styles.rsvpSelectLabel}>
                  {COPY.partySizeLabel}
                </label>
                <select
                  id={IDS.partySize}
                  name="partySize"
                  className={styles.rsvpSelect}
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
              <label htmlFor={IDS.message} className={styles.srOnly}>
                {COPY.messageLabel}
              </label>
              <textarea
                id={IDS.message}
                name="message"
                rows={3}
                className={styles.rsvpTextarea}
                placeholder={COPY.messagePlaceholder}
                value={draft.message}
                onChange={(event) => update({ message: event.currentTarget.value })}
                aria-invalid={hasError("MESSAGE_TOO_LONG") ? true : undefined}
                aria-describedby={
                  hasError("MESSAGE_TOO_LONG") ? `${IDS.messageHint} ${IDS.messageError}` : IDS.messageHint
                }
              />
              <p
                id={IDS.messageHint}
                className={overLimit ? styles.rsvpHint : styles.srOnly}
                data-over-limit={overLimit ? "true" : undefined}
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
          className={statusText === null ? styles.srOnly : succeeded ? styles.rsvpFeedback : styles.rsvpResult}
          role="status"
          data-rsvp-result={phase.toLowerCase()}
        >
          {statusText}
        </p>
        {succeeded ? (
          <div className={styles.rsvpConfirm}>
            {recap.message === null ? null : <p className={styles.rsvpMessageRecap}>&ldquo;{recap.message}&rdquo;</p>}
            <button ref={editRef} type="button" className={styles.rsvpEditButton} onClick={handleEdit}>
              {COPY.edit}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
