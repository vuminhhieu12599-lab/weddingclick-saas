import type { ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { HONG_AN_V2_COPY } from "../copy";
import styles from "../hong-an-v2.module.css";
import { SectionHeading } from "./arch";

const COPY = HONG_AN_V2_COPY.loveStory;

/**
 * Section 08 — "Hành Trình Yêu Thương" (HA-TEMPLATE-01).
 *
 * The canonical love story is ONE free-text field. It is therefore
 * presented as what it is: the couple's own prose, set as paragraphs with a
 * gold hairline beside them. The template does not split it into invented
 * milestones, does not manufacture three chapters out of one paragraph and
 * does not date anything the customer did not date.
 *
 * Paragraphs are the customer's own blank lines, nothing more — no
 * Markdown, no HTML, no parsing of their text into structure.
 */
export function LoveStory({
  story,
  photo,
  photoAlt,
}: {
  readonly story: string;
  readonly photo: ResolvedMedia | undefined;
  readonly photoAlt: string;
}) {
  const paragraphs = story
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
  if (paragraphs.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="ha-love-story-heading" data-reveal="rise">
      <SectionHeading id="ha-love-story-heading">{COPY.heading}</SectionHeading>

      {photo === undefined ? null : (
        <figure className={styles.storyFigure} data-reveal="photo">
          <span className={styles.storyArch} aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element -- opaque runtime MediaResolver URL, not a build-known asset */}
          <img
            className={styles.storyPhoto}
            src={photo.url}
            alt={photoAlt}
            width={photo.width ?? undefined}
            height={photo.height ?? undefined}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </figure>
      )}

      <div className={styles.storyProse}>
        <span className={styles.storyThread} aria-hidden="true" />
        {paragraphs.map((paragraph, index) => (
          // Paragraph order is the customer's own prose; the list is
          // static for a render and has no other stable id.
          <p key={index} className={styles.storyParagraph}>
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  );
}
