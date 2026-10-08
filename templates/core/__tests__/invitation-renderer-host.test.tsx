import { readFileSync } from "node:fs";
import { renderToStaticMarkupAsync } from "./support/render-static-markup";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS } from "../../../lib/domain";
import { RendererBindingInvariantError } from "../../../lib/invitation-rendering/renderer-binding-errors";
import { buildRendererFixture } from "../fixtures/renderer-fixture-pipeline";
import { FIXTURE_GUESTS } from "../fixtures/renderer-fixture-sources";

// VH-01: the production binding registry also binds Vietnamese Heritage v1, whose
// next/font loaders only run under the Next compiler.
vi.mock("../../wedding/vietnamese-heritage/v1/fonts", () => ({
  VIETNAMESE_HERITAGE_V1_FONT_VARIABLES_CLASS_NAME: "vh-test-font-variables",
}));
vi.mock("../../wedding/elegant-editorial/v1/fonts", () => ({
  ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables",
}));

const { InvitationRendererHost } = await import("../invitation-renderer-host");
const { InvitationRendererHostCore } = await import("../client/invitation-renderer-host-core");
const { ElegantEditorialV1 } = await import("../../wedding/elegant-editorial/v1/elegant-editorial-v1");

/**
 * InvitationRendererHost (docs/DECISIONS.md "RF-06-0 …" P23–P26, P30):
 * exactly three serializable props (RF-06B), fail-closed resolution with no
 * caught binding error, and — from RF-06C — capability construction only
 * inside the client graph through the internal host core, with no RSVP.
 * Capability composition itself is covered in client/__tests__.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");

/**
 * RF-06D replacement of the RF-06B "capabilities ignored" reference: during
 * server render the host supplies exactly a `PAUSED` music capability for a
 * `RESOLVED` audio slot (RF-06C) and nothing else (no clock, no clipboard,
 * no RSVP), so this is the exact direct-render markup reference.
 */
const SERVER_RENDER_CAPABILITIES = Object.freeze({
  music: Object.freeze({ status: "PAUSED" as const, play: async () => {}, pause: async () => {} }),
});

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("InvitationRendererHost", () => {
  it.each(INVITATION_VARIANTS)("%s: renders exactly the renderer markup for its server-render capabilities", async (variant) => {
    const { viewModel, selection } = await buildRendererFixture({ variant, guest: FIXTURE_GUESTS.NORMAL });
    const viaHost = await renderToStaticMarkupAsync(
      <InvitationRendererHost
        rendererKey={selection.rendererKey}
        viewModel={viewModel}
        sections={selection.effectiveSections}
      />,
    );
    const direct = renderToStaticMarkup(
      <ElegantEditorialV1
        viewModel={viewModel}
        sections={selection.effectiveSections}
        capabilities={SERVER_RENDER_CAPABILITIES}
      />,
    );
    expect(viaHost).toBe(direct);
    expect(viaHost).toContain('data-renderer="elegant-editorial-v1"');
    // RF-06D: buttons now exist (opening, gift dialog, music toggle), but the
    // production host never renders an audio element or an RSVP form (P30).
    expect(viaHost).not.toMatch(/<audio|<form|<input|<select|<textarea/);
  });

  it("renders the internal core with exactly the three serializable props and no RSVP", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    const element = InvitationRendererHost({
      rendererKey: selection.rendererKey,
      viewModel,
      sections: selection.effectiveSections,
    });
    expect(element.type).toBe(InvitationRendererHostCore);
    expect(Object.keys(element.props as object).sort()).toStrictEqual(["rendererKey", "sections", "viewModel"]);
    const props = element.props as Record<string, unknown>;
    expect(props.rendererKey).toBe(selection.rendererKey);
    expect(props.viewModel).toBe(viewModel);
    expect(props.sections).toBe(selection.effectiveSections);
    expect("rsvp" in props).toBe(false);
  });

  it("an unknown rendererKey throws the RF-05 binding error (no caught error, no fallback UI)", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    for (const key of ["wedding.elegant-editorial.v2", "", "latest"]) {
      expect(() =>
        renderToStaticMarkup(
          <InvitationRendererHost rendererKey={key} viewModel={viewModel} sections={selection.effectiveSections} />,
        ),
      ).toThrow(RendererBindingInvariantError);
    }
  });

  it("the host props type has no capability, override or callback input", () => {
    type HostProps = Parameters<typeof InvitationRendererHost>[0];
    const keys: (keyof HostProps)[] = ["rendererKey", "viewModel", "sections"];
    expect(keys).toHaveLength(3);
    const valid = {} as HostProps;
    // @ts-expect-error — the production host accepts no capabilities prop (P25).
    const withCapabilities: HostProps = { ...valid, capabilities: Object.freeze({}) };
    // @ts-expect-error — the production host accepts no override bag (P25).
    const withOverrides: HostProps = { ...valid, capabilityOverrides: {} };
    // @ts-expect-error — the production host accepts no RSVP callback (P25, P30).
    const withRsvp: HostProps = { ...valid, rsvp: { submit: async () => ({ status: "UNAVAILABLE" as const }) } };
    expect([withCapabilities, withOverrides, withRsvp]).toHaveLength(3);
  });

  it("source: 'use client', no try/catch, no capability construction, hooks or browser/runtime globals", () => {
    const source = readFileSync(join(REPO_ROOT, "templates/core/invitation-renderer-host.tsx"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(source.startsWith('"use client";\n')).toBe(true);
    expect(code).not.toMatch(/\btry\b|\bcatch\b|ErrorBoundary/);
    expect(code).not.toMatch(/capabilityOverrides|harnessCapabilities|capabilities|rsvp|clipboard|music|clock/i);
    expect(code).not.toMatch(/\buse(State|Effect|Memo|Ref|Callback|Context|SyncExternalStore)\b/);
    expect(code).not.toMatch(/process\.env|window|document|navigator|Audio|Date\.now|new Date|setInterval|setTimeout/);
    expect(code).toMatch(
      /<InvitationRendererHostCore rendererKey=\{rendererKey\} viewModel=\{viewModel\} sections=\{sections\} \/>/,
    );
  });
});
