import { useId, useReducer, useRef, useState } from "react";

import {
  INITIAL_RSVP_DRAFT,
  RSVP_MESSAGE_MAX_LENGTH,
  RSVP_PARTY_SIZE_CHOICES,
  buildRsvpSubmitInput,
  createRsvpSubmissionGate,
  rsvpPhaseReducer,
  rsvpTakesPartySize,
  type RsvpDraft,
  type RsvpDraftError,
  type RsvpPhase,
} from "../../../../../lib/invitation-rendering/rsvp-form-model";
import type { RsvpAttendanceStatus } from "../../../../../lib/domain";
import type { RsvpCapabilityV1 } from "../../../../../lib/invitation-rendering/rsvp-capability";
import { SE_DUYEN_V1_COPY } from "../copy";
import styles from "../se-duyen-v1.module.css";

const COPY = SE_DUYEN_V1_COPY.rsvp;

/**
 * The canonical party-size bounds, read off the shared choice list rather
 * than imported from the contract module, so this card's import graph stays
 * exactly the other templates': the shared form model and nothing else.
 */
const PARTY_SIZE_MIN = RSVP_PARTY_SIZE_CHOICES[0] as number;
const PARTY_SIZE_MAX = RSVP_PARTY_SIZE_CHOICES[RSVP_PARTY_SIZE_CHOICES.length - 1] as number;

/** The approved three choices, each bound to a canonical attendance status. */
export const SE_DUYEN_RSVP_CHOICES: readonly { readonly value: RsvpAttendanceStatus; readonly label: string }[] =
  Object.freeze([
    { value: "ATTENDING", label: COPY.choiceAttending },
    { value: "MAYBE", label: COPY.choiceMaybe },
    { value: "NOT_ATTENDING", label: COPY.choiceNotAttending },
  ]);

/**
 * What the card says under the button, and nothing more. A successful
 * submission leaves this empty because the card itself becomes the thank-you;
 * every other settled outcome is reported in the guest's own words.
 */
export function rsvpNote(phase: RsvpPhase, errors: readonly RsvpDraftError[]): string | null {
  if (errors.length > 0) {
    if (errors.includes("GUEST_NAME_REQUIRED")) return COPY.errorName;
    if (errors.includes("MESSAGE_TOO_LONG")) return COPY.errorMessage;
    return COPY.errorInvalid;
  }
  switch (phase) {
    case "INVALID":
      return COPY.errorInvalid;
    case "UNAVAILABLE":
      return COPY.errorUnavailable;
    case "FAILED":
      return COPY.errorFailed;
    case "IDLE":
    case "PENDING":
    case "SUCCESS":
      return null;
  }
}

/**
 * Se Duyên v1 RSVP — the approved "Hồi Âm" card (SD-V1-RSVP).
 *
 * A REAL SUBMISSION. The capability is the public one the `/i/[slug]` wrapper
 * builds, which POSTs the four canonical response fields to
 * `/api/v2/public/rsvp`; on the personalized route it also sends that route's
 * own guest token, and the SERVER derives the guest identity from it. This
 * island never sees a token, a guest id or any `?guest=` value, never reads
 * another guest's response, and never prefills the name from the invitation's
 * guest overlay: the field starts empty on every render, as the frozen
 * contract requires (K18). The name a guest types is display data, never
 * identity.
 *
 * Validation, the submit state machine and the duplicate-submission guard are
 * the shared models: `buildRsvpSubmitInput` builds and re-checks the input
 * against the frozen contract validator, `createRsvpSubmissionGate` refuses a
 * parallel request synchronously — so repeated taps or Enter presses before
 * React rerenders cannot submit twice — and `rsvpPhaseReducer` owns the
 * phase. Nothing is retried on its own.
 *
 * SUCCESS IS ONLY EVER THE SERVER'S. The thank-you replaces the form only
 * for a `SUCCESS` the capability resolved, which it does only for a 201 whose
 * body confirms the row was recorded. `INVALID`, `UNAVAILABLE` (a revoked
 * guest link) and `FAILED` keep the form, with the guest's answers intact and
 * an honest note, so an explicit retry is one tap away (CLAUDE.md §22, §30 —
 * a false RSVP success is a release blocker).
 */
export function Rsvp({ rsvp }: { readonly rsvp: RsvpCapabilityV1 }) {
  const fieldId = useId();
  const [draft, setDraft] = useState<RsvpDraft>(INITIAL_RSVP_DRAFT);
  const [phase, dispatch] = useReducer(rsvpPhaseReducer, "IDLE" as RsvpPhase);
  const [errors, setErrors] = useState<readonly RsvpDraftError[]>([]);
  const gateRef = useRef(createRsvpSubmissionGate());

  const pending = phase === "PENDING";
  const takesPartySize = rsvpTakesPartySize(draft.attendance);
  const note = rsvpNote(phase, errors);

  function patch(change: Partial<RsvpDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (pending) return;
    const built = buildRsvpSubmitInput(draft);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors([]);
    const started = gateRef.current.run(rsvp, built.input);
    if (started === null) return;
    dispatch({ type: "SUBMIT_STARTED" });
    void started.then((outcome) => {
      dispatch({ type: "SUBMIT_SETTLED", outcome });
    });
  }

  if (phase === "SUCCESS") {
    return (
      <section className={styles.rsvp} aria-labelledby="sd-rsvp-heading">
        <div className={styles.rsvpCard}>
          <p className={styles.rsvpEyebrow}>{COPY.eyebrow}</p>
          {/* RSVP-P0-01: once the response is recorded, the big "Xác Nhận
              Tham Dự" heading would read as "you are attending" over a
              NOT_ATTENDING answer, so it steps out of sight. It stays
              mounted with its id and text, so the section keeps its
              accessible name and aria-labelledby stays valid. */}
          <h2 className={styles.srOnly} id="sd-rsvp-heading">
            {COPY.heading}
          </h2>
          <span className={styles.rsvpRule} aria-hidden="true" />

          <div className={styles.rsvpDone} role="status">
            <p className={styles.rsvpDoneTitle}>{COPY.thanks}</p>
            <p className={styles.rsvpDoneLine}>{COPY.recorded}</p>
            <button
              type="button"
              className={styles.rsvpAgain}
              onClick={() => {
                dispatch({ type: "EDIT" });
                setErrors([]);
              }}
            >
              {COPY.again}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.rsvp} aria-labelledby="sd-rsvp-heading">
      <div className={styles.rsvpCard}>
        <p className={styles.rsvpEyebrow}>{COPY.eyebrow}</p>
        <h2 className={styles.rsvpHeading} id="sd-rsvp-heading">
          {COPY.heading}
        </h2>
        <span className={styles.rsvpRule} aria-hidden="true" />
        <p className={styles.rsvpIntro}>{COPY.intro}</p>

        <form className={styles.rsvpForm} onSubmit={handleSubmit} noValidate>
          <label className={styles.rsvpLabel} htmlFor={`${fieldId}-name`}>
            {COPY.nameLabel}
          </label>
          <input
            id={`${fieldId}-name`}
            className={styles.rsvpInput}
            type="text"
            autoComplete="off"
            placeholder={COPY.namePlaceholder}
            value={draft.guestName}
            aria-invalid={errors.includes("GUEST_NAME_REQUIRED") ? true : undefined}
            onChange={(event) => {
              patch({ guestName: event.target.value });
            }}
          />

          <fieldset className={styles.rsvpChoices}>
            <legend className={styles.rsvpLegend}>{COPY.attendanceLabel}</legend>
            {SE_DUYEN_RSVP_CHOICES.map((choice) => (
              <label key={choice.value} className={styles.rsvpChoice}>
                <input
                  className={styles.rsvpRadio}
                  type="radio"
                  name={`${fieldId}-attendance`}
                  value={choice.value}
                  checked={draft.attendance === choice.value}
                  onChange={() => {
                    patch({ attendance: choice.value });
                  }}
                />
                <span className={styles.rsvpMark} aria-hidden="true" />
                <span className={styles.rsvpChoiceText}>{choice.label}</span>
              </label>
            ))}
          </fieldset>

          {takesPartySize ? (
            <div className={styles.rsvpCount}>
              <span className={styles.rsvpLabel} id={`${fieldId}-count`}>
                {COPY.countLabel}
              </span>
              <span className={styles.rsvpStepper}>
                <button
                  type="button"
                  className={styles.rsvpStep}
                  aria-label={COPY.countDown}
                  disabled={draft.partySize <= PARTY_SIZE_MIN}
                  onClick={() => {
                    patch({ partySize: Math.max(PARTY_SIZE_MIN, draft.partySize - 1) });
                  }}
                >
                  −
                </button>
                <output className={styles.rsvpCountValue} aria-labelledby={`${fieldId}-count`}>
                  {draft.partySize}
                  <span className={styles.rsvpCountUnit}>{COPY.countUnit}</span>
                </output>
                <button
                  type="button"
                  className={styles.rsvpStep}
                  aria-label={COPY.countUp}
                  disabled={draft.partySize >= PARTY_SIZE_MAX}
                  onClick={() => {
                    patch({ partySize: Math.min(PARTY_SIZE_MAX, draft.partySize + 1) });
                  }}
                >
                  +
                </button>
              </span>
            </div>
          ) : null}

          <label className={`${styles.rsvpLabel} ${styles.rsvpNoteLabel}`} htmlFor={`${fieldId}-message`}>
            {COPY.messageLabel}
          </label>
          <textarea
            id={`${fieldId}-message`}
            className={styles.rsvpNoteField}
            rows={3}
            maxLength={RSVP_MESSAGE_MAX_LENGTH}
            placeholder={COPY.messagePlaceholder}
            value={draft.message}
            aria-invalid={errors.includes("MESSAGE_TOO_LONG") ? true : undefined}
            onChange={(event) => {
              patch({ message: event.target.value });
            }}
          />

          <p className={note === null ? styles.srOnly : styles.rsvpNote} role="status">
            {note}
          </p>

          <button type="submit" className={styles.rsvpSubmit} aria-disabled={pending ? true : undefined} data-rsvp-phase={phase.toLowerCase()}>
            {pending ? COPY.submitting : COPY.submit}
          </button>
        </form>
      </div>
    </section>
  );
}
