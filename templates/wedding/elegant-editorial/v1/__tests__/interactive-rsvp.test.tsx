import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS, RSVP_ATTENDANCE_STATUSES } from "../../../../../lib/domain";
import {
  RSVP_SUBMIT_RESULT_STATUSES,
  isValidRsvpSubmitInputV1,
  type RsvpCapabilityV1,
  type RsvpSubmitInputV1,
  type RsvpSubmitResultV1,
} from "../../../../../lib/invitation-rendering/rsvp-capability";
import { buildRendererFixture } from "../../../../core/fixtures/renderer-fixture-pipeline";
import { FIXTURE_GUESTS } from "../../../../core/fixtures/renderer-fixture-sources";
import {
  INITIAL_RSVP_DRAFT,
  RSVP_MESSAGE_MAX_LENGTH,
  RSVP_PARTY_SIZE_CHOICES,
  buildRsvpSubmitInput,
  rsvpMessageLength,
  rsvpPhaseForOutcome,
  rsvpPhaseReducer,
  type RsvpDraft,
  type RsvpPhase,
} from "../interactive/rsvp-model";

vi.mock("../fonts", () => ({ ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables" }));

const { ElegantEditorialV1 } = await import("../elegant-editorial-v1");
const { ELEGANT_EDITORIAL_V1_COPY: COPY } = await import("../copy");
const { Rsvp, createRsvpSubmissionGate, settleRsvpSubmit } = await import("../interactive/rsvp");
const { InvitationRendererHost } = await import("../../../../core/invitation-renderer-host");
const { RendererHarnessClient } = await import("../../../../../app/internal/renderer-harness/renderer-harness-client");

/**
 * RF-06D RSVP form (docs/DECISIONS.md RF-05 K15–K20; "RF-06-0 …" P30–P33).
 *
 * SUCCESS / INVALID / UNAVAILABLE / FAILED and rejection are exercised only
 * with the unit-test doubles below (P30); they never exist in production or
 * harness runtime code. The real harness capability is UNAVAILABLE-only.
 */

function double(outcome: RsvpSubmitResultV1 | "reject"): RsvpCapabilityV1 & { submit: ReturnType<typeof vi.fn> } {
  return {
    submit: vi.fn(async () => {
      if (outcome === "reject") throw new Error("unexpected fault");
      return outcome;
    }),
  };
}

function draft(change: Partial<RsvpDraft>): RsvpDraft {
  return { ...INITIAL_RSVP_DRAFT, ...change };
}

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("XMLHttpRequest", vi.fn());
});

afterEach(async () => {
  await new Promise((resolve) => setImmediate(resolve));
  process.off("unhandledRejection", onUnhandled);
  expect(unhandled).toStrictEqual([]);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(XMLHttpRequest).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

function findElements(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => findElements(child as ReactNode, type));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const own = node.type === type ? [node] : [];
  return [...own, ...findElements(node.props.children as ReactNode, type)];
}

function rsvpBlock(html: string): string {
  const start = html.indexOf('aria-labelledby="ee-rsvp-heading"');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", start));
}

// ---------------------------------------------------------------------------
// Frozen K15/K16 input rules
// ---------------------------------------------------------------------------

describe("personalized input (P31: no name input, guestName null)", () => {
  it("ATTENDING sends the chosen party size and guestName: null, even if a name was somehow typed", () => {
    const result = buildRsvpSubmitInput(draft({ attendance: "ATTENDING", partySize: 3, guestName: "ignored" }), true);
    expect(result).toStrictEqual({
      ok: true,
      input: { attendance: "ATTENDING", partySize: 3, message: null, guestName: null },
    });
  });

  it("the display name is never part of the input", () => {
    const result = buildRsvpSubmitInput(draft({ attendance: "NOT_ATTENDING" }), true);
    expect(result.ok && Object.keys(result.input).sort()).toStrictEqual(["attendance", "guestName", "message", "partySize"]);
    expect(JSON.stringify(result)).not.toContain(FIXTURE_GUESTS.NORMAL.displayName);
  });
});

describe("non-personalized input (K16: required name, non-blank after trim)", () => {
  it.each(["", " ", "\t\n  "])("blank name %j is invalid locally", (guestName) => {
    expect(buildRsvpSubmitInput(draft({ attendance: "ATTENDING", guestName }), false)).toStrictEqual({
      ok: false,
      errors: ["GUEST_NAME_REQUIRED"],
    });
  });

  it("a free-form name is sent exactly as typed (no normalization)", () => {
    const result = buildRsvpSubmitInput(draft({ attendance: "ATTENDING", partySize: 2, guestName: " Em và sự cô đơn " }), false);
    expect(result).toStrictEqual({
      ok: true,
      input: { attendance: "ATTENDING", partySize: 2, message: null, guestName: " Em và sự cô đơn " },
    });
  });
});

describe("status / party size / message", () => {
  it("exactly two attendance choices, the canonical ones", () => {
    expect(RSVP_ATTENDANCE_STATUSES).toStrictEqual(["ATTENDING", "NOT_ATTENDING"]);
    expect(Object.keys(COPY.rsvp.attendanceLabels)).toStrictEqual(["ATTENDING", "NOT_ATTENDING"]);
  });

  it("no attendance chosen is invalid locally", () => {
    expect(buildRsvpSubmitInput(INITIAL_RSVP_DRAFT, true)).toStrictEqual({ ok: false, errors: ["ATTENDANCE_REQUIRED"] });
  });

  it("party-size choices are exactly the frozen 1–20 range", () => {
    expect(RSVP_PARTY_SIZE_CHOICES).toStrictEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(INITIAL_RSVP_DRAFT.partySize).toBe(1);
  });

  it.each([0, 21, 1.5, Number.NaN])("ATTENDING party size %s is invalid locally", (partySize) => {
    expect(buildRsvpSubmitInput(draft({ attendance: "ATTENDING", partySize }), true)).toStrictEqual({
      ok: false,
      errors: ["PARTY_SIZE_RANGE"],
    });
  });

  it("ATTENDING 1 and 20 are valid", () => {
    for (const partySize of [1, 20]) {
      expect(buildRsvpSubmitInput(draft({ attendance: "ATTENDING", partySize }), true).ok).toBe(true);
    }
  });

  it("NOT_ATTENDING always sends exactly 0, whatever the stale party-size choice", () => {
    const result = buildRsvpSubmitInput(draft({ attendance: "NOT_ATTENDING", partySize: 7 }), true);
    expect(result.ok && result.input.partySize).toBe(0);
  });

  it("message: blank → null; otherwise verbatim; 500 code points allowed, 501 rejected", () => {
    const blank = buildRsvpSubmitInput(draft({ attendance: "ATTENDING", message: "  \n " }), true);
    expect(blank.ok && blank.input.message).toBeNull();
    const kept = buildRsvpSubmitInput(draft({ attendance: "ATTENDING", message: "  Chúc mừng!\n" }), true);
    expect(kept.ok && kept.input.message).toBe("  Chúc mừng!\n");
    const emoji500 = "💐".repeat(RSVP_MESSAGE_MAX_LENGTH);
    expect(emoji500.length).toBe(1000);
    expect(rsvpMessageLength(emoji500)).toBe(500);
    expect(buildRsvpSubmitInput(draft({ attendance: "ATTENDING", message: emoji500 }), true).ok).toBe(true);
    expect(buildRsvpSubmitInput(draft({ attendance: "ATTENDING", message: `${emoji500}a` }), true)).toStrictEqual({
      ok: false,
      errors: ["MESSAGE_TOO_LONG"],
    });
  });

  it("every accepted draft is valid under the frozen canonical validator", () => {
    for (const personalized of [true, false]) {
      for (const attendance of RSVP_ATTENDANCE_STATUSES) {
        for (const partySize of RSVP_PARTY_SIZE_CHOICES) {
          const result = buildRsvpSubmitInput(draft({ attendance, partySize, guestName: "Khách", message: "x" }), personalized);
          expect(result.ok).toBe(true);
          if (result.ok) expect(isValidRsvpSubmitInputV1(result.input, { personalized })).toBe(true);
        }
      }
    }
  });

  it("collects every local error at once", () => {
    expect(buildRsvpSubmitInput(draft({ message: "a".repeat(501) }), false)).toStrictEqual({
      ok: false,
      errors: ["ATTENDANCE_REQUIRED", "GUEST_NAME_REQUIRED", "MESSAGE_TOO_LONG"],
    });
  });
});

// ---------------------------------------------------------------------------
// K17/K18/P32 results and state machine (unit-test doubles only)
// ---------------------------------------------------------------------------

const VALID_INPUT: RsvpSubmitInputV1 = Object.freeze({ attendance: "ATTENDING", partySize: 2, message: null, guestName: null });

describe("submit results", () => {
  it.each(RSVP_SUBMIT_RESULT_STATUSES)("%s resolves to its own outcome and phase", async (status) => {
    const rsvp = double({ status });
    await expect(settleRsvpSubmit(rsvp, VALID_INPUT)).resolves.toBe(status);
    expect(rsvp.submit).toHaveBeenCalledWith(VALID_INPUT);
    expect(rsvpPhaseForOutcome(status)).toBe(status);
  });

  it("a rejected submit is REJECTED, handled, and presented as FAILED (never SUCCESS)", async () => {
    await expect(settleRsvpSubmit(double("reject"), VALID_INPUT)).resolves.toBe("REJECTED");
    expect(rsvpPhaseForOutcome("REJECTED")).toBe("FAILED");
  });

  it("a synchronously throwing or malformed capability is never SUCCESS", async () => {
    const throwing: RsvpCapabilityV1 = {
      submit: () => {
        throw new TypeError("programming fault");
      },
    };
    await expect(settleRsvpSubmit(throwing, VALID_INPUT)).resolves.toBe("REJECTED");
    for (const malformed of [undefined, null, {}, { status: "OK" }, { status: "success" }, "SUCCESS"]) {
      const rsvp = { submit: async () => malformed } as unknown as RsvpCapabilityV1;
      await expect(settleRsvpSubmit(rsvp, VALID_INPUT)).resolves.toBe("FAILED");
    }
  });

  it("every result has fixed, distinct copy; only SUCCESS copy speaks of success", () => {
    const texts = RSVP_SUBMIT_RESULT_STATUSES.map((status) => COPY.rsvp.results[status]);
    expect(new Set(texts).size).toBe(4);
    for (const status of ["INVALID", "UNAVAILABLE", "FAILED"] as const) {
      expect(COPY.rsvp.results[status]).not.toMatch(/ghi nhận|Cảm ơn/);
    }
  });
});

describe("state machine (P32)", () => {
  const settle = (phase: RsvpPhase, outcome: Parameters<typeof rsvpPhaseForOutcome>[0]) =>
    rsvpPhaseReducer(phase, { type: "SUBMIT_SETTLED", outcome });
  const start = (phase: RsvpPhase) => rsvpPhaseReducer(phase, { type: "SUBMIT_STARTED" });

  it("idle → pending → each settled phase", () => {
    expect(start("IDLE")).toBe("PENDING");
    for (const status of RSVP_SUBMIT_RESULT_STATUSES) expect(settle("PENDING", status)).toBe(status);
    expect(settle("PENDING", "REJECTED")).toBe("FAILED");
  });

  it("pending ignores a second start; success ignores any start", () => {
    expect(start("PENDING")).toBe("PENDING");
    expect(start("SUCCESS")).toBe("SUCCESS");
  });

  it("an explicit retry is possible after every non-success result", () => {
    for (const phase of ["INVALID", "UNAVAILABLE", "FAILED"] as const) expect(start(phase)).toBe("PENDING");
  });

  it("a settlement outside pending changes nothing (no fake success)", () => {
    for (const phase of ["IDLE", "INVALID", "UNAVAILABLE", "FAILED"] as const) expect(settle(phase, "SUCCESS")).toBe(phase);
  });
});

describe("submission concurrency (P32)", () => {
  it("while one submit is pending, further submits start nothing; after it settles, a retry may start", async () => {
    let resolveSubmit: (result: RsvpSubmitResultV1) => void = () => {};
    const rsvp: RsvpCapabilityV1 & { submit: ReturnType<typeof vi.fn> } = {
      submit: vi.fn(
        () =>
          new Promise<RsvpSubmitResultV1>((resolve) => {
            resolveSubmit = resolve;
          }),
      ),
    };
    const gate = createRsvpSubmissionGate();
    const first = gate.run(rsvp, VALID_INPUT);
    expect(first).not.toBeNull();
    expect(gate.run(rsvp, VALID_INPUT)).toBeNull();
    expect(gate.run(rsvp, VALID_INPUT)).toBeNull();
    expect(rsvp.submit).toHaveBeenCalledTimes(1);
    resolveSubmit({ status: "FAILED" });
    await expect(first).resolves.toBe("FAILED");
    const retry = gate.run(rsvp, VALID_INPUT);
    expect(retry).not.toBeNull();
    expect(rsvp.submit).toHaveBeenCalledTimes(2);
    resolveSubmit({ status: "UNAVAILABLE" });
    await expect(retry).resolves.toBe("UNAVAILABLE");
  });

  it("a rejected submit also releases the gate", async () => {
    const gate = createRsvpSubmissionGate();
    const rsvp = double("reject");
    await expect(gate.run(rsvp, VALID_INPUT)).resolves.toBe("REJECTED");
    expect(gate.run(rsvp, VALID_INPUT)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Markup and gates
// ---------------------------------------------------------------------------

describe("form markup (server render / first client render)", () => {
  function form(personalized: boolean): string {
    return renderToStaticMarkup(<Rsvp rsvp={double({ status: "UNAVAILABLE" })} personalized={personalized} />);
  }

  it("personalized: no guest-name input; labelled radio pair, message textarea with limit hint, submit", () => {
    const html = form(true);
    expect(html).not.toMatch(/name="guestName"|ee-rsvp-guest-name/);
    expect(html).toMatch(/<form[^>]*novalidate/i);
    expect(html).toMatch(/<fieldset[^>]*><legend[^>]*>Bạn sẽ tham dự chứ\?<\/legend>/);
    expect([...html.matchAll(/<input type="radio" class="[^"]*rsvpRadio[^"]*" name="attendance" value="(\w+)"\/>/g)].map((m) => m[1])).toStrictEqual([
      "ATTENDING",
      "NOT_ATTENDING",
    ]);
    for (const status of RSVP_ATTENDANCE_STATUSES) expect(html).toContain(`<span>${COPY.rsvp.attendanceLabels[status]}</span>`);
    expect(html).toMatch(/<label for="ee-rsvp-message"[^>]*>[^<]+<\/label><textarea id="ee-rsvp-message"/);
    expect(html).toMatch(/aria-describedby="ee-rsvp-message-hint"/);
    expect(html).toContain(`>0/500 · ${COPY.rsvp.messageLimitPrefix} 500 ${COPY.rsvp.messageLimitSuffix}</p>`);
    expect(html).toMatch(new RegExp(`<button type="submit" class="[^"]*rsvpSubmit[^"]*">${COPY.rsvp.submit}</button>`));
    expect(html).not.toMatch(/\bMAYBE\b|placeholder=/);
    // Party size appears only after ATTENDING is chosen; nothing is prefilled (K18).
    expect(html).not.toMatch(/<select|checked/);
  });

  it("non-personalized: a required, labelled guest-name input", () => {
    const html = form(false);
    expect(html).toMatch(
      /<label for="ee-rsvp-guest-name"[^>]*>Tên của bạn<\/label><input id="ee-rsvp-guest-name" type="text"[^>]*required=""[^>]*name="guestName" value=""\/>/,
    );
  });

  it("an always-present status region announces results; no result is shown before a submit", () => {
    const html = form(true);
    expect(html).toMatch(/<p class="[^"]*srOnly[^"]*" role="status" data-rsvp-result="idle"><\/p>/);
    for (const status of RSVP_SUBMIT_RESULT_STATUSES) expect(html).not.toContain(COPY.rsvp.results[status]);
  });

  it("rendering never submits", () => {
    const rsvp = double({ status: "SUCCESS" });
    renderToStaticMarkup(<Rsvp rsvp={rsvp} personalized={false} />);
    expect(rsvp.submit).not.toHaveBeenCalled();
  });
});

describe("renderer gate (K19, P30)", () => {
  it.each(INVITATION_VARIANTS)("%s: no rsvp capability → no RSVP block, no form, no fake form", async (variant) => {
    const { viewModel, selection } = await buildRendererFixture({ variant });
    const html = renderToStaticMarkup(
      <ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={{}} />,
    );
    expect(html).not.toMatch(/ee-rsvp-heading|<form|<input|<textarea|<select/);
    expect(html).not.toContain(COPY.rsvp.heading);
  });

  it("production host (no RSVP before Task 033) → no RSVP block", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL });
    const html = renderToStaticMarkup(
      <InvitationRendererHost rendererKey={selection.rendererKey} viewModel={viewModel} sections={selection.effectiveSections} />,
    );
    expect(html).not.toMatch(/ee-rsvp-heading|<form/);
  });

  it("with a capability: the root passes it by identity and derives personalization only from viewModel.guest", async () => {
    const rsvp = double({ status: "UNAVAILABLE" });
    for (const guest of [FIXTURE_GUESTS.NORMAL, undefined]) {
      const { viewModel, selection } = await buildRendererFixture({ variant: "BRIDE", ...(guest === undefined ? {} : { guest }) });
      const tree = ElegantEditorialV1({ viewModel, sections: selection.effectiveSections, capabilities: { rsvp } });
      const [element] = findElements(tree, Rsvp);
      expect(element?.props).toStrictEqual({ rsvp, personalized: guest !== undefined });
    }
  });

  it("with a capability: the block sits after the gallery and before the closing", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    const html = renderToStaticMarkup(
      <ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={{ rsvp: double({ status: "UNAVAILABLE" }) }} />,
    );
    expect(html.indexOf("ee-gallery-heading")).toBeLessThan(html.indexOf("ee-rsvp-heading"));
    expect(html.indexOf("ee-rsvp-heading")).toBeLessThan(html.indexOf("ee-closing-heading"));
    expect(rsvpBlock(html)).toContain(`>${COPY.rsvp.heading}</h2>`);
  });
});

describe("harness UNAVAILABLE capability (P33)", () => {
  it("the real harness capability drives the form and resolves only the honest UNAVAILABLE outcome", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "GROOM" });
    const element = RendererHarnessClient({ rendererKey: selection.rendererKey, viewModel, sections: selection.effectiveSections });
    const harnessRsvp = (element.props as { rsvp: RsvpCapabilityV1 }).rsvp;
    const html = renderToStaticMarkup(element);
    expect(rsvpBlock(html)).toMatch(/<form/);
    expect(rsvpBlock(html)).toContain('name="guestName"');

    const built = buildRsvpSubmitInput(draft({ attendance: "ATTENDING", partySize: 2, guestName: "Khách thử" }), false);
    if (!built.ok) throw new Error("fixture draft must be valid");
    const gate = createRsvpSubmissionGate();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const outcome = await gate.run(harnessRsvp, built.input);
      expect(outcome).toBe("UNAVAILABLE");
      const phase = rsvpPhaseReducer(rsvpPhaseReducer("IDLE", { type: "SUBMIT_STARTED" }), {
        type: "SUBMIT_SETTLED",
        outcome: outcome ?? "FAILED",
      });
      expect(phase).toBe("UNAVAILABLE");
      if (phase !== "UNAVAILABLE") throw new Error("unreachable");
      expect(COPY.rsvp.results[phase]).toBe(COPY.rsvp.results.UNAVAILABLE);
    }
  });
});
