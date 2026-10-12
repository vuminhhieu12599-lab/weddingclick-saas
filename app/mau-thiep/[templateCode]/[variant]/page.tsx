import type { Metadata } from "next";

import { DEMO_VARIANT_SEGMENT_LIST } from "../../../../lib/showroom/demo/build-demo-render-data";
import { DemoView, demoMetadata, demoTemplateParams, resolveDemoRoute } from "../../_components/demo-view";

/**
 * LAUNCH-P0-04 public demo, nhà trai (GROOM) or nhà gái (BRIDE). The segment
 * only selects the fixed fictional demo variant; it is never identity.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return demoTemplateParams().flatMap((params) => DEMO_VARIANT_SEGMENT_LIST.map((variant) => ({ ...params, variant })));
}

type Params = Promise<{ templateCode: string; variant: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { templateCode, variant } = await params;
  const { template, segment } = resolveDemoRoute(templateCode, variant);
  return demoMetadata(template, segment);
}

export default async function ShowroomDemoVariantPage({ params }: { params: Params }) {
  const { templateCode, variant } = await params;
  const { template, segment } = resolveDemoRoute(templateCode, variant);
  return <DemoView template={template} segment={segment} />;
}
