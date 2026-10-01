import type { ViewModelTimelineItem } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

const COPY = ELEGANT_EDITORIAL_V1_COPY.timeline;

interface TimelineProps {
  /** `viewModel.content.timeline`, already ordered (sort_order, then id); rendered as given. */
  items: readonly ViewModelTimelineItem[];
}

/**
 * Task029 Timeline / Lịch trình (docs/DECISIONS.md RF7 Timeline amendment):
 * the ordered run-of-show steps, each "HH:mm · dot · label", on the ivory
 * band between the Events ✦ and the Countdown's tight ✦. Canonical Timeline
 * values only, never events; the times are the Snapshot's `HH:mm` text,
 * never parsed or reformatted here. Any number of steps. No visible heading
 * (Task029); the heading is an accessible name only.
 */
export function Timeline({ items }: TimelineProps) {
  return (
    <section className={styles.timeline} aria-labelledby="ee-timeline-heading">
      <h2 id="ee-timeline-heading" className={styles.srOnly}>
        {COPY.heading}
      </h2>
      <ol className={styles.timelineList}>
        {items.map((item) => (
          <li key={item.id} className={styles.timelineRow}>
            <time className={styles.timelineTime} dateTime={item.time}>
              {item.time}
            </time>
            <span className={styles.timelineDot} aria-hidden="true" />
            <span className={styles.timelineLabel}>{item.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
