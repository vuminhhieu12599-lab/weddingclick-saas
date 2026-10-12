import type { InvitationVariant } from "../../domain";
import type { InvitationViewModel } from "../../invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../invitation-rendering/renderer-selection";
import { runRendererFixturePipeline } from "../../../templates/core/fixtures/renderer-fixture-pipeline";
import { createDemoMediaResolver } from "./demo-media";
import { buildDemoWeddingSource } from "./demo-wedding-source";

/**
 * LAUNCH-P0-04 — server-side composition of a public showroom demo.
 *
 * Runs the frozen production pipeline (RF-02 Snapshot builder → RF-03 media
 * resolution and ViewModel → RF-04 selection over the production
 * compatibility registry) over the fictional demo records. The result is
 * exactly the serializable data the production host core renders, so the
 * demo shows the real renderer, never a copy. No Supabase, token, guest,
 * Project, published version or customer data is involved.
 */

/** Public URL segment ↔ demo variant. `chung` is the default (no segment). */
export const DEMO_VARIANT_SEGMENTS = Object.freeze({
  "nha-trai": "GROOM",
  "nha-gai": "BRIDE",
} as const satisfies Record<string, InvitationVariant>);

export type DemoVariantSegment = keyof typeof DEMO_VARIANT_SEGMENTS;

export const DEMO_VARIANT_SEGMENT_LIST = Object.freeze(Object.keys(DEMO_VARIANT_SEGMENTS) as DemoVariantSegment[]);

export function isDemoVariantSegment(value: string): value is DemoVariantSegment {
  return Object.hasOwn(DEMO_VARIANT_SEGMENTS, value);
}

export interface DemoRenderData {
  readonly rendererKey: string;
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
}

export async function buildDemoRenderData(rendererKey: string, variant: InvitationVariant): Promise<DemoRenderData> {
  const source = buildDemoWeddingSource(rendererKey, variant);
  const result = await runRendererFixturePipeline(source.input, { resolver: createDemoMediaResolver(source.imageById) });
  return {
    rendererKey: result.selection.rendererKey,
    viewModel: result.viewModel,
    sections: result.selection.effectiveSections,
  };
}
