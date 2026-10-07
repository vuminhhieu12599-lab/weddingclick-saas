import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { MediaImage } from "./media-image";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.loveStory;

interface LoveStoryProps {
  /** `viewModel.content.loveStory`, shown only when `sections.loveStory` (gated by the root). */
  story: string;
  photo: MediaResolution | undefined;
}

/**
 * Task 029 Love Story on the deep oxblood / lacquer-red band. The canonical
 * story is one plain text (line breaks preserved, never HTML); the
 * prototype's structured milestones have no canonical source and are not
 * rendered. The `media.loveStoryPhoto` slot renders only when `RESOLVED`;
 * otherwise the band is text-only. Never COVER/GALLERY, never demo media.
 */
export function LoveStory({ story, photo }: LoveStoryProps) {
  return (
    <section className={styles.loveStory} aria-labelledby="vh-love-story-heading" data-photo={photo?.status === "RESOLVED" ? "present" : "none"}>
      <header className={styles.loveStoryHeader}>
        <p className={styles.loveStoryEyebrow}>{COPY.eyebrow}</p>
        <h2 id="vh-love-story-heading" className={styles.loveStoryHeading}>
          {COPY.heading}
        </h2>
        <span className={styles.loveStoryRule} aria-hidden="true" />
      </header>
      {photo?.status === "RESOLVED" ? (
        <div className={styles.loveStoryPhotoFrame}>
          <MediaImage media={photo} alt={COPY.photoAlt} className={styles.loveStoryPhoto} />
        </div>
      ) : null}
      <p className={styles.loveStoryText}>{story}</p>
    </section>
  );
}
