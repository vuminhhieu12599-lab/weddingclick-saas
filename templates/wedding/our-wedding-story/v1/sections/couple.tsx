import type { ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import styles from "../our-wedding-story-v1.module.css";
import { coupleLayout, type CouplePerson } from "./couple-people";
import { MediaImage } from "./media-image";
import { SectionHead } from "./section-head";

const COPY = OUR_WEDDING_STORY_V1_COPY.couple;

function Portrait({ person, className }: { person: CouplePerson & { portrait: ResolvedMedia }; className: string }) {
  return (
    <div className={className} data-side={person.side}>
      <figure className={styles.portraitFigure}>
        <div className={`${styles.photo} ${styles.portraitPhoto}`}>
          <MediaImage media={person.portrait} alt={`${COPY.vietnameseRole[person.side]} ${person.name}`} className={styles.fillImage} />
        </div>
        <figcaption className={styles.portraitCaption}>
          <span className={styles.portraitRole}>{COPY.englishRole[person.side]}</span>
          <span className={styles.portraitName}>{person.name}</span>
        </figcaption>
      </figure>
    </div>
  );
}

function NameBlock({ person }: { person: CouplePerson }) {
  return (
    <div className={styles.nameBlock} data-side={person.side}>
      <span className={styles.portraitRole}>{COPY.englishRole[person.side]}</span>
      <span className={styles.nameBlockName}>{person.name}</span>
      <span className={styles.nameBlockRole}>{COPY.vietnameseRole[person.side]}</span>
    </div>
  );
}

function withPortrait(person: CouplePerson): (CouplePerson & { portrait: ResolvedMedia }) | null {
  return person.portrait === undefined ? null : { ...person, portrait: person.portrait };
}

interface CoupleProps {
  number: string;
  /** From `orderedCouplePeople`: resolver order, each with only its own person-bound portrait. */
  people: readonly [CouplePerson, CouplePerson];
  /** Canonical `content.loveStory` when `sections.loveStory` is on; otherwise `null`. */
  story: string | null;
  /** `templateSlots.storyPhoto[0]` when `RESOLVED`; shown only with the story. */
  storyPhoto: ResolvedMedia | undefined;
}

/**
 * Visual Freeze v1 "The Couple". Two portraits → the staggered pair (lead,
 * then follow lower with an ivory outline); one → that photo beside a
 * typographic name block for the other person; none → two staggered name
 * blocks. Never an empty frame, never a photo of one person under the other
 * person's name. With a love story the title "Chuyện Chúng Mình" and the
 * story follow, over the full-width `storyPhoto` when resolved (card overlap)
 * or as a ruled text block without it.
 */
export function Couple({ number, people, story, storyPhoto }: CoupleProps) {
  const layout = coupleLayout(people);
  return (
    <section className={styles.section} aria-labelledby="ows-couple-heading" data-portraits={layout.toLowerCase()}>
      <SectionHead number={number} kicker={COPY.kicker} title={story === null ? undefined : COPY.storyTitle} headingId="ows-couple-heading" />

      {layout === "STAGGER" ? (
        <div className={styles.portraitStagger}>
          {people.map((person, index) => {
            const entry = withPortrait(person);
            return entry === null ? null : (
              <Portrait key={person.side} person={entry} className={index === 0 ? styles.portraitLead : styles.portraitFollow} />
            );
          })}
        </div>
      ) : (
        <div className={layout === "SINGLE" ? styles.portraitSingle : styles.portraitNamesOnly}>
          {people.map((person) => {
            const entry = withPortrait(person);
            return entry === null ? (
              <NameBlock key={person.side} person={person} />
            ) : (
              <Portrait key={person.side} person={entry} className={styles.portraitSingleFigure} />
            );
          })}
        </div>
      )}

      {story === null ? null : (
        <div className={styles.coupleStory}>
          {storyPhoto === undefined ? null : (
            <div className={styles.couplePhotoWrap}>
              <div className={`${styles.photo} ${styles.couplePhoto}`}>
                <MediaImage
                  media={storyPhoto}
                  alt={`${OUR_WEDDING_STORY_V1_COPY.cover.photoAlt} ${people[0].name} ${OUR_WEDDING_STORY_V1_COPY.a11y.and} ${people[1].name}`}
                  className={styles.fillImage}
                />
              </div>
            </div>
          )}
          <div className={storyPhoto === undefined ? styles.storyCardAlone : styles.storyCard}>
            <p className={styles.storyText}>{story}</p>
          </div>
        </div>
      )}
    </section>
  );
}
