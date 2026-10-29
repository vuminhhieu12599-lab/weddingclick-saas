import type { ReactNode } from "react";

import { SE_DUYEN_V2_COPY } from "../copy";
import styles from "../se-duyen-v2.module.css";

const COPY = SE_DUYEN_V2_COPY.gallery;

/**
 * The approved "Album Cưới" page: photography on lacquer, nothing framed.
 *
 * The section head only; the tiles themselves are the island's, because
 * each one is a control that opens its photograph full size. The section is
 * rendered only when the album has at least one photograph of the Project's
 * own, so an empty band can never appear.
 */
export function Gallery({ children }: { readonly children: ReactNode }) {
  return (
    <section className={styles.album} aria-labelledby="sd-album-heading">
      <div className={styles.albumHead}>
        <p className={styles.albumEyebrow}>{COPY.eyebrow}</p>
        <h2 className={styles.albumHeading} id="sd-album-heading">
          {COPY.heading}
        </h2>
        <span className={styles.albumRule} aria-hidden="true" />
      </div>

      {children}
    </section>
  );
}
