import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS } from "../../../lib/domain";
import { RendererBindingInvariantError } from "../../../lib/invitation-rendering/renderer-binding-errors";
import { buildRendererFixture } from "../fixtures/renderer-fixture-pipeline";
import { FIXTURE_GUESTS } from "../fixtures/renderer-fixture-sources";

vi.mock("../../wedding/elegant-editorial/v1/fonts", () => ({
  ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables",
}));

const { EMPTY_CAPABILITIES, InvitationRendererHost } = await import("../invitation-renderer-host");
const { ElegantEditorialV1 } = await import("../../wedding/elegant-editorial/v1/elegant-editorial-v1");

/**
 * RF-06B InvitationRendererHost (docs/DECISIONS.md "RF-06-0 …" P23–P26):
 * exactly three serializable props, the empty closed capability object,
 * fail-closed resolution with no caught binding error.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("EMPTY_CAPABILITIES", () => {
  it("is an empty, frozen, closed object", () => {
    expect(Reflect.ownKeys(EMPTY_CAPABILITIES)).toStrictEqual([]);
    expect(Object.isFrozen(EMPTY_CAPABILITIES)).toBe(true);
    expect(Object.getPrototypeOf(EMPTY_CAPABILITIES)).toBe(Object.prototype);
    expect(() => {
      (EMPTY_CAPABILITIES as Record<string, unknown>).rsvp = {};
    }).toThrow(TypeError);
  });
});

describe("InvitationRendererHost", () => {
  it.each(INVITATION_VARIANTS)("%s: renders exactly the resolved renderer with EMPTY_CAPABILITIES", async (variant) => {
    const { viewModel, selection } = await buildRendererFixture({ variant, guest: FIXTURE_GUESTS.NORMAL });
    const viaHost = renderToStaticMarkup(
      <InvitationRendererHost
        rendererKey={selection.rendererKey}
        viewModel={viewModel}
        sections={selection.effectiveSections}
      />,
    );
    const direct = renderToStaticMarkup(
      <ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={EMPTY_CAPABILITIES} />,
    );
    expect(viaHost).toBe(direct);
    expect(viaHost).toContain('data-renderer="elegant-editorial-v1"');
  });

  it("passes only viewModel, sections and the EMPTY_CAPABILITIES object to the renderer", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    const element = InvitationRendererHost({
      rendererKey: selection.rendererKey,
      viewModel,
      sections: selection.effectiveSections,
    });
    expect(element.type).toBe(ElegantEditorialV1);
    expect(Object.keys(element.props as object).sort()).toStrictEqual(["capabilities", "sections", "viewModel"]);
    const props = element.props as Record<string, unknown>;
    expect(props.capabilities).toBe(EMPTY_CAPABILITIES);
    expect(props.viewModel).toBe(viewModel);
    expect(props.sections).toBe(selection.effectiveSections);
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

  it("the host props type has no capability or override input", () => {
    type HostProps = Parameters<typeof InvitationRendererHost>[0];
    const keys: (keyof HostProps)[] = ["rendererKey", "viewModel", "sections"];
    expect(keys).toHaveLength(3);
    const valid = {} as HostProps;
    // @ts-expect-error — RF-06B hosts accept no capabilities prop (P25); the only error here is the extra key.
    const withCapabilities: HostProps = { ...valid, capabilities: EMPTY_CAPABILITIES };
    expect(withCapabilities).toBeDefined();
  });

  it("source: 'use client', no try/catch, no capability construction, no browser/runtime globals", () => {
    const source = readFileSync(join(REPO_ROOT, "templates/core/invitation-renderer-host.tsx"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(source.startsWith('"use client";\n')).toBe(true);
    expect(code).not.toMatch(/\btry\b|\bcatch\b|ErrorBoundary/);
    expect(code).not.toMatch(/capabilityOverrides|harnessCapabilities|rsvp|clipboard|music|clock/i);
    expect(code).not.toMatch(/\buse(State|Effect|Memo|Ref|Callback|Context)\b/);
    expect(code).not.toMatch(/process\.env|window|document|navigator|Date\.now|new Date|setInterval|setTimeout/);
    expect(code).toMatch(/capabilities=\{EMPTY_CAPABILITIES\}/);
  });
});
