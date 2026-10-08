import type { ReactNode } from "react";

import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type {
  InvitationViewModel,
  MediaResolution,
  ResolvedMedia,
  ViewModelFamily,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { DecorImage } from "./decor";
import { MediaImage } from "./media-image";
import { SongHy } from "./song-hy";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.ceremonial;

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function familyLines(family: ViewModelFamily): string[] {
  return [family.father, family.mother, family.address].filter(present);
}

interface PortraitEntry {
  /** 1-based `portraitCluster` slot position: layout order only, never a person or side. */
  position: number;
  media: ResolvedMedia;
}

/**
 * The `RESOLVED` items of the `portraitCluster` slot in slot order, each
 * keeping its original position. `UNAVAILABLE` items are skipped, never
 * substituted; the visual state follows the resolved count alone.
 */
function resolvedPortraits(cluster: readonly MediaResolution[]): PortraitEntry[] {
  return cluster.flatMap((media, index): PortraitEntry[] => (media.status === "RESOLVED" ? [{ position: index + 1, media }] : []));
}

/** Slim gold page edges: hairlines plus the approved border art as short end caps. */
function PageBorders() {
  return (
    <div className={styles.pageBorders} aria-hidden="true">
      <DecorImage decor="borderLeft" className={`${styles.pageBorderCap} ${styles.pageBorderLeft} ${styles.pageBorderCapTop}`} />
      <DecorImage decor="borderLeft" className={`${styles.pageBorderCap} ${styles.pageBorderLeft} ${styles.pageBorderCapBottom}`} />
      <DecorImage decor="borderRight" className={`${styles.pageBorderCap} ${styles.pageBorderRight} ${styles.pageBorderCapTop}`} />
      <DecorImage decor="borderRight" className={`${styles.pageBorderCap} ${styles.pageBorderRight} ${styles.pageBorderCapBottom}`} />
    </div>
  );
}

interface CeremonialProps {
  families: InvitationViewModel["families"];
  /** `templateSlots.portraitCluster`: ordered positions 1 / 2 / 3, shared by every variant. */
  portraitCluster: readonly MediaResolution[];
  ceremony: InvitationViewModel["ceremony"];
  ceremonyDate: EventDateTimePresentationV1;
  guestDisplayName: string | undefined;
  /** The venue cards and timeline, set on the same printed sheet below the rite. */
  children?: ReactNode;
}

/**
 * Task 029 formal ceremonial page, composed as one printed ivory sheet:
 *
 * - Song Hỷ (vector) between gold rules;
 * - two balanced family columns, `families.primary` then `.secondary` (RF4);
 *   "Nhà Trai" / "Nhà Gái" from the family's explicit `side` (RF5); father,
 *   mother and address lines, each omitted when null/blank; a family with
 *   no line is not shown;
 * - the approved three-photo composition from the `portraitCluster`
 *   template slot only, in slot order, `RESOLVED` items only: three → side /
 *   dominant centre / side, two → a balanced pair, one → a centred single,
 *   none → no block. Positions carry no person or side meaning, so the order
 *   is identical for COMMON, GROOM and BRIDE, alt text is generic, and an
 *   `UNAVAILABLE` item is skipped, never replaced by another Project image;
 * - "Trân Trọng Kính Mời" and the guest line: the authorized overlay's
 *   free-form `displayName` verbatim, else "Bạn và Gia Đình" (ruling D3);
 * - the rite: `ceremony.title` verbatim (RF3), RF-05C weekday, time, day,
 *   month and year, and the verbatim ceremony lunar text beside the fixed
 *   "Tức ngày" label, omitted when absent (RF6). No host line is invented.
 */
export function Ceremonial({ families, portraitCluster, ceremony, ceremonyDate, guestDisplayName, children }: CeremonialProps) {
  const shownFamilies = [families.primary, families.secondary].filter((family) => familyLines(family).length > 0);
  const portraits = resolvedPortraits(portraitCluster);
  const lunar = ceremony.lunarDateDisplay;

  return (
    <section className={styles.page} aria-labelledby="vh-ceremonial-heading">
      <PageBorders />
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
          {portraits.map(({ position, media }, index) => (
            <figure
              key={position}
              className={styles.portraitFrame}
              data-position={position}
              data-emphasis={portraits.length === 3 && index === 1 ? "center" : undefined}
            >
              <MediaImage media={media} alt={`${COPY.portraitAlt} ${String(position)}`} className={styles.portraitPhoto} />
            </figure>
          ))}
        </div>
      ) : null}

      <div className={styles.inviteBlock}>
        <span className={`${styles.inviteCorner} ${styles.inviteCornerTopLeft}`} aria-hidden="true" />
        <span className={`${styles.inviteCorner} ${styles.inviteCornerBottomRight}`} aria-hidden="true" />
        <p className={styles.inviteSalutation}>{COPY.salutation}</p>
        <p className={styles.inviteGuest} data-guest={guestDisplayName === undefined ? "default" : "personalized"}>
          {guestDisplayName ?? COPY.defaultGuest}
        </p>
      </div>

      <div className={styles.rite}>
        <h3 className={styles.riteTitle}>{ceremony.title}</h3>
        <p className={styles.riteWeekday}>{ceremonyDate.weekday}</p>
        <div className={styles.riteDateRow}>
          <span className={`${styles.riteDateCell} ${styles.riteDateCellStart}`}>
            <span className={styles.riteSideValue}>{ceremonyDate.time}</span>
          </span>
          <span className={styles.riteDayCell}>
            <span className={styles.riteDay}>{ceremonyDate.day}</span>
            <span className={styles.riteMonth}>
              {COPY.monthPrefix} {ceremonyDate.month}
            </span>
          </span>
          <span className={`${styles.riteDateCell} ${styles.riteDateCellEnd}`}>
            <span className={styles.riteSideValue}>{ceremonyDate.year}</span>
          </span>
        </div>
        {lunar !== null && lunar.trim().length > 0 ? (
          <p className={styles.riteLunar} data-lunar="present">
            <span aria-hidden="true">(</span>
            <span>{COPY.lunarLabel}</span> <span>{lunar}</span>
            <span aria-hidden="true">)</span>
          </p>
        ) : null}
        <DecorImage decor="divider" className={styles.riteDivider} />
      </div>

      {children}
    </section>
  );
}
