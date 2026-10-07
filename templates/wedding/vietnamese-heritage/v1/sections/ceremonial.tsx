import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type {
  InvitationViewModel,
  MediaResolution,
  ResolvedMedia,
  ViewModelFamily,
  ViewModelPerson,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { MediaImage } from "./media-image";
import { SongHy } from "./song-hy";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.ceremonial;

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function familyLines(family: ViewModelFamily): string[] {
  return [family.father, family.mother, family.address].filter(present);
}

/** The portrait slot of a side, selected by the explicit side key (never by position). */
function portraitOf(portrait: InvitationViewModel["media"]["portrait"], side: CoupleSide): MediaResolution | undefined {
  return side === "GROOM" ? portrait.groom : portrait.bride;
}

interface PortraitEntry {
  person: ViewModelPerson;
  media: ResolvedMedia;
}

interface CeremonialProps {
  people: InvitationViewModel["people"];
  families: InvitationViewModel["families"];
  portrait: InvitationViewModel["media"]["portrait"];
  ceremony: InvitationViewModel["ceremony"];
  ceremonyDate: EventDateTimePresentationV1;
  guestDisplayName: string | undefined;
}

/**
 * Task 029 formal ceremonial page (opening part):
 *
 * - Song Hỷ between gold rules;
 * - two balanced family columns, `families.primary` then `.secondary`
 *   (RF4 order); the "Nhà Trai" / "Nhà Gái" label comes from the family's
 *   explicit `side` (RF5). Father, mother and address are canonical lines;
 *   a null or blank line is omitted and a family with no line is not shown;
 * - the portrait composition from the optional `media.portrait` slots only
 *   (RESOLVED only, primary side first); no COVER/GALLERY substitute, no
 *   demo portrait, and no centre couple photo in VH-01 (VH-02 question);
 * - the salutation and the guest line: the authorized overlay's free-form
 *   `displayName` verbatim, else fixed template copy;
 * - the rite: `ceremony.title` verbatim (RF3), RF-05C weekday, time, day,
 *   month and year, and the verbatim ceremony lunar text beside the fixed
 *   "Tức ngày" label, omitted when absent (RF6).
 *
 * The prototype's "Tại tư gia …" host line has no canonical source of its
 * own; venues come from `ceremonyCards` in the Events section.
 */
export function Ceremonial({ people, families, portrait, ceremony, ceremonyDate, guestDisplayName }: CeremonialProps) {
  const shownFamilies = [families.primary, families.secondary].filter((family) => familyLines(family).length > 0);
  const portraits = [people.primary, people.secondary].flatMap((person): PortraitEntry[] => {
    const media = portraitOf(portrait, person.side);
    return media?.status === "RESOLVED" ? [{ person, media }] : [];
  });
  const lunar = ceremony.lunarDateDisplay;

  return (
    <section className={styles.ceremonial} aria-labelledby="vh-ceremonial-heading">
      <h2 id="vh-ceremonial-heading" className={styles.srOnly}>
        {COPY.heading}
      </h2>
      <SongHy />

      {shownFamilies.length > 0 ? (
        <div className={styles.familyColumns} data-count={shownFamilies.length}>
          {shownFamilies.map((family) => (
            <div key={family.side} className={styles.familyColumn} data-side={family.side}>
              <h3 className={styles.familyLabel}>{COPY.labelBySide[family.side]}</h3>
              <span className={styles.familyRule} aria-hidden="true" />
              {present(family.father) ? <p className={styles.familyParent}>{family.father}</p> : null}
              {present(family.mother) ? <p className={styles.familyParent}>{family.mother}</p> : null}
              {present(family.address) ? <p className={styles.familyAddress}>{family.address}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {portraits.length > 0 ? (
        <div className={styles.portraitRow} data-count={portraits.length}>
          {portraits.map(({ person, media }) => (
            <figure key={person.side} className={styles.portraitFrame} data-side={person.side}>
              <MediaImage media={media} alt={`${COPY.portraitAlt} ${person.name}`} className={styles.portraitPhoto} />
            </figure>
          ))}
        </div>
      ) : null}

      <div className={styles.inviteBlock}>
        <p className={styles.inviteSalutation}>{COPY.salutation}</p>
        <p className={styles.inviteGuest} data-guest={guestDisplayName === undefined ? "default" : "personalized"}>
          {guestDisplayName ?? COPY.defaultGuest}
        </p>
      </div>

      <div className={styles.rite}>
        <h3 className={styles.riteTitle}>{ceremony.title}</h3>
        <p className={styles.riteWeekday}>{ceremonyDate.weekday}</p>
        <div className={styles.riteDateRow}>
          <span className={styles.riteSide}>{ceremonyDate.time}</span>
          <span className={styles.riteDayCell}>
            <span className={styles.riteDay}>{ceremonyDate.day}</span>
            <span className={styles.riteMonth}>
              {COPY.monthPrefix} {ceremonyDate.month}
            </span>
          </span>
          <span className={styles.riteSide}>{ceremonyDate.year}</span>
        </div>
        {lunar !== null && lunar.trim().length > 0 ? (
          <p className={styles.riteLunar} data-lunar="present">
            <span>{COPY.lunarLabel}</span> <span>{lunar}</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
