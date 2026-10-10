import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";

import { RSVP_ATTENDANCE_STATUSES, type RsvpAttendanceStatus } from "../../../../../lib/domain";
import type { RsvpCapabilityV1 } from "../../../../../lib/invitation-rendering/rsvp-capability";
import {
  INITIAL_RSVP_DRAFT,
  RSVP_GUEST_NAME_MAX_LENGTH,
  RSVP_MESSAGE_MAX_LENGTH,
  RSVP_PARTY_SIZE_CHOICES,
  buildRsvpSubmitInput,
  createRsvpSubmissionGate,
  rsvpMessageLength,
  rsvpPhaseReducer,
  rsvpTakesPartySize,
  type RsvpDraft,
  type RsvpDraftError,
} from "../../../../../lib/invitation-rendering/rsvp-form-model";
import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import styles from "../our-wedding-story-v1.module.css";

const COPY = OUR_WEDDING_STORY_V1_COPY.rsvp;

const DRAFT_ERROR_COPY: Readonly<Record<RsvpDraftError, string>> = Object.freeze({
  ATTENDANCE_REQUIRED: COPY.errors.attendanceRequired,
  GUEST_NAME_REQUIRED: COPY.errors.guestNameRequired,
  PARTY_SIZE_RANGE: COPY.errors.partySizeRange,
  MESSAGE_TOO_LONG: COPY.errors.messageTooLong,
  INPUT_REJECTED: COPY.errors.inputRejected,
});

/**
 * Visual Freeze v1 starts with no attendance chosen (the shared draft
 * otherwise preselects ATTENDING); every other field is the shared initial
 * draft: empty name, party of 1, empty message.
 */
export const OWS_INITIAL_RSVP_DRAFT: RsvpDraft = Object.freeze({ ...INITIAL_RSVP_DRAFT, attendance: null });

/** The stepper's bounds are the shared 1–20 party-size choices (the frozen RSVP contract range). */
const PARTY_SIZE_MIN = RSVP_PARTY_SIZE_CHOICES[0] ?? 1;
const PARTY_SIZE_MAX = RSVP_PARTY_SIZE_CHOICES[RSVP_PARTY_SIZE_CHOICES.length - 1] ?? PARTY_SIZE_MIN;

const IDS = Object.freeze({
  heading: "ows-rsvp-heading",
  guestName: "ows-rsvp-guest-name",
  guestNameError: "ows-rsvp-guest-name-error",
  attendanceError: "ows-rsvp-attendance-error",
  partySizeLabel: "ows-rsvp-party-size-label",
  partySizeError: "ows-rsvp-party-size-error",
  message: "ows-rsvp-message",
  messageCounter: "ows-rsvp-message-counter",
  messageError: "ows-rsvp-message-error",
  formError: "ows-rsvp-form-error",
});

/** What the success panel recalls about the submission it confirms: presentation only, never sent. */
interface RsvpSuccessRecap {
  readonly name: string;
  readonly attendance: RsvpAttendanceStatus;
  readonly partySize: number;
  readonly message: string | null;
}

/**
 * Our Wedding Story v1 RSVP island (docs/DECISIONS.md "OWS-01"). Rendered
 * only when `capabilities.rsvp` is present; no disabled or fake form
 * otherwise.
 *
 * Visual Freeze v1 presentation inside the champagne card: "Xác nhận tham
 * dự", the intro, the name (always starting empty, also on personalized
 * routes; display data, never identity), the three attendance choices, the
 * 1–20 party-size stepper for ATTENDING / MAYBE, the optional message with
 * its counter, and "Gửi xác nhận".
 *
 * Behaviour is the shared RSVP form model: local prevalidation, one gated
 * capability submission, success only after the capability resolved
 * `SUCCESS` (then the recap and "Chỉnh sửa phản hồi"), every other outcome
 * an honest message with the form editable.
 */
export function Rsvp({ rsvp }: { rsvp: RsvpCapabilityV1 }) {
  const [draft, setDraft] = useState<RsvpDraft>(OWS_INITIAL_RSVP_DRAFT);
  const [errors, setErrors] = useState<readonly RsvpDraftError[]>([]);
  const [recap, setRecap] = useState<RsvpSuccessRecap | null>(null);
  const [phase, dispatch] = useReducer(rsvpPhaseReducer, "IDLE");
  const [gate] = useState(createRsvpSubmissionGate);
  const editRef = useRef<HTMLButtonElement>(null);
  const guestNameRef = useRef<HTMLInputElement>(null);
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
    setRecap({
      name: built.input.guestName,
      attendance: built.input.attendance,
      partySize: built.input.partySize,
      message: built.input.message === null ? null : built.input.message.trim(),
    });
    dispatch({ type: "SUBMIT_STARTED" });
    void submission.then((outcome) => dispatch({ type: "SUBMIT_SETTLED", outcome }));
  }

  function handleEdit() {
    returningFromEdit.current = true;
    dispatch({ type: "EDIT" });
  }

  const succeeded = phase === "SUCCESS" && recap !== null;
  const resultText = phase === "INVALID" || phase === "UNAVAILABLE" || phase === "FAILED" ? COPY.results[phase] : null;
  const messageLength = rsvpMessageLength(draft.message);
  const overLimit = messageLength > RSVP_MESSAGE_MAX_LENGTH;

  return (
    <div className={styles.rsvpCard} data-rsvp-phase={phase.toLowerCase()}>
      <h3 id={IDS.heading} className={styles.rsvpTitle}>
        {COPY.title}
      </h3>
      <p className={styles.rsvpIntro}>{COPY.intro}</p>

      {succeeded ? (
        <div className={styles.rsvpDone}>
          <p className={styles.rsvpDoneTitle} role="status">
            {COPY.doneTitle}
          </p>
          <dl className={styles.rsvpSummary}>
            <dt>{COPY.summary.name}</dt>
            <dd>{recap.name}</dd>
            <dt>{COPY.summary.attendance}</dt>
            <dd>{COPY.attendanceLabels[recap.attendance]}</dd>
            {recap.partySize > 0 ? (
              <>
                <dt>{COPY.summary.partySize}</dt>
                <dd>{recap.partySize}</dd>
              </>
            ) : null}
            {recap.message === null ? null : (
              <>
                <dt>{COPY.summary.message}</dt>
                <dd>{recap.message}</dd>
              </>
            )}
          </dl>
          <button ref={editRef} type="button" className={styles.textButton} onClick={handleEdit}>
            {COPY.edit}
          </button>
        </div>
      ) : (
        <form
          className={styles.rsvpForm}
          onSubmit={handleSubmit}
          noValidate
          aria-labelledby={IDS.heading}
          aria-describedby={hasError("INPUT_REJECTED") ? IDS.formError : undefined}
        >
          <div className={styles.field}>
            <label htmlFor={IDS.guestName} className={styles.fieldLabel}>
              {COPY.guestNameLabel}
            </label>
            <input
              ref={guestNameRef}
              id={IDS.guestName}
              name="guestName"
              type="text"
              autoComplete="name"
              className={styles.input}
              placeholder={COPY.guestNamePlaceholder}
              value={draft.guestName}
              maxLength={RSVP_GUEST_NAME_MAX_LENGTH}
              onChange={(event) => update({ guestName: event.currentTarget.value })}
              aria-invalid={hasError("GUEST_NAME_REQUIRED") ? true : undefined}
              aria-describedby={hasError("GUEST_NAME_REQUIRED") ? IDS.guestNameError : undefined}
            />
            {hasError("GUEST_NAME_REQUIRED") ? (
              <span id={IDS.guestNameError} className={styles.fieldError}>
                {DRAFT_ERROR_COPY.GUEST_NAME_REQUIRED}
              </span>
            ) : null}
          </div>

          <fieldset className={styles.field} aria-describedby={hasError("ATTENDANCE_REQUIRED") ? IDS.attendanceError : undefined}>
            <legend className={styles.fieldLabel}>{COPY.attendanceLegend}</legend>
            <div className={styles.choiceList}>
              {RSVP_ATTENDANCE_STATUSES.map((status) => (
                <label key={status} className={draft.attendance === status ? `${styles.choice} ${styles.choiceActive}` : styles.choice}>
                  <input
                    type="radio"
                    name="attendance"
                    value={status}
                    checked={draft.attendance === status}
                    onChange={() => update({ attendance: status })}
                    className={styles.choiceInput}
                  />
                  <span className={styles.choiceMark} aria-hidden="true" />
                  <span>{COPY.attendanceLabels[status]}</span>
                </label>
              ))}
            </div>
            {hasError("ATTENDANCE_REQUIRED") ? (
              <span id={IDS.attendanceError} className={styles.fieldError}>
                {DRAFT_ERROR_COPY.ATTENDANCE_REQUIRED}
              </span>
            ) : null}
          </fieldset>

          {rsvpTakesPartySize(draft.attendance) ? (
            <div className={styles.field}>
              <span className={styles.fieldLabel} id={IDS.partySizeLabel}>
                {COPY.partySizeLabel}
              </span>
              <div
                className={styles.stepper}
                role="group"
                aria-labelledby={IDS.partySizeLabel}
                aria-describedby={hasError("PARTY_SIZE_RANGE") ? IDS.partySizeError : undefined}
              >
                <button
                  type="button"
                  className={styles.stepperButton}
                  onClick={() => update({ partySize: Math.max(PARTY_SIZE_MIN, draft.partySize - 1) })}
                  disabled={draft.partySize <= PARTY_SIZE_MIN}
                  aria-label={COPY.partySizeDecrease}
                >
                  −
                </button>
                <output className={styles.stepperValue} aria-live="polite">
                  {draft.partySize}
                </output>
                <button
                  type="button"
                  className={styles.stepperButton}
                  onClick={() => update({ partySize: Math.min(PARTY_SIZE_MAX, draft.partySize + 1) })}
                  disabled={draft.partySize >= PARTY_SIZE_MAX}
                  aria-label={COPY.partySizeIncrease}
                >
                  +
                </button>
              </div>
              {hasError("PARTY_SIZE_RANGE") ? (
                <span id={IDS.partySizeError} className={styles.fieldError}>
                  {DRAFT_ERROR_COPY.PARTY_SIZE_RANGE}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className={styles.field}>
            <label htmlFor={IDS.message} className={styles.fieldLabel}>
              {COPY.messageLabel} <span className={styles.fieldOptional}>{COPY.messageOptional}</span>
            </label>
            <textarea
              id={IDS.message}
              name="message"
              rows={3}
              className={`${styles.input} ${styles.textarea}`}
              placeholder={COPY.messagePlaceholder}
              value={draft.message}
              onChange={(event) => update({ message: event.currentTarget.value })}
              aria-invalid={hasError("MESSAGE_TOO_LONG") ? true : undefined}
              aria-describedby={hasError("MESSAGE_TOO_LONG") ? `${IDS.messageCounter} ${IDS.messageError}` : IDS.messageCounter}
            />
            <span id={IDS.messageCounter} className={overLimit ? `${styles.counter} ${styles.counterOver}` : styles.counter}>
              {messageLength}/{RSVP_MESSAGE_MAX_LENGTH}
            </span>
            {hasError("MESSAGE_TOO_LONG") ? (
              <span id={IDS.messageError} className={styles.fieldError}>
                {DRAFT_ERROR_COPY.MESSAGE_TOO_LONG}
              </span>
            ) : null}
          </div>

          {hasError("INPUT_REJECTED") ? (
            <p id={IDS.formError} className={styles.fieldError}>
              {DRAFT_ERROR_COPY.INPUT_REJECTED}
            </p>
          ) : null}
          <button type="submit" className={styles.submitButton} aria-disabled={pending ? true : undefined}>
            {pending ? COPY.submitting : COPY.submit}
          </button>
          <p className={resultText === null ? styles.srOnly : styles.rsvpResult} role="status" data-rsvp-result={phase.toLowerCase()}>
            {resultText}
          </p>
        </form>
      )}
    </div>
  );
}
