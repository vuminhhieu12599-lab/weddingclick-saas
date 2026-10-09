import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import { OurLovePhotos, type OurLovePhoto } from "../interactive/photo-lightbox";
import styles from "../romantic-minimal-v1.module.css";

/** The `RESOLVED` items of `ourLovePhotos` in slot order, each keeping its 1-based position. */
export function resolvedOurLovePhotos(slot: readonly MediaResolution[]): OurLovePhoto[] {
  return slot.flatMap((media, index): OurLovePhoto[] => (media.status === "RESOLVED" ? [{ position: index + 1, media }] : []));
}

/**
 * Task 029 Our Love: "OUR LOVE", the ordered photo strip, then the canonical
 * `content.loveStory` text (line breaks kept). Rendered by the root only with
 * a visible Love Story (so an empty story hides the whole section). Photos
 * come only from the `ourLovePhotos` slot: 1–2 resolved photos render alone
 * in order at the same tile size, none renders the text without an empty
 * grid; never filled from the gallery and never duplicated (RM-02 ruling).
 */
export function OurLove({ story, slot }: { story: string; slot: readonly MediaResolution[] }) {
  const photos = resolvedOurLovePhotos(slot);
  return (
    <section className={styles.ourLove} aria-labelledby="rm-our-love-heading">
      <div className={styles.ourLoveTitleWrap}>
        <h2 id="rm-our-love-heading" className={styles.ourLoveTitle}>
          {ROMANTIC_MINIMAL_V1_COPY.ourLove.heading}
        </h2>
      </div>
      {photos.length > 0 ? <OurLovePhotos photos={photos} /> : null}
      <div className={styles.ourLoveTextWrap}>
        <p className={styles.ourLoveText}>{story}</p>
      </div>
    </section>
  );
}
