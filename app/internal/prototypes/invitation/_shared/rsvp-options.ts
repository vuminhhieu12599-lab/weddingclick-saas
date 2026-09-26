export interface RsvpOption {
  id: "attending" | "maybe" | "declined";
  label: string;
}

/**
 * Canonical three-state RSVP choice set (checkpoint spec §10) — shared
 * wording so it is defined once, not redefined per template. Prototype
 * scope: local React state only, no API, no persistence.
 */
export const RSVP_OPTIONS: RsvpOption[] = [
  { id: "attending", label: "Sẽ tham dự" },
  { id: "maybe", label: "Sẽ cố gắng tham dự" },
  { id: "declined", label: "Tiếc quá, không tham dự được" },
];
