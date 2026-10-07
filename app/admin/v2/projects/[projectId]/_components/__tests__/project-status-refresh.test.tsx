import type { ReactElement, ReactNode } from "react";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectPublishState } from "../../../../../../../lib/server/invitation-publish/invitation-publish-types";
import type { ProjectSummary } from "../../../../../../../lib/server/projects/project-types";

/**
 * P1-UX-01: a successful (or conflicting) Publish-tab lifecycle/payment/publish
 * mutation re-reads the parent Project summary so the header StatusBadge and
 * Lifecycle stepper update without a browser reload, and the background
 * reload keeps the workspace (and its active tab) mounted.
 */

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

let queryState: { data: unknown; loading: boolean; error: string | null; reload: () => void };
let publishTabProps: { project: ProjectSummary; onProjectChanged?: () => void }[] = [];

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: PROJECT_ID }),
  useSearchParams: () => new URLSearchParams("tab=PUBLISH"),
}));
vi.mock("../../../../../../../lib/admin/use-admin-query", () => ({
  useAdminQuery: () => queryState,
}));
vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({
  fetchProjectById: vi.fn(),
  fetchProjectPublishState: vi.fn(),
  publishInvitationVariant: vi.fn(),
  markProjectPaid: vi.fn(),
  transitionProjectStatus: vi.fn(),
  issuePortalAccessLink: vi.fn(),
  rotateAccessLink: vi.fn(),
}));
vi.mock("../project-header", () => ({
  ProjectHeader: ({ project }: { project: ProjectSummary }) => <h1 data-header-status={project.status} />,
}));
vi.mock("../lifecycle", () => ({
  Lifecycle: ({ status }: { status: string }) => <ol data-lifecycle-status={status} />,
}));
vi.mock("../data-tab", () => ({ DataTab: () => <div data-tab="DATA" /> }));
vi.mock("../design-tab", () => ({ DesignTab: () => <div data-tab="DESIGN" /> }));
vi.mock("../review-tab", () => ({ ReviewTab: () => <div data-tab="REVIEW" /> }));
vi.mock("../tasks-tab", () => ({ TasksTab: () => <div data-tab="TASKS" /> }));
vi.mock("../activity-tab", () => ({ ActivityTab: () => <div data-tab="ACTIVITY" /> }));
vi.mock("../publish-tab", () => ({
  PublishTab: (props: { project: ProjectSummary; onProjectChanged?: () => void }) => {
    publishTabProps.push(props);
    return <div data-tab="PUBLISH" />;
  },
}));

const { default: ProjectDetailPage } = await import("../../page");
const { PublishTab } = await vi.importActual<typeof import("../publish-tab")>("../publish-tab");

const project = { id: PROJECT_ID, status: "READY_TO_PUBLISH" } as ProjectSummary;

beforeEach(() => {
  publishTabProps = [];
  queryState = { data: null, loading: false, error: null, reload: vi.fn() };
});

describe("ProjectDetail background reload", () => {
  it("first load (no Project yet) shows the full LoadingState", () => {
    queryState.loading = true;
    const html = renderToStaticMarkup(<ProjectDetailPage />);
    expect(html).toContain("Đang tải dự án...");
    expect(html).not.toContain('data-tab="PUBLISH"');
  });

  it("a background reload keeps the existing Project, header, Lifecycle and active Xuất bản tab rendered", () => {
    queryState.data = project;
    queryState.loading = true;
    const html = renderToStaticMarkup(<ProjectDetailPage />);
    expect(html).not.toContain("Đang tải dự án...");
    expect(html).toContain('data-header-status="READY_TO_PUBLISH"');
    expect(html).toContain('data-lifecycle-status="READY_TO_PUBLISH"');
    expect(html).toContain('data-tab="PUBLISH"');
  });

  it("a stale summary for a different projectId is not shown while loading", () => {
    queryState.data = { ...project, id: "22222222-2222-4222-8222-222222222222" };
    queryState.loading = true;
    expect(renderToStaticMarkup(<ProjectDetailPage />)).toContain("Đang tải dự án...");
  });

  it("wires the Project summary reload through WorkspaceTabs into PublishTab", () => {
    queryState.data = project;
    renderToStaticMarkup(<ProjectDetailPage />);
    expect(publishTabProps).toHaveLength(1);
    expect(publishTabProps[0].onProjectChanged).toBe(queryState.reload);
  });
});

/** Collects elements rendered directly by PublishTab (child components are not invoked). */
function findElements(node: ReactNode, name: string): ReactElement<{ onChanged: () => void }>[] {
  if (Array.isArray(node)) {
    return node.flatMap((child: ReactNode) => findElements(child, name));
  }
  if (!isValidElement<{ children?: ReactNode; onChanged: () => void }>(node)) {
    return [];
  }
  const self = typeof node.type === "function" && node.type.name === name ? [node] : [];
  return [...self, ...findElements(node.props.children, name)];
}

describe("PublishTab change handler", () => {
  const publishState: ProjectPublishState = {
    projectId: PROJECT_ID,
    projectStatus: "APPROVED",
    paymentStatus: "UNPAID",
    packageCode: "COMMON_ONLY",
    requiredVariants: ["COMMON"],
    projectBlocker: "LIFECYCLE_NOT_READY",
    allRequiredVariantsPublished: false,
    variants: [
      {
        variant: "COMMON",
        invitationId: "a1",
        currentReview: null,
        publishedVersion: null,
        upToDate: false,
        canPublish: false,
        blocker: "LIFECYCLE_NOT_READY",
      },
    ],
  };

  // PublishTab itself calls no React hook other than the mocked useAdminQuery,
  // so its element tree can be inspected without a DOM renderer.
  function renderTree(onProjectChanged: () => void) {
    queryState.data = publishState;
    return PublishTab({ project, onProjectChanged });
  }

  it("lifecycle/payment success or conflict refreshes BOTH the publish state and the parent Project summary", () => {
    const onProjectChanged = vi.fn();
    const [card] = findElements(renderTree(onProjectChanged), "PaymentLifecycleCard");
    expect(card).toBeDefined();
    card.props.onChanged();
    expect(queryState.reload).toHaveBeenCalledTimes(1);
    expect(onProjectChanged).toHaveBeenCalledTimes(1);
  });

  it("publish/republish success or 409 refreshes BOTH the publish state and the parent Project summary", () => {
    const onProjectChanged = vi.fn();
    const cards = findElements(renderTree(onProjectChanged), "VariantPublishCard");
    expect(cards).toHaveLength(1);
    cards[0].props.onChanged();
    expect(queryState.reload).toHaveBeenCalledTimes(1);
    expect(onProjectChanged).toHaveBeenCalledTimes(1);
  });
});
