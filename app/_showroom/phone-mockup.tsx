import Image from "next/image";

import type { ShowroomImage } from "../../lib/showroom/showroom-catalog";
import styles from "./showroom.module.css";

interface PhoneMockupProps {
  readonly image: ShowroomImage;
  /** Rendered width hint for responsive image selection. */
  readonly sizes: string;
  readonly priority?: boolean;
}

/** A CSS-drawn phone frame around a real template screenshot. */
export function PhoneMockup({ image, sizes, priority = false }: PhoneMockupProps) {
  return (
    <div className={styles.phone}>
      <div className={styles.phoneScreen}>
        <span className={styles.phoneNotch} aria-hidden="true" />
        <Image src={image.src} alt={image.alt} width={image.width} height={image.height} sizes={sizes} priority={priority} />
      </div>
    </div>
  );
}
