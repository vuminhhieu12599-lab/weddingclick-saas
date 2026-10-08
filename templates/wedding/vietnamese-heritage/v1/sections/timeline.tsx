import type { ViewModelTimelineItem } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";

/** At most this many steps share one row; longer schedules wrap (never truncate). */
const MAX_COLUMNS = 4;

/**
 * Task 029 compact ceremonial schedule from `viewModel.content.timeline`
 * (RF7 Timeline amendment): every canonical step in the given order, `time`
 * and `label` as given, in evenly spaced columns separated by gold
 * hairlines. Nothing is parsed, sorted, capped or derived from events.
 */
export function Timeline({ items }: { items: readonly ViewModelTimelineItem[] }) {
  const columns = Math.min(items.length, MAX_COLUMNS);
  return (
    <div className={styles.scheduleBlock} role="group" aria-label={VIETNAMESE_HERITAGE_V1_COPY.timeline.heading}>
      <ol className={styles.schedule} data-columns={columns}>
        {items.map((item, index) => (
          <li key={item.id} className={styles.scheduleItem} data-row-start={index % columns === 0 ? "true" : undefined}>
            <span className={styles.scheduleTime}>{item.time}</span>
            <span className={styles.scheduleLabel}>{item.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
