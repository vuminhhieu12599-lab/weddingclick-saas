import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import type { ShowroomTemplateEntry } from "../../lib/showroom/showroom-catalog";
import { consultationHref, demoHref } from "../../lib/showroom/showroom-routes";
import { ShowroomIcons } from "./icons";
import styles from "./showroom.module.css";

interface TemplateCardProps {
  readonly template: ShowroomTemplateEntry;
  /** 1-based display position. */
  readonly position: number;
}

const CARD_IMAGE_SIZES = "(min-width: 1200px) 220px, (min-width: 640px) 34vw, 78vw";

/**
 * The single reusable showroom card. Everything it shows comes from one
 * catalog entry; both CTAs are always visible (no hover-only control).
 * Hover/focus on pointer devices crossfades to an inner screenshot.
 */
export function TemplateCard({ template, position }: TemplateCardProps) {
  const accentStyle = { "--card-accent": template.accent } as CSSProperties;
  const headingId = `mau-${template.templateCode}`;
  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <Link
        href={demoHref(template.templateCode)}
        className={styles.cardVisual}
        style={accentStyle}
        aria-label={`Xem thiệp mẫu ${template.nameVi}`}
      >
        <span className={styles.cardIndex} aria-hidden="true">
          {String(position).padStart(2, "0")}
        </span>
        <span className={styles.cardPhone}>
          <span className={styles.phone}>
            <span className={styles.phoneScreen}>
              <span className={styles.phoneNotch} aria-hidden="true" />
              <span className={styles.cardScreenLayer}>
                <Image
                  src={template.cover.src}
                  alt={template.cover.alt}
                  width={template.cover.width}
                  height={template.cover.height}
                  sizes={CARD_IMAGE_SIZES}
                />
              </span>
              <span className={`${styles.cardScreenLayer} ${styles.cardScreenInside}`}>
                <Image
                  src={template.preview.src}
                  alt=""
                  width={template.preview.width}
                  height={template.preview.height}
                  sizes={CARD_IMAGE_SIZES}
                />
              </span>
            </span>
          </span>
        </span>
        <span className={styles.cardDemoHint} aria-hidden="true">
          Mở thiệp mẫu
        </span>
      </Link>
      <div className={styles.cardBody}>
        <p className={styles.cardMeta}>{template.nameEn}</p>
        <h3 id={headingId} className={styles.cardTitle}>
          {template.nameVi}
        </h3>
        <p className={styles.cardTagline}>{template.taglineVi}</p>
        <ul className={styles.cardMood} aria-label="Phong cách">
          {template.moodVi.map((mood) => (
            <li key={mood}>{mood}</li>
          ))}
        </ul>
        <div className={styles.cardActions}>
          <Link href={demoHref(template.templateCode)} className={`${styles.button} ${styles.buttonGhost} ${styles.buttonSmall}`}>
            Xem thiệp mẫu
          </Link>
          <Link
            href={consultationHref(template.templateCode)}
            className={styles.textLink}
            aria-label={`Chọn mẫu ${template.nameVi}`}
          >
            Chọn mẫu này {ShowroomIcons.arrow(styles.buttonIcon)}
          </Link>
        </div>
      </div>
    </article>
  );
}
