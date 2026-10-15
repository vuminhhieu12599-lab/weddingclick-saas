import type { ReactNode } from "react";

import { OUR_WEDDING_STORY_V2_COPY } from "../copy";
import styles from "../our-wedding-story-v2.module.css";
import { SectionHead } from "./section-head";

const COPY = OUR_WEDDING_STORY_V2_COPY.rsvpGift;

interface RsvpGiftProps {
  number: string;
  /** The RSVP island, only when `capabilities.rsvp` exists. */
  rsvp: ReactNode | null;
  /** The gift block, only with `sections.gift` and honest gift content. */
  gift: ReactNode | null;
}

/**
 * Visual Freeze v1 "RSVP & Wedding Gift": the kicker names what is shown
 * ("RSVP & Wedding Gift", or one of them alone); the root renders the section
 * only when at least one part exists.
 */
export function RsvpGift({ number, rsvp, gift }: RsvpGiftProps) {
  const kicker = rsvp !== null && gift !== null ? COPY.kickerBoth : rsvp !== null ? COPY.kickerRsvpOnly : COPY.kickerGiftOnly;
  return (
    <section className={styles.section} aria-labelledby="ows-rsvp-gift-heading">
      <SectionHead number={number} kicker={kicker} headingId="ows-rsvp-gift-heading" />
      {rsvp}
      {gift}
    </section>
  );
}
