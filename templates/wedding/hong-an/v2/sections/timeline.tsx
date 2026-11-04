import type { ViewModelTimelineItem } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { HONG_AN_V2_COPY } from "../copy";
import styles from "../hong-an-v2.module.css";
import { SectionHeading } from "./arch";

const COPY = HONG_AN_V2_COPY.timeline;

/**
 * Section 10 — "Lịch Trình Hôn Lễ" (HA-TEMPLATE-01).
 *
 * The canonical `content.timeline` steps, in their canonical order, each
 * keeping its OWN `time` and `label` exactly as configured. Nothing here is
 * derived from, compared with or synchronized to the ceremony or the
 * reception: a step that says 09:00 says 09:00 even if the Mass is at 09:30,
 * because the run-of-show is its own canonical table.
 *
 * A gold hairline runs the column with a small knot at each step; the
 * ornament is CSS, so a step is readable with no motion and no decoration.
 */
export function Timeline({ items }: { readonly items: readonly ViewModelTimelineItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="ha-timeline-heading" data-reveal="rise">
      <SectionHeading id="ha-timeline-heading">{COPY.heading}</SectionHeading>

      <ol className={styles.timeline}>
        <span className={styles.timelineLine} aria-hidden="true" />
        {items.map((item) => (
          <li key={item.id} className={styles.timelineStep} data-reveal="knot">
            <span className={styles.timelineKnot} aria-hidden="true" />
            <p className={styles.timelineTime}>{item.time}</p>
            <p className={styles.timelineLabel}>{item.label}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
