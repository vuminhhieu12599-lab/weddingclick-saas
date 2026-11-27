import type { ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { KHAN_VOAN_V1_COPY } from "../copy";
import styles from "../khan-voan-v1.module.css";
import { MediaImage } from "./media-image";

const COPY = KHAN_VOAN_V1_COPY.story;

interface StoryProps {
  photos: readonly ResolvedMedia[];
  /** The love-story line shown beside the first frame; `null` when the section is off or empty. */
  loveStory: string | null;
}

/** Up to two framed photos, staggered left and right, each with a handwritten line. */
export function Story({ photos, loveStory }: StoryProps) {
  if (photos.length === 0) return null;
  const lines = [
    { title: COPY.firstTitle, text: loveStory },
    { title: COPY.secondTitle, text: COPY.secondLine },
  ];
  return (
    <section className={`${styles.section} ${styles.story}`} aria-label={COPY.heading}>
      {photos.slice(0, 2).map((photo, index) => {
        const line = lines[index];
        return (
          <div key={photo.mediaId} className={styles.storyRow} data-side={index === 0 ? "left" : "right"}>
            <figure className={`${styles.frame} ${styles.wipe}`}>
              <MediaImage media={photo} alt={`${COPY.photoAlt} ${String(index + 1)}`} />
            </figure>
            {line === undefined ? null : (
              <div className={`${styles.storyText} ${styles.reveal}`}>
                <p className={styles.storyTitle}>
                  <span className={styles.ink}>{line.title}</span>
                </p>
                {line.text === null || line.text.trim().length === 0 ? null : <p className={styles.storyLine}>{line.text}</p>}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
