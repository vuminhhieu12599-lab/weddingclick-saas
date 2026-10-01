import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { MediaImage } from "./media-image";

interface LoveStoryProps {
  story: string;
  /** `viewModel.media.loveStoryPhoto` as given; only a RESOLVED photo is ever shown. */
  photo: MediaResolution | undefined;
  coupleText: string;
}

/**
 * Task029 Love Story (Design Baseline B5 item 13, D8; RF7 Love Story photo
 * amendment): `content.loveStory` as white-soft italic text with its line
 * breaks preserved by CSS, never interpreted as HTML, under the gold quote
 * mark. With a RESOLVED LOVE_STORY_PHOTO: the Task029 full-bleed photo with
 * its moss scrim and the text near the bottom (at least 420 px tall).
 * Without one (absent or UNAVAILABLE): the honest dark moss band; no image
 * is invented and COVER/GALLERY are never used. The section heading is an
 * accessible name only. Visibility is decided by the caller from
 * `sections.loveStory` only.
 */
export function LoveStory({ story, photo, coupleText }: LoveStoryProps) {
  const resolved = photo !== undefined && photo.status === "RESOLVED" ? photo : null;

  return (
    <section
      className={styles.storyBand}
      aria-labelledby="ee-story-heading"
      data-photo={resolved !== null ? "true" : undefined}
    >
      <h2 id="ee-story-heading" className={styles.srOnly}>
        {ELEGANT_EDITORIAL_V1_COPY.loveStory.heading}
      </h2>
      {resolved !== null ? (
        <>
          <MediaImage
            media={resolved}
            alt={`${ELEGANT_EDITORIAL_V1_COPY.loveStoryPhoto.imageAlt} ${coupleText}`}
            className={styles.storyPhoto}
          />
          <div className={styles.storyScrim} aria-hidden="true" />
        </>
      ) : null}
      <div className={styles.storyCard}>
        <span className={styles.storyQuoteMark} aria-hidden="true">
          &ldquo;
        </span>
        <p className={styles.storyText}>{story}</p>
      </div>
    </section>
  );
}
