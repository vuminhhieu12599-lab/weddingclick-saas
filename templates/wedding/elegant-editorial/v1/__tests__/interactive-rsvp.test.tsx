import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  rsvpTakesPartySize,
  type RsvpDraft,
  type RsvpPhase,
} from "../interactive/rsvp-model";

vi.mock("../fonts", () => ({ ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables" }));

const { ElegantEditorialV1 } = await import("../elegant-editorial-v1");
const { ELEGANT_EDITORIAL_V1_COPY: COPY } = await import("../copy");
const { Rsvp, createRsvpSubmissionGate, rsvpSuccessText, settleRsvpSubmit } = await import("../interactive/rsvp");
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

// RSVP completion amendment: one input rule for personalized and unpersonalized invitations.
describe("response name (always required, never identity)", () => {
  it.each(["", " ", "\t\n  "])("blank name %j is invalid locally", (guestName) => {
    expect(buildRsvpSubmitInput(draft({ attendance: "ATTENDING", guestName }))).toStrictEqual({
      ok: false,
      errors: ["GUEST_NAME_REQUIRED"],
    });
  });

  it("a free-form name is sent trimmed, and is the only name in the input", () => {
    const result = buildRsvpSubmitInput(draft({ attendance: "ATTENDING", partySize: 2, guestName: " Em và sự cô đơn " }));
    expect(result).toStrictEqual({
      ok: true,
      input: { attendance: "ATTENDING", partySize: 2, message: null, guestName: "Em và sự cô đơn" },
    });
    expect(result.ok && Object.keys(result.input).sort()).toStrictEqual(["attendance", "guestName", "message", "partySize"]);
  });
});

describe("status / party size / message", () => {
  it("exactly three attendance choices, in order ATTENDING → MAYBE → NOT_ATTENDING", () => {
    expect(RSVP_ATTENDANCE_STATUSES).toStrictEqual(["ATTENDING", "MAYBE", "NOT_ATTENDING"]);
    expect(COPY.rsvp.attendanceLabels).toStrictEqual({
      ATTENDING: "Sẽ tham dự",
      MAYBE: "Sẽ cố gắng tham dự",
      NOT_ATTENDING: "Tiếc quá, không tham dự được",
    });
  });

  it("no attendance chosen is invalid locally", () => {
    expect(buildRsvpSubmitInput(draft({ attendance: null, guestName: "Khách" }))).toStrictEqual({
      ok: false,
      errors: ["ATTENDANCE_REQUIRED"],
    });
  });

  it("the Task029 select starts on \"Sẽ tham dự\" (ATTENDING) with party size 1; nothing comes from a stored response (K18)", () => {
    expect(INITIAL_RSVP_DRAFT).toStrictEqual({ attendance: "ATTENDING", partySize: 1, message: "", guestName: "" });
    expect(Object.isFrozen(INITIAL_RSVP_DRAFT)).toBe(true);
  });

  it("party-size choices are exactly the 1–20 range", () => {
    expect(RSVP_PARTY_SIZE_CHOICES).toStrictEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  it.each(["ATTENDING", "MAYBE"] as const)("%s: party size 1 and 20 valid; 0, 21, 1.5, NaN invalid", (attendance) => {
    for (const partySize of [1, 20]) {
      expect(buildRsvpSubmitInput(draft({ attendance, partySize, guestName: "Khách" }))).toMatchObject({ ok: true, input: { partySize } });
    }
    for (const partySize of [0, 21, 1.5, Number.NaN]) {
      expect(buildRsvpSubmitInput(draft({ attendance, partySize, guestName: "Khách" }))).toStrictEqual({ ok: false, errors: ["PARTY_SIZE_RANGE"] });
    }
  });

  it("NOT_ATTENDING always sends exactly 0, whatever the stale party-size choice", () => {
    const result = buildRsvpSubmitInput(draft({ attendance: "NOT_ATTENDING", partySize: 7, guestName: "Khách" }));
    expect(result.ok && result.input.partySize).toBe(0);
  });

  it("message: blank → null; otherwise verbatim; 500 code points allowed, 501 rejected", () => {
    const base = { attendance: "ATTENDING" as const, guestName: "Khách" };
    const blank = buildRsvpSubmitInput(draft({ ...base, message: "  \n " }));
    expect(blank.ok && blank.input.message).toBeNull();
    const kept = buildRsvpSubmitInput(draft({ ...base, message: "  Chúc mừng!\n" }));
    expect(kept.ok && kept.input.message).toBe("  Chúc mừng!\n");
    const emoji500 = "💐".repeat(RSVP_MESSAGE_MAX_LENGTH);
    expect(rsvpMessageLength(emoji500)).toBe(500);
    expect(buildRsvpSubmitInput(draft({ ...base, message: emoji500 })).ok).toBe(true);
    expect(buildRsvpSubmitInput(draft({ ...base, message: `${emoji500}a` }))).toStrictEqual({
      ok: false,
      errors: ["MESSAGE_TOO_LONG"],
    });
  });

  it("every accepted draft is valid under the canonical validator", () => {
    for (const attendance of RSVP_ATTENDANCE_STATUSES) {
      for (const partySize of RSVP_PARTY_SIZE_CHOICES) {
        const result = buildRsvpSubmitInput(draft({ attendance, partySize, guestName: "Khách", message: "x" }));
        expect(result.ok).toBe(true);
        if (result.ok) expect(isValidRsvpSubmitInputV1(result.input)).toBe(true);
      }
    }
  });

  it("collects every local error at once, the name first", () => {
    expect(buildRsvpSubmitInput(draft({ attendance: null, message: "a".repeat(501) }))).toStrictEqual({
      ok: false,
      errors: ["GUEST_NAME_REQUIRED", "ATTENDANCE_REQUIRED", "MESSAGE_TOO_LONG"],
    });
  });
});

// ---------------------------------------------------------------------------
// K17/K18/P32 results and state machine (unit-test doubles only)
// ---------------------------------------------------------------------------

const VALID_INPUT: RsvpSubmitInputV1 = Object.freeze({ attendance: "ATTENDING", partySize: 2, message: null, guestName: "Anh Hiếu" });

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

  it("every non-success result has fixed, distinct copy that never speaks of success", () => {
    expect(Object.keys(COPY.rsvp.results).sort()).toStrictEqual(["FAILED", "INVALID", "UNAVAILABLE"]);
    const texts = (["INVALID", "UNAVAILABLE", "FAILED"] as const).map((status) => COPY.rsvp.results[status]);
    expect(new Set(texts).size).toBe(3);
    for (const text of texts) expect(text).not.toMatch(/ghi nhận|Cảm ơn|phản hồi/);
  });

  it("Design Baseline D11: the exact Task029 success sentence around the presentation-only name", () => {
    expect(rsvpSuccessText({ attendance: "ATTENDING", name: "Anh Hiếu và gia đình", message: null })).toBe(
      "Cảm ơn Anh Hiếu và gia đình đã phản hồi — rất mong được đón tiếp!",
    );
    expect(rsvpSuccessText({ attendance: "NOT_ATTENDING", name: "Em và sự cô đơn", message: "Chúc mừng!" })).toBe(
      "Cảm ơn Em và sự cô đơn đã phản hồi!",
    );
    expect(COPY.rsvp.edit).toBe("Sửa lại");
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

  it("EDIT (\"Sửa lại\") returns from success to the form only; it never creates a success", () => {
    expect(rsvpPhaseReducer("SUCCESS", { type: "EDIT" })).toBe("IDLE");
    for (const phase of ["IDLE", "PENDING", "INVALID", "UNAVAILABLE", "FAILED"] as const) {
      expect(rsvpPhaseReducer(phase, { type: "EDIT" })).toBe(phase);
    }
    // A resubmission after editing starts a new capability round-trip.
    expect(start(rsvpPhaseReducer("SUCCESS", { type: "EDIT" }))).toBe("PENDING");
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
  // Rendered through the root so personalization comes from the real viewModel.guest.
  async function form(personalized: boolean): Promise<string> {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON", ...(personalized ? { guest: FIXTURE_GUESTS.NORMAL } : {}) });
    const html = renderToStaticMarkup(
      <ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={{ rsvp: double({ status: "UNAVAILABLE" }) }} />,
    );
    return html.slice(html.indexOf('aria-labelledby="ee-rsvp-heading"'), html.indexOf('aria-labelledby="ee-gift-heading"'));
  }

  // RSVP completion amendment: name → attendance → party size → message → submit, for every invitation.
  it.each([true, false])("personalized=%s: heading, then name, attendance, party size, message, submit — in that order", async (personalized) => {
    const html = await form(personalized);
    expect(html).toMatch(/<div class="[^"]*rsvpCard[^"]*"><h2 id="ee-rsvp-heading" class="[^"]*rsvpHeading[^"]*">/);
    expect(html).toMatch(
      /<span class="[^"]*rsvpHeadingLine[^"]*">Xác nhận tham dự<\/span> <span class="[^"]*rsvpHeadingLine[^"]*"><span class="[^"]*rsvpHeadingAmp[^"]*">&amp;<\/span>Gửi lời chúc<\/span>/,
    );
    expect(html).toMatch(/<form[^>]*novalidate/i);
    const order = ['id="ee-rsvp-guest-name"', 'id="ee-rsvp-attendance"', 'id="ee-rsvp-party-size"', 'id="ee-rsvp-message"', 'type="submit"'].map((m) => html.indexOf(m));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toStrictEqual(order);
    expect(html).toMatch(/<label for="ee-rsvp-guest-name" class="[^"]*srOnly[^"]*">Tên bạn là gì\?<\/label><input id="ee-rsvp-guest-name"/);
    const input = /<input id="ee-rsvp-guest-name"[^>]*>/.exec(html)?.[0] ?? "";
    for (const attribute of ['name="guestName"', 'type="text"', 'placeholder="Tên bạn là gì?"', 'required=""', 'maxLength="200"']) {
      expect(input).toContain(attribute);
    }
    // Micro-Checkpoint 10: always empty, personalized or not; never pre-filled from guest identity.
    expect(input).toContain('value=""');
    expect(input).not.toContain(FIXTURE_GUESTS.NORMAL.displayName);
    const attendance = html.slice(html.indexOf('id="ee-rsvp-attendance"'), html.indexOf("</select>", html.indexOf('id="ee-rsvp-attendance"')));
    expect([...attendance.matchAll(/<option value="(\w+)"( selected="")?>([^<]*)<\/option>/g)].map((m) => [m[1], m[2] !== undefined, m[3]])).toStrictEqual([
      ["ATTENDING", true, "Sẽ tham dự"],
      ["MAYBE", false, "Sẽ cố gắng tham dự"],
      ["NOT_ATTENDING", false, "Tiếc quá, không tham dự được"],
    ]);
    const party = html.slice(html.indexOf('id="ee-rsvp-party-size"'), html.indexOf("</select>", html.indexOf('id="ee-rsvp-party-size"')));
    expect([...party.matchAll(/<option value="(\d+)"/g)].map((m) => Number(m[1]))).toStrictEqual(RSVP_PARTY_SIZE_CHOICES);
    expect(html).toMatch(/placeholder="Gửi lời chúc đến cô dâu &amp; chú rể…"/);
    expect(html).toMatch(/<button type="submit" class="[^"]*rsvpSubmit[^"]*">Gửi lời chúc<\/button>/);
  });

  it("source: the party-size select shows for ATTENDING and MAYBE only (rsvpTakesPartySize)", () => {
    const code = readFileSync(join(__dirname, "..", "interactive", "rsvp.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toMatch(/\{rsvpTakesPartySize\(draft\.attendance\) \? \(/);
    expect(rsvpTakesPartySize("ATTENDING")).toBe(true);
    expect(rsvpTakesPartySize("MAYBE")).toBe(true);
    expect(rsvpTakesPartySize("NOT_ATTENDING")).toBe(false);
    expect(rsvpTakesPartySize(null)).toBe(false);
  });

  it("an always-present status region announces results; no result or success is shown before a submit", async () => {
    const html = await form(true);
    expect(html).toMatch(/<p class="[^"]*srOnly[^"]*" role="status" data-rsvp-result="idle"><\/p>/);
    for (const text of Object.values(COPY.rsvp.results)) expect(html).not.toContain(text);
    expect(html).not.toMatch(/Cảm ơn|Sửa lại|rsvpEditButton/);
  });

  it("D12 / square controls: 16 px fields, square fields, select and submit", () => {
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const selector of [".rsvpInput,\n.rsvpTextarea", ".rsvpSelect"]) {
      const body = css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
      expect(body, selector).toMatch(/font-size: 16px;/);
      expect(body, selector).toMatch(/border-radius: 0;/);
    }
    const submit = css.slice(css.indexOf(".rsvpSubmit {"), css.indexOf("}", css.indexOf(".rsvpSubmit {")));
    expect(submit).toMatch(/border-radius: 0;/);
    expect(css).not.toMatch(/\.rsvp[A-Za-z]*[^{]*\{[^}]*border-radius: (999px|50%)/);
  });

  it("rendering never submits", () => {
    const rsvp = double({ status: "SUCCESS" });
    renderToStaticMarkup(<Rsvp rsvp={rsvp} />);
    expect(rsvp.submit).not.toHaveBeenCalled();
  });

  it("source: success UI only from the SUCCESS phase; the recap name is presentation only and never sent", () => {
    const code = readFileSync(join(__dirname, "..", "interactive", "rsvp.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toMatch(/const succeeded = phase === "SUCCESS" && recap !== null;/);
    expect(code).toMatch(/name: built\.input\.guestName,/);
    // The capability receives only the model-built input.
    expect(code.match(/gate\.run\(/g)).toHaveLength(1);
    expect(code).toMatch(/gate\.run\(rsvp, built\.input\)/);
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

  it("with a capability: the root passes it by identity and nothing from viewModel.guest", async () => {
    const rsvp = double({ status: "UNAVAILABLE" });
    for (const guest of [FIXTURE_GUESTS.NORMAL, undefined]) {
      const { viewModel, selection } = await buildRendererFixture({ variant: "BRIDE", ...(guest === undefined ? {} : { guest }) });
      const tree = ElegantEditorialV1({ viewModel, sections: selection.effectiveSections, capabilities: { rsvp } });
      const [element] = findElements(tree, Rsvp);
      expect(element?.props).toStrictEqual({ rsvp });
    }
  });

  // Root placement of the RSVP slot is RF-06B static composition (frozen Design
  // Baseline root order: Love Story → RSVP → Gift → Gallery → Closing) and is
  // asserted in elegant-editorial-v1.test.tsx; this island test keeps only the
  // capability-gated rendering of the block.
  it("with a capability: the block renders, exactly once, with its heading", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    const html = renderToStaticMarkup(
      <ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={{ rsvp: double({ status: "UNAVAILABLE" }) }} />,
    );
    expect(html.split('aria-labelledby="ee-rsvp-heading"')).toHaveLength(2);
    expect(rsvpBlock(html)).toContain(`>${COPY.rsvp.heading}</span>`);
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

    const built = buildRsvpSubmitInput(draft({ attendance: "MAYBE", partySize: 2, guestName: "Khách thử" }));
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
