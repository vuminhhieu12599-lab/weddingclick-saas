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
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import { DecorImage } from "../sections/decor";
import styles from "../romantic-minimal-v1.module.css";

const COPY = ROMANTIC_MINIMAL_V1_COPY.rsvp;

const DRAFT_ERROR_COPY: Readonly<Record<RsvpDraftError, string>> = Object.freeze({
  ATTENDANCE_REQUIRED: COPY.errors.attendanceRequired,
  GUEST_NAME_REQUIRED: COPY.errors.guestNameRequired,
  PARTY_SIZE_RANGE: COPY.errors.partySizeRange,
  MESSAGE_TOO_LONG: COPY.errors.messageTooLong,
  INPUT_REJECTED: COPY.errors.inputRejected,
});

const IDS = Object.freeze({
  heading: "rm-rsvp-heading",
  guestName: "rm-rsvp-guest-name",
  guestNameError: "rm-rsvp-guest-name-error",
  attendance: "rm-rsvp-attendance",
  attendanceError: "rm-rsvp-attendance-error",
  partySize: "rm-rsvp-party-size",
  partySizeError: "rm-rsvp-party-size-error",
  message: "rm-rsvp-message",
  messageHint: "rm-rsvp-message-hint",
  messageError: "rm-rsvp-message-error",
  formError: "rm-rsvp-form-error",
});

/** What the success panel recalls about the submission it confirms: presentation only, never sent. */
interface RsvpSuccessRecap {
  readonly attendance: RsvpAttendanceStatus;
  readonly name: string;
  readonly message: string | null;
}

function attendanceFromValue(value: string): RsvpAttendanceStatus | null {
  return RSVP_ATTENDANCE_STATUSES.find((status) => status === value) ?? null;
}

/**
 * Romantic Minimal v1 RSVP island (docs/DECISIONS.md "RM-02"). Rendered only
 * when `capabilities.rsvp` is present; no disabled or fake form otherwise.
 *
 * Task 029 presentation: divider ornament, the italic two-line title "Xác
 * Nhận Tham Dự / & Gửi Lời Chúc", then one blush panel with the name input
 * (always starting empty, also on personalized routes; display data, never
 * identity), the attendance select (ATTENDING / MAYBE / NOT_ATTENDING,
 * starting on "Sẽ tham dự"), the 1–20 party-size select for ATTENDING /
 * MAYBE (required by the frozen RSVP contract), the wish and "Gửi ngay".
 *
 * Behaviour is the shared RSVP form model: local prevalidation, one gated
 * capability submission, success only after the capability resolved
 * `SUCCESS`, every other outcome an honest message with the form editable.
 */
export function Rsvp({ rsvp }: { rsvp: RsvpCapabilityV1 }) {
  const [draft, setDraft] = useState<RsvpDraft>(INITIAL_RSVP_DRAFT);
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
  const resultText = phase === "INVALID" || phase === "UNAVAILABLE" || phase === "FAILED" ? COPY.results[phase] : null;
  const messageLength = rsvpMessageLength(draft.message);
  const overLimit = messageLength > RSVP_MESSAGE_MAX_LENGTH;

  return (
    <section className={styles.rsvpSection} aria-labelledby={IDS.heading} data-rsvp-phase={phase.toLowerCase()}>
      <div className={styles.rsvpHeader}>
        <DecorImage decor="divider" className={styles.rsvpOrnament} />
        <h2 id={IDS.heading} className={styles.rsvpTitle}>
          <span>{COPY.heading}</span>
          <span>
            <span className={styles.rsvpTitleAmp}>&amp;</span> {COPY.headingSecondLine}
          </span>
        </h2>
      </div>
      <div className={styles.rsvpPanel}>
        {succeeded ? (
          <div className={styles.rsvpDone}>
            <p className={styles.rsvpDoneThanks} role="status">
              {COPY.successThanks} {recap.name}!
            </p>
            <p className={styles.rsvpDoneChoice}>{COPY.attendanceLabels[recap.attendance]}</p>
            {recap.message === null ? null : <p className={styles.rsvpDoneMessage}>&ldquo;{recap.message}&rdquo;</p>}
            <button ref={editRef} type="button" className={styles.rsvpEdit} onClick={handleEdit}>
              {COPY.edit}
            </button>
          </div>
        ) : (
          <form
            className={styles.rsvpFields}
            onSubmit={handleSubmit}
            noValidate
            aria-describedby={hasError("INPUT_REJECTED") ? IDS.formError : undefined}
          >
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
              <label htmlFor={IDS.attendance} className={styles.srOnly}>
                {COPY.attendanceLabel}
              </label>
              <select
                id={IDS.attendance}
                name="attendance"
                className={`${styles.rsvpInput} ${styles.rsvpSelect}`}
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
                <label htmlFor={IDS.partySize} className={styles.rsvpLabel}>
                  {COPY.partySizeLabel}
                </label>
                <select
                  id={IDS.partySize}
                  name="partySize"
                  className={`${styles.rsvpInput} ${styles.rsvpSelect}`}
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
                rows={4}
                className={`${styles.rsvpInput} ${styles.rsvpTextarea}`}
                placeholder={COPY.messagePlaceholder}
                value={draft.message}
                onChange={(event) => update({ message: event.currentTarget.value })}
                aria-invalid={hasError("MESSAGE_TOO_LONG") ? true : undefined}
                aria-describedby={hasError("MESSAGE_TOO_LONG") ? `${IDS.messageHint} ${IDS.messageError}` : IDS.messageHint}
              />
              <p id={IDS.messageHint} className={overLimit ? styles.rsvpHint : styles.srOnly} data-over-limit={overLimit ? "true" : undefined}>
                {messageLength}/{RSVP_MESSAGE_MAX_LENGTH} · {COPY.messageLimitPrefix} {RSVP_MESSAGE_MAX_LENGTH} {COPY.messageLimitSuffix}
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
            <p className={resultText === null ? styles.srOnly : styles.rsvpResult} role="status" data-rsvp-result={phase.toLowerCase()}>
              {resultText}
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
