import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

interface LoveStoryProps {
  story: string;
}

/**
 * Task029 dark moss editorial band, text-only (Design Baseline B5 item 13,
 * D8; P7): a full-column moss band with content-driven height, the gold
 * quote mark and `content.loveStory` as white-soft italic text with its line
 * breaks preserved by CSS; never interpreted as HTML. No background media is
 * invented. The section heading is an accessible name only. Visibility is
 * decided by the caller from `sections.loveStory` only.
 */
export function LoveStory({ story }: LoveStoryProps) {
  return (
    <section className={styles.storyBand} aria-labelledby="ee-story-heading">
      <h2 id="ee-story-heading" className={styles.srOnly}>
        {ELEGANT_EDITORIAL_V1_COPY.loveStory.heading}
      </h2>
      <div className={styles.storyCard}>
        <span className={styles.storyQuoteMark} aria-hidden="true">
          &ldquo;
        </span>
        <p className={styles.storyText}>{story}</p>
      </div>
    </section>
  );
}
