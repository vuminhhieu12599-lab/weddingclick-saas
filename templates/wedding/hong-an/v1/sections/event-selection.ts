import type { ViewModelCeremonyCard, ViewModelEvent } from "../../../../../lib/invitation-rendering/invitation-view-model-types";

/**
 * Hồng Ân v1 — which canonical events each venue section may show
 * (HA-TEMPLATE-01). Pure: no React, no media, no variant rule of its own.
 *
 * Variant resolution has already happened upstream: `events` is the
 * variant-visible list in canonical display order and `ceremonyCards` is one
 * card per operational side, so this module only filters and labels. It
 * never reorders by date, never pairs an event with the wrong side, and
 * never invents a ceremony, a reception, a church or a venue.
 */

/**
 * THE CATHOLIC-MASS QUESTION.
 *
 * The canonical model has no field that says "this ceremony is a Catholic
 * Mass": `occasionType` is only VU_QUY / THANH_HON / RECEPTION / CUSTOM.
 * Relabelling every rite as "Thánh Lễ Hôn Phối" would therefore put words
 * in a Project's mouth — including Projects that are not Catholic at all.
 *
 * The one honest signal available today is the Project's OWN event title:
 * if staff typed a Mass into it, the template honours that and shows the
 * Mass heading. Otherwise the canonical rite title ("Lễ Thành Hôn" / "Lễ Vu
 * Quy") is shown exactly as the resolver produced it.
 *
 * This is a presentation choice over existing data, not a new business
 * rule, and it is recorded as a product-data gap rather than papered over.
 */
const MASS_TITLE_PATTERN = /thánh\s*lễ/i;

export function establishesCatholicMass(cards: readonly ViewModelCeremonyCard[]): boolean {
  return cards.some((card) => MASS_TITLE_PATTERN.test(card.event.title));
}

/**
 * The reception events of the variant-visible list, in canonical order.
 * A Project with no RECEPTION event simply has none: the section is then
 * not rendered at all, rather than borrowing the ceremony's time or place.
 */
export function receptionEvents(events: readonly ViewModelEvent[]): ViewModelEvent[] {
  return events.filter((event) => event.occasionType === "RECEPTION");
}

/** A trimmed non-blank canonical string, or `undefined`. Never a placeholder. */
export function present(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * A map link is offered only for an absolute `http(s)` URL, so a malformed
 * or relative canonical value can never become a broken or surprising link.
 */
export function safeMapUrl(mapUrl: string | null): string | undefined {
  const value = present(mapUrl);
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
