import Link from "next/link";
import { notFound } from "next/navigation";

import {
  DEFAULT_HONG_AN_PREVIEW_SCENARIO_ID,
  HONG_AN_PREVIEW_SCENARIOS,
  HONG_AN_PREVIEW_SCENARIO_IDS,
  buildHongAnPreviewData,
  isHongAnPreviewScenarioId,
} from "./hong-an-preview-scenarios";
import { HongAnPreviewClient } from "./preview-client";

/**
 * HA-TEMPLATE-01 — the internal Hồng Ân full-invitation preview.
 *
 * Server Component: builds serializable render data through the real pure
 * pipeline over fictional fixtures and hands it to the single client
 * wrapper. `?scenario=` only selects a fixed fixture view; it is never
 * guest identity and never authorization.
 *
 * Internal and unregistered: Hồng Ân is not in the production catalog, the
 * binding registry or the showroom, so this page is the only way to see it
 * until those separate release steps.
 */
export default async function HongAnPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { scenario } = await searchParams;
  const id = scenario === undefined ? DEFAULT_HONG_AN_PREVIEW_SCENARIO_ID : scenario;
  if (typeof id !== "string" || !isHongAnPreviewScenarioId(id)) {
    notFound();
  }

  const data = await buildHongAnPreviewData(id);

  return (
    <>
      <nav
        aria-label="Kịch bản xem thử Hồng Ân"
        className="flex flex-wrap gap-2 bg-neutral-900 px-4 py-3 text-xs text-white"
      >
        {HONG_AN_PREVIEW_SCENARIO_IDS.map((scenarioId) => (
          <Link
            key={scenarioId}
            href={{ query: { scenario: scenarioId } }}
            aria-current={scenarioId === id ? "page" : undefined}
            className={
              scenarioId === id ? "rounded bg-white px-2 py-1 text-neutral-900" : "rounded px-2 py-1 underline"
            }
          >
            {HONG_AN_PREVIEW_SCENARIOS[scenarioId].label}
          </Link>
        ))}
      </nav>
      <HongAnPreviewClient viewModel={data.viewModel} sections={data.sections} />
    </>
  );
}
