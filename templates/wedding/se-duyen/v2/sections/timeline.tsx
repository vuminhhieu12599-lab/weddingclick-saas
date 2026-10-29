import type { ViewModelTimelineItem } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { SE_DUYEN_V2_COPY } from "../copy";
import styles from "../se-duyen-v2.module.css";

const COPY = SE_DUYEN_V2_COPY.timeline;

interface TimelineProps {
  /** `viewModel.content.timeline`, already ordered (sort_order, then id); rendered as given. */
  readonly items: readonly ViewModelTimelineItem[];
}

/**
 * The approved "Lịch Trình Hôn Lễ": a tơ hồng drawn down the page with the
 * day's moments knotted onto it, not a stack of cards. One gold hairline on
 * a fixed left rail, a small knot per step, and the step's hour and title set
 * in the room to its right — nothing boxed, nothing bordered, spaced like
 * stationery rather than packed like a dashboard.
 *
 * EVERY STEP KEEPS ITS OWN HOUR AND ITS OWN WORDING. The hour is the
 * Snapshot's canonical `HH:mm` text (RF7: minute-precision local wall clock,
 * validated at build time), printed exactly as the customer saved it — never
 * parsed, reformatted, re-derived or re-ordered here, and never compared
 * against the ceremony or a reception. The Product Owner explicitly allows a
 * timeline hour to differ from the hour on the invitation and from either
 * side's reception, so nothing in this section is synchronised with anything
 * else on the page.
 *
 * `<time dateTime>` carries the same canonical text, so assistive technology
 * reads the stored value rather than a reformatting of it.
 *
 * The section is rendered only when the Project actually has steps, so an
 * empty band can never appear. There is no per-step note: RF7 gives a step
 * exactly `id`, `time` and `label` (see the stylesheet's own note on the
 * three prototype-only rules this port leaves behind).
 */
export function Timeline({ items }: TimelineProps) {
  return (
    <section className={styles.flow} aria-labelledby="sd-flow-heading">
      <span className={styles.flowWatermark} aria-hidden="true" />

      <div className={styles.flowHead}>
        <p className={styles.flowEyebrow}>{COPY.eyebrow}</p>
        <h2 className={styles.flowHeading} id="sd-flow-heading">
          {COPY.heading}
        </h2>
        <span className={styles.flowRule} aria-hidden="true" />
      </div>

      <ol className={styles.flowList}>
        {items.map((item) => (
          <li key={item.id} className={styles.flowStep}>
            <div className={styles.flowStepBody}>
              <p className={styles.flowTime}>
                <time dateTime={item.time}>{item.time}</time>
              </p>
              <h3 className={styles.flowTitle}>{item.label}</h3>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
