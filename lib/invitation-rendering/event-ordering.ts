import type { ProjectEventRecord } from "../server/project-events/project-events-types";

/**
 * The two separate RF2 event orderings (docs/DECISIONS.md RF2). They are
 * deliberately different and must not be conflated:
 *
 * - display order:             sortOrder ASC -> startsAt ASC -> id ASC
 * - ceremony "earliest" order: startsAt ASC -> sortOrder ASC -> id ASC
 *
 * `startsAt` is compared as an instant, not as text: it comes from a
 * TIMESTAMPTZ NOT NULL column whose serialized offset/fraction format can
 * vary. The only write path normalizes it with `toISOString()`
 * (validate-project-event-input.ts), so millisecond precision is lossless.
 * The resolver asserts every `startsAt` parses before any comparison runs.
 * `id` is compared by code unit, never with a locale-dependent collation.
 */
type OrderableEvent = Pick<ProjectEventRecord, "id" | "startsAt" | "sortOrder">;

function compareInstants(a: OrderableEvent, b: OrderableEvent): number {
  return Date.parse(a.startsAt) - Date.parse(b.startsAt);
}

function compareSortOrder(a: OrderableEvent, b: OrderableEvent): number {
  return a.sortOrder - b.sortOrder;
}

function compareIds(a: OrderableEvent, b: OrderableEvent): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function compareEventsForDisplay(a: OrderableEvent, b: OrderableEvent): number {
  return compareSortOrder(a, b) || compareInstants(a, b) || compareIds(a, b);
}

export function compareEventsForCeremonyEarliest(a: OrderableEvent, b: OrderableEvent): number {
  return compareInstants(a, b) || compareSortOrder(a, b) || compareIds(a, b);
}
