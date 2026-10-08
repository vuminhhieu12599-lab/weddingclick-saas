import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { MediaImage } from "./media-image";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.loveStory;

interface LoveStoryProps {
  /** `viewModel.content.loveStory`, shown only when `sections.loveStory` (gated by the root). */
  story: string;
  /** `templateSlots.loveStoryPhoto[0]`. */
  photo: MediaResolution | undefined;
}

/**
 * Task 029 Love Story on the deep oxblood / lacquer-red band with fine gold
 * rules. The canonical story is one plain text (line breaks preserved, never
 * HTML); the prototype's structured milestones have no canonical source and
 * are not rendered. The `templateSlots.loveStoryPhoto[0]` item renders as
 * one framed print only when `RESOLVED`; otherwise the band is text-only.
 * The photo never creates the section (visibility is `sections.loveStory`
 * plus the canonical text) and is never a legacy LOVE_STORY_PHOTO, COVER or
 * GALLERY item.
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
