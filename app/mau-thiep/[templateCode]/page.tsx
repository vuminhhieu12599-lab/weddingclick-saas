import type { Metadata } from "next";

import { DemoView, demoMetadata, demoTemplateParams, resolveDemoRoute } from "../_components/demo-view";

/**
 * LAUNCH-P0-04 public demo, thiệp chung (COMMON). Prerendered for every
 * PUBLIC showroom template; any other code is a 404 (no fallback).
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return demoTemplateParams();
}

type Params = Promise<{ templateCode: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { templateCode } = await params;
  const { template, segment } = resolveDemoRoute(templateCode, undefined);
  return demoMetadata(template, segment);
}

export default async function ShowroomDemoPage({ params }: { params: Params }) {
  const { templateCode } = await params;
  const { template, segment } = resolveDemoRoute(templateCode, undefined);
  return <DemoView template={template} segment={segment} />;
}
