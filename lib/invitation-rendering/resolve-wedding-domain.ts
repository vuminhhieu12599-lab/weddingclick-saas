import { EVENT_SIDES, INVITATION_VARIANTS, OCCASION_TYPES } from "../domain";
import type { ProjectEventRecord } from "../server/project-events/project-events-types";
import { isValidTimestamptz } from "../server/validation/timestamptz";
import { compareEventsForCeremonyEarliest, compareEventsForDisplay } from "./event-ordering";
import type {
  ResolveWeddingDomainInput,
  ResolvedCeremony,
  WeddingDomainIssue,
  WeddingDomainResolution,
  WeddingFamilies,
  WeddingPartiesSource,
  WeddingPeople,
} from "./wedding-domain-types";
import {
  WEDDING_VARIANT_RULES,
  type CeremonyTier,
  type WeddingVariantRules,
} from "./wedding-variant-rules";

/**
 * Thrown only when the input breaks a guarantee the canonical data layer
 * already enforces (DB CHECK/PK/TIMESTAMPTZ constraints, validated write
 * path). It signals a programming/data-integrity fault, never a business
 * outcome — business outcomes are reported as `WeddingDomainIssue`s.
 */
export class WeddingDomainInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeddingDomainInvariantError";
  }
}

/**
 * Production Wedding Domain Resolver (docs/DECISIONS.md RF2–RF6).
 *
 * Pure and deterministic: the result depends only on the explicit input
 * values — never on object identity or input array order — and the input
 * is never mutated. Every returned object is a fresh copy.
 */
export function resolveWeddingDomain(input: ResolveWeddingDomainInput): WeddingDomainResolution {
  const { variant, weddingDetails, events } = input;

  if (!(INVITATION_VARIANTS as readonly string[]).includes(variant)) {
    throw new WeddingDomainInvariantError(`Unsupported invitation variant: ${String(variant)}`);
  }
  assertCanonicalEvents(events);

  const rules = WEDDING_VARIANT_RULES[variant];
  const visibleEvents = resolveVisibleEvents(events, rules);

  const base = {
    variant,
    primarySide: rules.primarySide,
    secondarySide: rules.secondarySide,
    operationalSides: [...rules.operationalSides],
    people: resolvePeople(weddingDetails),
    families: resolveFamilies(weddingDetails),
    visibleEvents,
  };

  const ceremonyEvent = selectCeremonyEvent(visibleEvents, rules);

  if (ceremonyEvent === null) {
    const issue: WeddingDomainIssue = {
      code: "REQUIRED_CEREMONY_EVENT_MISSING",
      severity: "BLOCKING",
      message: `No visible ${rules.ceremonyOccasion} event exists for the ${variant} invitation`,
    };
    return { ...base, status: "BLOCKED", ceremony: null, issues: [issue] };
  }

  const ceremony: ResolvedCeremony = {
    eventId: ceremonyEvent.id,
    occasionType: ceremonyEvent.occasionType,
    title: rules.ceremonyTitle,
    lunarDateDisplay: ceremonyEvent.lunarDateDisplay,
    event: ceremonyEvent,
  };

  return { ...base, status: "RESOLVED", ceremony, issues: [] };
}

/** RF2 visibility by explicit `side`, then RF2 display order. */
function resolveVisibleEvents(
  events: readonly ProjectEventRecord[],
  rules: WeddingVariantRules,
): ProjectEventRecord[] {
  return events
    .filter((event) => rules.visibleSides.includes(event.side))
    .map((event) => ({ ...event }))
    .sort(compareEventsForDisplay);
}

/**
 * RF2 occasion-matched ceremony selection. Candidates come only from the
 * already-visible events; tiers run in order and the first non-empty tier
 * wins, broken by the ceremony "earliest" order.
 */
function selectCeremonyEvent(
  visibleEvents: readonly ProjectEventRecord[],
  rules: WeddingVariantRules,
): ProjectEventRecord | null {
  const candidates = visibleEvents
    .filter((event) => event.occasionType === rules.ceremonyOccasion)
    .sort(compareEventsForCeremonyEarliest);

  for (const tier of rules.ceremonyTiers) {
    const match = candidates.find((event) => matchesTier(event, tier));
    if (match !== undefined) {
      return match;
    }
  }

  return null;
}

function matchesTier(event: ProjectEventRecord, tier: CeremonyTier): boolean {
  switch (tier.kind) {
    case "PRIMARY_ON_SIDE":
      return event.isPrimary && event.side === tier.side;
    case "EARLIEST_ON_SIDE":
      return event.side === tier.side;
    case "EARLIEST":
      return true;
  }
}

function resolvePeople(details: WeddingPartiesSource): WeddingPeople {
  return {
    groom: { side: "GROOM", name: details.groomName },
    bride: { side: "BRIDE", name: details.brideName },
  };
}

function resolveFamilies(details: WeddingPartiesSource): WeddingFamilies {
  return {
    groom: {
      side: "GROOM",
      father: details.groomFather,
      mother: details.groomMother,
      address: details.groomFamilyAddress,
    },
    bride: {
      side: "BRIDE",
      father: details.brideFather,
      mother: details.brideMother,
      address: details.brideFamilyAddress,
    },
  };
}

/**
 * Guards the canonical guarantees the orderings rely on (unique PK ids,
 * CHECK-constrained side/occasion, INTEGER sort_order, TIMESTAMPTZ
 * starts_at) so a comparator can never see NaN or an unknown enum value.
 */
function assertCanonicalEvents(events: readonly ProjectEventRecord[]): void {
  const seenIds = new Set<string>();

  for (const event of events) {
    if (typeof event.id !== "string" || event.id.length === 0) {
      throw new WeddingDomainInvariantError("Project event id must be a non-empty string");
    }
    if (seenIds.has(event.id)) {
      throw new WeddingDomainInvariantError(`Duplicate project event id: ${event.id}`);
    }
    seenIds.add(event.id);

    if (!(EVENT_SIDES as readonly string[]).includes(event.side)) {
      throw new WeddingDomainInvariantError(`Project event ${event.id} has an unknown side`);
    }
    if (!(OCCASION_TYPES as readonly string[]).includes(event.occasionType)) {
      throw new WeddingDomainInvariantError(
        `Project event ${event.id} has an unknown occasion type`,
      );
    }
    if (!Number.isInteger(event.sortOrder)) {
      throw new WeddingDomainInvariantError(
        `Project event ${event.id} has a non-integer sortOrder`,
      );
    }
    if (typeof event.startsAt !== "string" || !isValidTimestamptz(event.startsAt)) {
      throw new WeddingDomainInvariantError(
        `Project event ${event.id} has an invalid startsAt timestamp`,
      );
    }
  }
}
