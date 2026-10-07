import type { ViewModelTimelineItem } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";

/**
 * Task 029 compact ceremonial schedule from `viewModel.content.timeline`
 * (RF7 Timeline amendment): canonical steps in the given order, `time` and
 * `label` as given. Every step renders (the row wraps); nothing is parsed,
 * sorted, capped or derived from events.
 */
export function Timeline({ items }: { items: readonly ViewModelTimelineItem[] }) {
  return (
    <section className={styles.schedule} aria-labelledby="vh-timeline-heading">
      <h2 id="vh-timeline-heading" className={styles.srOnly}>
        {VIETNAMESE_HERITAGE_V1_COPY.timeline.heading}
      </h2>
      <ol className={styles.scheduleList}>
        {items.map((item) => (
          <li key={item.id} className={styles.scheduleItem}>
            <span className={styles.scheduleTime}>{item.time}</span>
            <span className={styles.scheduleLabel}>{item.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
