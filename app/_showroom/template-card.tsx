import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import type { ShowroomTemplateEntry } from "../../lib/showroom/showroom-catalog";
import { demoHref } from "../../lib/showroom/showroom-routes";
import styles from "./showroom.module.css";

interface TemplateCardProps {
  readonly template: ShowroomTemplateEntry;
  /** Eager-load the first row's covers. */
  readonly priority?: boolean;
}

const CARD_IMAGE_SIZES = "(min-width: 1100px) 260px, (min-width: 768px) 30vw, 46vw";

/**
 * Compact showroom card for a 2-up phone grid: the whole card is one link to
 * the demo. Cover screenshot, a "Mới" badge when flagged, the name and one
 * mood word. Pointer devices crossfade to the inner screenshot on hover.
 * No price and no second CTA (choosing happens on the demo page).
 */
export function TemplateCard({ template, priority = false }: TemplateCardProps) {
  const accentStyle = { "--card-accent": template.accent } as CSSProperties;
  const headingId = `mau-${template.templateCode}`;
  const mood = template.moodVi[0];
  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <Link href={demoHref(template.templateCode)} className={styles.cardLink} style={accentStyle}>
        <span className={styles.cardFrame}>
          <span className={styles.cardScreenLayer}>
            <Image
              src={template.cover.src}
              alt={template.cover.alt}
              width={template.cover.width}
              height={template.cover.height}
              sizes={CARD_IMAGE_SIZES}
              priority={priority}
            />
          </span>
          <span className={`${styles.cardScreenLayer} ${styles.cardScreenInside}`}>
            <Image src={template.preview.src} alt="" width={template.preview.width} height={template.preview.height} sizes={CARD_IMAGE_SIZES} />
          </span>
          {template.isNew === true ? <span className={styles.cardNew}>Mới</span> : null}
          <span className={styles.cardDemoHint} aria-hidden="true">
            Xem thiệp
          </span>
        </span>
        <span className={styles.cardBody}>
          <span id={headingId} className={styles.cardTitle} role="heading" aria-level={3}>
            {template.nameVi}
          </span>
          {mood === undefined ? null : <span className={styles.cardMoodLine}>{mood}</span>}
        </span>
      </Link>
    </article>
  );
}
