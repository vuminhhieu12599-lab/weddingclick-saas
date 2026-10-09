import type { ViewModelTimelineItem } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";

/**
 * Task 029 timeline, kept exactly as the approved prototype presents it: the
 * leaf divider, then one shared two-column grid (time right-aligned, label
 * left). Every canonical `content.timeline` step in the given order, `time`
 * and `label` verbatim; nothing parsed, sorted, capped or derived.
 */
export function Timeline({ items }: { items: readonly ViewModelTimelineItem[] }) {
  return (
    <section className={styles.sectionDetails} aria-label={ROMANTIC_MINIMAL_V1_COPY.timeline.heading}>
      <div className={styles.timelineReveal}>
        <div className={styles.divider} aria-hidden="true">
          <span className={styles.dividerLine} />
          <span className={styles.dividerDot} />
          <span className={styles.dividerLine} />
        </div>
        <ol className={styles.timelineList}>
          {items.map((item) => (
            <li key={item.id} className={styles.timelineRow}>
              <span className={styles.timelineTime}>{item.time}</span>
              <span className={styles.timelineLabel}>{item.label}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
