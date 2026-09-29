import Link from "next/link";
import { notFound } from "next/navigation";

import {
  DEFAULT_HARNESS_SCENARIO_ID,
  HARNESS_SCENARIOS,
  HARNESS_SCENARIO_IDS,
  buildHarnessRenderData,
  isHarnessScenarioId,
} from "./harness-scenarios";
import { RendererHarnessClient } from "./renderer-harness-client";

/**
 * RF-06B internal renderer harness page (docs/DECISIONS.md "RF-06-0 …"
 * P23, P25, P38). Server Component: builds serializable render data through
 * the real pure pipeline and hands it to the single harness client wrapper.
 * `?scenario=` only selects a fixed fictional fixture view; it is never guest
 * identity or authorization.
 */
export default async function RendererHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { scenario } = await searchParams;
  const id = scenario === undefined ? DEFAULT_HARNESS_SCENARIO_ID : scenario;
  if (typeof id !== "string" || !isHarnessScenarioId(id)) {
    notFound();
  }

  const data = await buildHarnessRenderData(id);

  return (
    <>
      <nav aria-label="Harness scenarios" className="flex flex-wrap gap-2 bg-neutral-900 px-4 py-3 text-xs text-white">
        {HARNESS_SCENARIO_IDS.map((scenarioId) => (
          <Link
            key={scenarioId}
            href={{ query: { scenario: scenarioId } }}
            aria-current={scenarioId === id ? "page" : undefined}
            className={scenarioId === id ? "rounded bg-white px-2 py-1 text-neutral-900" : "rounded px-2 py-1 underline"}
          >
            {HARNESS_SCENARIOS[scenarioId].label}
          </Link>
        ))}
      </nav>
      <RendererHarnessClient rendererKey={data.rendererKey} viewModel={data.viewModel} sections={data.sections} />
    </>
  );
}
