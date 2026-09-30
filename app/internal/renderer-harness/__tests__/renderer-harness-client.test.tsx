import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InvitationRendererPropsV1 } from "../../../../lib/invitation-rendering/renderer-component";
import { RSVP_SUBMIT_RESULT_STATUSES, type RsvpSubmitInputV1 } from "../../../../lib/invitation-rendering/rsvp-capability";
import { HARNESS_SCENARIO_IDS, buildHarnessRenderData } from "../harness-scenarios";

/**
 * RF-06C harness client wrapper (docs/DECISIONS.md "RF-06-0 …" P25, P30,
 * P33, P38): the wrapper, and only the wrapper, constructs the harness RSVP
 * capability inside the client graph; it always resolves `UNAVAILABLE`,
 * persists nothing and sends nothing. The renderer is a spy so the exact
 * capability object can be observed in Node.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const received: InvitationRendererPropsV1[] = [];

vi.mock("../../../../templates/wedding/elegant-editorial/v1/elegant-editorial-v1", () => ({
  ElegantEditorialV1: (props: InvitationRendererPropsV1) => {
    received.push(props);
    return <div data-renderer="spy" />;
  },
}));

const { RendererHarnessClient } = await import("../renderer-harness-client");

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  received.length = 0;
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("XMLHttpRequest", vi.fn());
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

const VALID_INPUTS: RsvpSubmitInputV1[] = [
  { attendance: "ATTENDING", partySize: 2, message: "Chúc mừng!", guestName: "Anh Hiếu và gia đình" },
  { attendance: "NOT_ATTENDING", partySize: 0, message: null, guestName: null },
];

async function harnessCapabilities(id: (typeof HARNESS_SCENARIO_IDS)[number]) {
  const data = await buildHarnessRenderData(id);
  received.length = 0;
  renderToStaticMarkup(<RendererHarnessClient rendererKey={data.rendererKey} viewModel={data.viewModel} sections={data.sections} />);
  expect(received).toHaveLength(1);
  return (received[0] as InvitationRendererPropsV1).capabilities;
}

describe("RendererHarnessClient RSVP capability", () => {
  it.each(HARNESS_SCENARIO_IDS)("%s: the renderer receives exactly { rsvp } during server render", async (id) => {
    const capabilities = await harnessCapabilities(id);
    // Harness audio is UNAVAILABLE and the clock/clipboard appear only after mount.
    // RF-06D: music-resolved alone opts into the local harness tone, so the
    // RF-06C host adds its PAUSED music capability there (P35, P38).
    expect(Reflect.ownKeys(capabilities)).toStrictEqual(id === "music-resolved" ? ["rsvp", "music"] : ["rsvp"]);
    if (id === "music-resolved") expect(capabilities.music?.status).toBe("PAUSED");
    expect(Object.isFrozen(capabilities)).toBe(true);
  });

  it("is one frozen, stable, submit-only capability", async () => {
    const first = (await harnessCapabilities("common-full")).rsvp;
    const second = (await harnessCapabilities("groom")).rsvp;
    expect(first).toBeDefined();
    expect(first).toBe(second);
    expect(Reflect.ownKeys(first as object)).toStrictEqual(["submit"]);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("always resolves UNAVAILABLE (never SUCCESS) and touches no network", async () => {
    const rsvp = (await harnessCapabilities("common-full")).rsvp;
    const inputs: unknown[] = [
      ...VALID_INPUTS,
      { attendance: "MAYBE", partySize: 1, message: null, guestName: "x" },
      { attendance: "ATTENDING", partySize: 99, message: null, guestName: "x" },
      {},
    ];
    for (const input of inputs) {
      const result = await rsvp?.submit(input as RsvpSubmitInputV1);
      expect(result).toStrictEqual({ status: "UNAVAILABLE" });
      expect(Object.isFrozen(result)).toBe(true);
      expect(RSVP_SUBMIT_RESULT_STATUSES).toContain(result?.status);
    }
    expect(XMLHttpRequest).not.toHaveBeenCalled();
  });
});

describe("renderer-harness-client source", () => {
  const source = readFileSync(join(REPO_ROOT, "app/internal/renderer-harness/renderer-harness-client.tsx"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("is a client module that constructs only the UNAVAILABLE outcome", () => {
    expect(source.startsWith('"use client";\n')).toBe(true);
    expect(code.match(/status: "(\w+)"/g)).toStrictEqual(['status: "UNAVAILABLE"']);
    expect(code).not.toMatch(/SUCCESS|INVALID|FAILED/);
  });

  it("has no persistence, network, environment, query or Task 033 path", () => {
    expect(code).not.toMatch(
      /\bfetch\b|XMLHttpRequest|sendBeacon|supabase|service_role|localStorage|sessionStorage|indexedDB|cookie|process\.env|searchParams|token|guestId|use server|\/api\//i,
    );
  });

  it("supplies only rsvp to the host core: no clipboard, music, clock or capability bag", () => {
    expect(code).toMatch(/rsvp=\{HARNESS_RSVP_UNAVAILABLE\}/);
    expect(code).not.toMatch(/clipboard|music|clock|capabilities=|capabilityOverrides/i);
  });
});
