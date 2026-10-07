import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getAssignedStaffLabel } from "../../../../../../lib/presentation/assigned-staff";
import { formatDateVi } from "../../../../../../lib/presentation/format-date";
import { formatVnd } from "../../../../../../lib/presentation/format-vnd";
import { getPackageLabel } from "../../../../../../lib/presentation/service-catalog-labels";
import { getProjectStatusLabel } from "../../../../../../lib/presentation/project-status-labels";
import type { ProjectSummary } from "../../../../../../lib/server/projects/project-types";
import { ProjectsTable } from "../projects-table";

/**
 * P1-UX-03 follow-up: below md the Projects list renders stacked cards from
 * the same `projects` prop instead of squeezing the 7-column table; md+ keeps
 * the table. CSS-only switch, so both presentations are in the markup.
 */

const projects = [
  {
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
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    projectCode: "WC-2026-0002",
    status: "PUBLISHED",
    customer: { displayName: "Lê Văn An" },
    packageCodeSnapshot: "COMMON_ONLY",
    packageNameSnapshot: "Gói chung",
    totalPriceVnd: 2_000_000,
    deadlineAt: "2026-11-01T00:00:00.000Z",
    assignedStaff: { id: "s1", displayName: "Hiếu" },
    createdAt: "2026-10-02T00:00:00.000Z",
  },
] as unknown as ProjectSummary[];

const html = renderToStaticMarkup(<ProjectsTable projects={projects} />);

function element(marker: string): string {
  return html.match(new RegExp(`<[^>]*${marker}[^>]*>`))?.[0] ?? "";
}

/** Markup of one mobile card. */
function card(id: string): string {
  const start = html.indexOf(`data-project-card="${id}"`);
  return html.slice(start, html.indexOf("</li>", start));
}

describe("ProjectsTable responsive presentations", () => {
  it("renders mobile cards only below md and the desktop table only at md+", () => {
    expect(element("data-projects-mobile-list")).toContain("md:hidden");
    const table = element("data-projects-desktop-table");
    expect(table).toContain("hidden");
    expect(table).toContain("md:block");
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html.match(/data-project-card=/g)).toHaveLength(projects.length);
  });

  it("keeps every project link at /admin/v2/projects/{id} in both presentations", () => {
    for (const project of projects) {
      expect(html.split(`href="/admin/v2/projects/${project.id}"`)).toHaveLength(3);
      expect(card(project.id)).toContain(`href="/admin/v2/projects/${project.id}"`);
      expect(card(project.id)).toContain("Mở dự án");
    }
  });

  it("each mobile card shows code, status, customer, package, total, deadline and staff with the shared formatters", () => {
    for (const project of projects) {
      const markup = card(project.id);
      for (const value of [
        project.projectCode,
        getProjectStatusLabel(project.status),
        project.customer.displayName,
        getPackageLabel(project.packageCodeSnapshot, project.packageNameSnapshot),
        formatVnd(project.totalPriceVnd),
        formatDateVi(project.deadlineAt),
        getAssignedStaffLabel(project.assignedStaff),
      ]) {
        expect(markup).toContain(renderToStaticMarkup(<>{value}</>));
      }
    }
  });
});
