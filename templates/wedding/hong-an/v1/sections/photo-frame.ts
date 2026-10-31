import type { MediaResolution, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";

/**
 * Hồng Ân v1 — media slot helpers (HA-TEMPLATE-01). Pure.
 *
 * The rule the whole template obeys: a frame shows the first RESOLVED item
 * of its OWN slot, or it is not drawn. Nothing is ever filled from another
 * slot, another media role or a demo photograph, no photograph appears
 * twice to pad a layout, and an UNAVAILABLE item never becomes a broken
 * `<img>` (docs/DECISIONS.md M6–M10).
 */

export function firstResolved(slot: readonly MediaResolution[] | undefined): ResolvedMedia | undefined {
  return slot?.find((item): item is ResolvedMedia => item.status === "RESOLVED");
}

/** Every RESOLVED item of a slot, in the customer's own order. */
export function allResolved(slot: readonly MediaResolution[] | undefined): ResolvedMedia[] {
  return (slot ?? []).filter((item): item is ResolvedMedia => item.status === "RESOLVED");
}
