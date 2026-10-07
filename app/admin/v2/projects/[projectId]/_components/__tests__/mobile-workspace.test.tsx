import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PROJECT_STATUS_SEQUENCE, getProjectStatusLabel } from "../../../../../../../lib/presentation/project-status-labels";
import type { ProjectSummary } from "../../../../../../../lib/server/projects/project-types";

/**
 * P1-UX-03: the Staff Project workspace stays operable at 360/390/430 px.
 * There is no DOM/browser renderer here, so these are static render/source
 * checks of the responsive contracts that matter, not every Tailwind class.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/v2/projects/x" }));
vi.mock("../data-tab", () => ({ DataTab: () => <div data-tab="DATA" /> }));
vi.mock("../design-tab", () => ({ DesignTab: () => <div data-tab="DESIGN" /> }));
vi.mock("../review-tab", () => ({ ReviewTab: () => <div data-tab="REVIEW" /> }));
vi.mock("../publish-tab", () => ({ PublishTab: () => <div data-tab="PUBLISH" /> }));
vi.mock("../tasks-tab", () => ({ TasksTab: () => <div data-tab="TASKS" /> }));
vi.mock("../activity-tab", () => ({ ActivityTab: () => <div data-tab="ACTIVITY" /> }));

const { Lifecycle } = await import("../lifecycle");
const { ProjectHeader } = await import("../project-header");
const { WorkspaceTabs } = await import("../workspace-tabs");
const { AdminShell } = await import("../../../../_components/admin-shell");

const COMPONENTS = join(process.cwd(), "app/admin/v2/projects/[projectId]/_components");
const source = (file: string) => readFileSync(join(COMPONENTS, file), "utf8");

/** Class attribute of the first element carrying `marker` (or of the first `<tag` when marker starts with "<"). */
function classOf(html: string, marker: string): string {
  const pattern = marker.startsWith("<") ? `${marker}[\\s>][^>]*>` : `<[^>]*${marker}[^>]*>`;
  const tag = html.match(new RegExp(pattern))?.[0] ?? "";
  return tag.match(/class="([^"]*)"/)?.[1] ?? "";
}

const project = {
  id: "11111111-1111-4111-8111-111111111111",
  projectCode: "WC-2026-0001",
  status: "AWAITING_PAYMENT",
  customer: { displayName: "Nguyễn Thị Phương Thảo & Trần Quốc Bảo Nguyên" },
  packageCodeSnapshot: "COMMON_ONLY",
  packageNameSnapshot: "Gói chung",
  totalPriceVnd: 1_500_000,
  deadlineAt: "2026-10-20T00:00:00.000Z",
  assignedStaff: null,
  createdAt: "2026-10-01T00:00:00.000Z",
} as unknown as ProjectSummary;

describe("Admin shell", () => {
  it("stacks the sidebar above the content below md so the workspace gets the full phone width", () => {
    const html = renderToStaticMarkup(<AdminShell staff={null}>content</AdminShell>);
    const shell = classOf(html, 'class="flex min-h-screen');
    expect(shell).toContain("flex-col");
    expect(shell).toContain("md:flex-row");
    const aside = classOf(html, "<aside");
    expect(aside).toContain("w-full");
    expect(aside).toContain("md:w-60");
    expect(classOf(html, "<main")).toContain("min-w-0");
    expect(classOf(html, "<nav")).toContain("overflow-x-auto");
  });
});

describe("Lifecycle", () => {
  it("still renders every canonical status in the frozen order, marking only the current one", () => {
    const html = renderToStaticMarkup(<Lifecycle status="AWAITING_PAYMENT" />);
    const items = [...html.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map((match) => match[1]);
    expect(items).toEqual(PROJECT_STATUS_SEQUENCE.map(getProjectStatusLabel));
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it("summarizes the current step for phones and scrolls (not wraps) the sequence below sm", () => {
    const html = renderToStaticMarkup(<Lifecycle status="AWAITING_PAYMENT" />);
    const index = PROJECT_STATUS_SEQUENCE.indexOf("AWAITING_PAYMENT");
    expect(html).toContain(`Bước ${index + 1}/${PROJECT_STATUS_SEQUENCE.length}`);
    expect(classOf(html, "data-lifecycle-summary")).toContain("sm:hidden");
    const list = classOf(html, "<ol");
    expect(list).toContain("overflow-x-auto");
    expect(list).toContain("sm:flex-wrap");
  });
});

describe("ProjectHeader", () => {
  it("stacks code and actions on phones and lets long values wrap", () => {
    const html = renderToStaticMarkup(<ProjectHeader project={project} />);
    expect(html).toContain("Xem trước thiệp");
    expect(classOf(html, "data-header-actions")).toContain("sm:flex-row");
    expect(html).toMatch(/class="flex flex-col gap-3 sm:flex-row/);
    expect(html).toContain("break-words");
  });
});

describe("WorkspaceTabs", () => {
  it("keeps all six tabs in an intentional horizontal-scroll strip with touch-size targets", () => {
    const html = renderToStaticMarkup(<WorkspaceTabs project={project} initialTab="PUBLISH" onProjectChanged={() => {}} />);
    const strip = classOf(html, "data-workspace-tab-strip");
    expect(strip).toContain("overflow-x-auto");
    expect(html.match(/<button/g)).toHaveLength(6);
    expect(html.match(/min-h-11/g)).toHaveLength(6);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(classOf(html, 'aria-current="true"')).toContain("bg-slate-100");
    expect(html).toContain('data-tab="PUBLISH"');
  });
});

describe("action groups and one-time links", () => {
  it.each(["review-tab.tsx", "publish-tab.tsx", "access-link-inventory.tsx"])(
    "%s confirmation/action groups stack below sm",
    (file) => {
      const groups = [...source(file).matchAll(/className="([^"]*)" data-mobile-stack/g)].map((match) => match[1]);
      expect(groups.length).toBeGreaterThan(0);
      for (const group of groups) {
        expect(group).toContain("flex-col");
        expect(group).toContain("sm:flex-row");
      }
    },
  );

  it.each(["review-tab.tsx", "publish-tab.tsx"])("%s one-time link input is width-safe and stays selectable", (file) => {
    const input = source(file).match(/<input\s+readOnly[\s\S]*?\/>/)?.[0] ?? "";
    expect(input).toContain("w-full");
    expect(input).toContain("min-w-0");
    expect(input).toContain("event.currentTarget.select()");
  });
});
