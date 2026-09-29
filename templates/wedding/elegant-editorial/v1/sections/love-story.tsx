import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

interface LoveStoryProps {
  story: string;
}

/**
 * Text-only love story (P7): `content.loveStory` rendered as text with its
 * line breaks preserved by CSS; never interpreted as HTML. No background
 * media is invented. Visibility is decided by the caller from
 * `sections.loveStory` only.
 */
export function LoveStory({ story }: LoveStoryProps) {
  return (
    <section className={styles.sectionSage} aria-labelledby="ee-story-heading">
      <h2 id="ee-story-heading" className={styles.sectionHeading}>
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
