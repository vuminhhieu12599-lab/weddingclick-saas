"use client";

import { useState } from "react";

import type { RsvpOption } from "./rsvp-options";

export interface RsvpSubmission {
  guestName: string;
  choice: RsvpOption["id"];
  message: string;
  /** ISO instant — stands in for the server-assigned timestamp a real submit would get. */
  submittedAt: string;
}

/**
 * Shared RSVP form behavior (CLAUDE.md §11 — RSVP is a shared domain
 * service, not template-specific logic). Structured as a real form —
 * guest name, one of the three canonical choices, and a free-form lời
 * chúc/message — because the product direction is that these responses
 * are later stored so the bride/groom can view and summarize them
 * (checkpoint V5 §B6). This prototype keeps everything in local React
 * state only: no API, no persistence, no server validation.
 */
export function useRsvpForm(prefillGuestName: string, initialChoice: RsvpOption["id"] | null = null) {
  const [guestName, setGuestName] = useState(prefillGuestName);
  const [choice, setChoice] = useState<RsvpOption["id"] | null>(initialChoice);
  const [message, setMessage] = useState("");
  const [submission, setSubmission] = useState<RsvpSubmission | null>(null);

  const canSubmit = choice !== null && guestName.trim().length > 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || choice === null) return;
    setSubmission({
      guestName: guestName.trim(),
      choice,
      message: message.trim(),
      submittedAt: new Date().toISOString(),
    });
  };

  const editAgain = () => setSubmission(null);

  return { guestName, setGuestName, choice, setChoice, message, setMessage, submission, canSubmit, submit, editAgain };
}
