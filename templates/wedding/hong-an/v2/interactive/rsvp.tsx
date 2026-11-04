"use client";

import { useCallback, useId, useReducer, useRef, useState } from "react";

import { RSVP_ATTENDANCE_STATUSES } from "../../../../../lib/domain";
import type { RsvpCapabilityV1 } from "../../../../../lib/invitation-rendering/rsvp-capability";
import {
  INITIAL_RSVP_DRAFT,
  RSVP_GUEST_NAME_MAX_LENGTH,
  RSVP_MESSAGE_MAX_LENGTH,
  RSVP_PARTY_SIZE_CHOICES,
  buildRsvpSubmitInput,
  createRsvpSubmissionGate,
  rsvpPhaseReducer,
  rsvpTakesPartySize,
  type RsvpDraft,
  type RsvpDraftError,
} from "../../../../../lib/invitation-rendering/rsvp-form-model";
import { HONG_AN_V2_COPY } from "../copy";
import styles from "../hong-an-v2.module.css";
import { SectionHeading } from "../sections/arch";

const COPY = HONG_AN_V2_COPY.rsvp;

/**
 * Section 12 — "Hồi Âm & Lời Chúc" (HA-TEMPLATE-01; presentation HA-DESIGN-02).
 *
 * Presentation only. Every rule that decides what a valid reply is, what
 * happens to it and what the guest is told lives in the shared
 * `rsvp-form-model`, which this island drives unchanged: the draft → input
 * construction, the four-outcome state machine and the duplicate-submit
 * gate are the same ones the other production renderers use. No RSVP API,
 * no persistence, no endpoint and no validation of its own is introduced
 * here (CLAUDE.md §11).
 *
 * NO FALSE SUCCESS. The success panel is shown only for a capability
 * result of `SUCCESS`; `INVALID`, `UNAVAILABLE`, `FAILED` and an unexpected
 * rejection all stay on the form with their own message, and the gate makes
 * a double submit impossible. Where the host supplies no RSVP capability
 * the section is not rendered at all, so a card that cannot record a reply
 * is never drawn.
 *
 * PRESENTATION (HA-DESIGN-02): an ivory stationery sheet with a pointed
 * Gothic arch crest and a lily sprig at its foot. Both are aria-hidden
 * spans with no pointer events; the wedding wish is the existing optional
 * guest-message field, never a second store or submission.
 *
 * NEUTRAL CONFIRMATION. The success copy is "Cảm ơn bạn đã gửi hồi âm" —
 * a guest who answered "không thể tham dự" must not be thanked for
 * attending.
 *
 * The island never sees a token or a guest id: the server derives the guest
 * from the personalized route's own token. The typed name is display data
 * only and is never prefilled from the invitation's guest overlay (K18).
 */
export function Rsvp({ rsvp }: { readonly rsvp: RsvpCapabilityV1 }) {
  const [draft, setDraft] = useState<RsvpDraft>(INITIAL_RSVP_DRAFT);
  const [phase, dispatch] = useReducer(rsvpPhaseReducer, "IDLE");
  const [errors, setErrors] = useState<readonly RsvpDraftError[]>([]);
  const gate = useRef(createRsvpSubmissionGate());
  const nameId = useId();
  const messageId = useId();
  const partyId = useId();

  const submit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const built = buildRsvpSubmitInput(draft);
      if (!built.ok) {
        setErrors(built.errors);
        return;
      }
      setErrors([]);
      const run = gate.current.run(rsvp, built.input);
      // `null` means a submission is already in flight: never a second request.
      if (run === null) return;
      dispatch({ type: "SUBMIT_STARTED" });
      void run.then((outcome) => dispatch({ type: "SUBMIT_SETTLED", outcome }));
    },
    [draft, rsvp],
  );

  const pending = phase === "PENDING";

  if (phase === "SUCCESS") {
    return (
      <section className={styles.sectionSacred} aria-labelledby="ha-rsvp-heading" data-reveal="rise">
        <SectionHeading id="ha-rsvp-heading">{COPY.heading}</SectionHeading>
        <div className={styles.rsvpCard}>
          <span className={styles.rsvpCrest} aria-hidden="true" />
          <p className={styles.rsvpSuccess} role="status">
            {COPY.success}
          </p>
          <button className={styles.rsvpEdit} type="button" onClick={() => dispatch({ type: "EDIT" })}>
            {COPY.edit}
          </button>
          <span className={styles.rsvpSprig} aria-hidden="true" />
        </div>
      </section>
    );
  }

  return (
    <section className={styles.sectionSacred} aria-labelledby="ha-rsvp-heading" data-reveal="rise">
      <SectionHeading id="ha-rsvp-heading">{COPY.heading}</SectionHeading>
      <p className={styles.rsvpIntro}>{COPY.intro}</p>

      <form className={styles.rsvpCard} onSubmit={submit} noValidate>
        <span className={styles.rsvpCrest} aria-hidden="true" />
        <label className={styles.rsvpLabel} htmlFor={nameId}>
          {COPY.nameLabel}
        </label>
        <input
          className={styles.rsvpInput}
          id={nameId}
          type="text"
          value={draft.guestName}
          maxLength={RSVP_GUEST_NAME_MAX_LENGTH}
          placeholder={COPY.namePlaceholder}
          autoComplete="name"
          onChange={(event) => setDraft((current) => ({ ...current, guestName: event.target.value }))}
        />

        <fieldset className={styles.rsvpChoices}>
          <legend className={styles.rsvpLabel}>{COPY.attendanceLabel}</legend>
          {RSVP_ATTENDANCE_STATUSES.map((status) => (
            <label key={status} className={styles.rsvpChoice} data-selected={draft.attendance === status}>
              <input
                type="radio"
                name="ha-attendance"
                value={status}
                checked={draft.attendance === status}
                onChange={() => setDraft((current) => ({ ...current, attendance: status }))}
              />
              <span>{COPY.attendance[status]}</span>
            </label>
          ))}
        </fieldset>

        {rsvpTakesPartySize(draft.attendance) ? (
          <>
            <label className={styles.rsvpLabel} htmlFor={partyId}>
              {COPY.partySizeLabel}
            </label>
            <select
              className={styles.rsvpSelect}
              id={partyId}
              value={draft.partySize}
              onChange={(event) => setDraft((current) => ({ ...current, partySize: Number(event.target.value) }))}
            >
              {RSVP_PARTY_SIZE_CHOICES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <label className={styles.rsvpLabel} htmlFor={messageId}>
          {COPY.messageLabel}
        </label>
        <textarea
          className={styles.rsvpTextarea}
          id={messageId}
          rows={4}
          value={draft.message}
          maxLength={RSVP_MESSAGE_MAX_LENGTH}
          placeholder={COPY.messagePlaceholder}
          onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
        />

        {errors.length === 0 ? null : (
          <ul className={styles.rsvpErrors} role="alert">
            {errors.map((error) => (
              <li key={error}>{COPY.errors[error]}</li>
            ))}
          </ul>
        )}

        {/* An unsuccessful capability outcome, stated plainly. Never success. */}
        {phase === "INVALID" || phase === "UNAVAILABLE" || phase === "FAILED" ? (
          <p className={styles.rsvpResult} role="alert">
            {COPY.results[phase]}
          </p>
        ) : null}

        <button className={styles.rsvpSubmit} type="submit" disabled={pending}>
          {pending ? COPY.submitting : COPY.submit}
        </button>
        <span className={styles.rsvpSprig} aria-hidden="true" />
      </form>
    </section>
  );
}
