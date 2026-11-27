import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { ViewModelPerson } from "../../../../../lib/invitation-rendering/invitation-view-model-types";

/** The person's display name, or an empty string when Staff left it blank. */
export function nameOf(person: ViewModelPerson): string {
  return person.name?.trim() ?? "";
}

/** Vietnamese given name: the last word ("Hoàng Nam" → "Nam"). */
export function givenNameOf(person: ViewModelPerson): string {
  const words = nameOf(person).split(/\s+/).filter((word) => word.length > 0);
  return words[words.length - 1] ?? "";
}

/** Monogram letter: the given name's first letter, upper-cased with its Vietnamese form kept. */
export function initialOf(person: ViewModelPerson): string {
  return Array.from(givenNameOf(person))[0]?.toLocaleUpperCase("vi") ?? "";
}

/** Cover name size: long Vietnamese names step down so each keeps to two lines. */
export function coverNameSize(first: ViewModelPerson, second: ViewModelPerson): string {
  const longest = Math.max(nameOf(first).length, nameOf(second).length);
  if (longest <= 11) return "13.5vw";
  if (longest <= 15) return "11vw";
  if (longest <= 19) return "9.4vw";
  return "8.2vw";
}

export function dottedDate(date: EventDateTimePresentationV1): string {
  return `${date.day}.${date.month}.${date.year}`;
}

export function spacedDate(date: EventDateTimePresentationV1): string {
  return `${date.day} · ${date.month} · ${date.year}`;
}
