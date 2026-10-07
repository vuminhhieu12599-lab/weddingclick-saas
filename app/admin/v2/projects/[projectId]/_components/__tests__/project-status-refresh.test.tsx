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
 *
 * P1-UX-02: a FAILED background reload of the current Project also keeps the
 * workspace mounted, with an inline stale-data warning + retry instead of the
 * full-page ErrorState; a summary for a different projectId is never shown.
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

const OTHER_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const FULL_LOADING = "Đang tải dự án...";
const FULL_ERROR = "Không thể tải dữ liệu";
const SYNCING = "Đang đồng bộ trạng thái dự án...";
const SYNC_WARNING = "Không thể đồng bộ trạng thái dự án.";

/**
 * Element tree returned by ProjectDetail (the Suspense child of the page). Its
 * only hooks are the mocked useParams/useSearchParams/useAdminQuery, so it can
 * be called directly to inspect retry wiring without a DOM renderer.
 */
function renderDetailTree(): ReactNode {
  const suspense = ProjectDetailPage() as ReactElement<{ children: ReactElement }>;
  const detail = suspense.props.children.type as () => ReactNode;
  return detail();
}

function retryHandlerOf(tree: ReactNode, name: string): unknown {
  const [element] = findElements<{ onRetry: () => void }>(tree, name);
  expect(element).toBeDefined();
  return element.props.onRetry;
}

function expectWorkspace(html: string) {
  expect(html).toContain('data-header-status="READY_TO_PUBLISH"');
  expect(html).toContain('data-lifecycle-status="READY_TO_PUBLISH"');
  expect(html).toContain('data-tab="PUBLISH"');
}

function expectNoWorkspace(html: string) {
  expect(html).not.toContain("data-header-status");
  expect(html).not.toContain("data-lifecycle-status");
  expect(html).not.toContain('data-tab="PUBLISH"');
}

describe("ProjectDetail background reload", () => {
  it("first load (no Project yet) shows the full LoadingState", () => {
    queryState.loading = true;
    const html = renderToStaticMarkup(<ProjectDetailPage />);
    expect(html).toContain(FULL_LOADING);
    expect(html).not.toContain(SYNCING);
    expectNoWorkspace(html);
  });

  it("first-load failure (no Project yet) shows the full ErrorState wired to reload", () => {
    queryState.error = "Network down";
    const html = renderToStaticMarkup(<ProjectDetailPage />);
    expect(html).toContain(FULL_ERROR);
    expect(html).not.toContain(SYNC_WARNING);
    expectNoWorkspace(html);
    expect(retryHandlerOf(renderDetailTree(), "ErrorState")).toBe(queryState.reload);
  });

  it("a background reload keeps the existing Project, header, Lifecycle and active Xuất bản tab rendered", () => {
    queryState.data = project;
    queryState.loading = true;
    const html = renderToStaticMarkup(<ProjectDetailPage />);
    expect(html).not.toContain(FULL_LOADING);
    expectWorkspace(html);
    expect(html).toContain(SYNCING);
    expect(html).not.toContain(SYNC_WARNING);
  });

  it("a failed background reload keeps the workspace and shows an inline stale-data warning wired to reload", () => {
    queryState.data = project;
    queryState.error = "Network down";
    const html = renderToStaticMarkup(<ProjectDetailPage />);
    expect(html).not.toContain(FULL_ERROR);
    expect(html).not.toContain(FULL_LOADING);
    expect(html).not.toContain(SYNCING);
    expectWorkspace(html);
    expect(html).toContain(SYNC_WARNING);
    expect(html).toContain("có thể chưa mới nhất");
    expect(html).toContain("Thử lại");

    const tree = renderDetailTree();
    expect(findElements(tree, "ErrorState")).toHaveLength(0);
    expect(retryHandlerOf(tree, "ProjectRefreshNotice")).toBe(queryState.reload);
  });

  it("an idle current Project shows no refresh notice", () => {
    queryState.data = project;
    const html = renderToStaticMarkup(<ProjectDetailPage />);
    expectWorkspace(html);
    expect(html).not.toContain(SYNCING);
    expect(html).not.toContain(SYNC_WARNING);
  });

  it("a stale summary for a different projectId is not shown while loading", () => {
    queryState.data = { ...project, id: OTHER_PROJECT_ID };
    queryState.loading = true;
    const html = renderToStaticMarkup(<ProjectDetailPage />);
    expect(html).toContain(FULL_LOADING);
    expect(html).not.toContain(SYNCING);
    expectNoWorkspace(html);
  });

  it("a stale summary for a different projectId is not shown on error; the full ErrorState is", () => {
    queryState.data = { ...project, id: OTHER_PROJECT_ID };
    queryState.error = "Network down";
    const html = renderToStaticMarkup(<ProjectDetailPage />);
    expect(html).toContain(FULL_ERROR);
    expect(html).not.toContain(SYNC_WARNING);
    expectNoWorkspace(html);
    expect(retryHandlerOf(renderDetailTree(), "ErrorState")).toBe(queryState.reload);
  });

  it("wires the Project summary reload through WorkspaceTabs into PublishTab", () => {
    queryState.data = project;
    renderToStaticMarkup(<ProjectDetailPage />);
    expect(publishTabProps).toHaveLength(1);
    expect(publishTabProps[0].onProjectChanged).toBe(queryState.reload);
  });
});

/** Collects elements rendered directly by a component (child components are not invoked). */
function findElements<P = { onChanged: () => void }>(node: ReactNode, name: string): ReactElement<P>[] {
  if (Array.isArray(node)) {
    return node.flatMap((child: ReactNode) => findElements<P>(child, name));
  }
  if (!isValidElement<P & { children?: ReactNode }>(node)) {
    return [];
  }
  const self = typeof node.type === "function" && node.type.name === name ? [node] : [];
  return [...self, ...findElements<P>(node.props.children, name)];
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
