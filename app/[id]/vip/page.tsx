import { LEGACY_V1_METADATA, LegacyV1Unavailable } from "../../../components/legacy-v1-retired";

/**
 * Legacy V1 route — retired by Task 035B (docs/SECURITY.md §11.2). Renders a
 * fixed unavailable state; it no longer reads or writes any V1 table.
 */
export const metadata = LEGACY_V1_METADATA;

export default function LegacyV1RetiredPage() {
  return <LegacyV1Unavailable />;
}
