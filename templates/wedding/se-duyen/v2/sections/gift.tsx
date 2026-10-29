import type { ClipboardCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { SE_DUYEN_V2_COPY } from "../copy";
import { GiftEnvelope } from "../interactive/gift-envelope";
import styles from "../se-duyen-v2.module.css";
import type { GiftPanel } from "./gift-panels";

const COPY = SE_DUYEN_V2_COPY.gift;

interface GiftProps {
  /** From `giftPanels`: only operational sides with honest content, never empty. */
  readonly panels: readonly GiftPanel[];
  readonly clipboard: ClipboardCapabilityV1 | undefined;
}

/**
 * The approved "Mừng Cưới" page: the section head and its note, then the
 * lacquer-red envelope the guest taps.
 *
 * The head is static; the envelope and its slip are the island's, because
 * the envelope is a control and the slip holds the copy action. The section
 * is rendered only when at least one family has gift details or a QR of its
 * own, so an empty envelope can never appear.
 *
 * The note is fixed template copy: the canonical content contract carries no
 * gift-note field, so making it customer-editable is a scoped product
 * decision rather than a renderer change.
 */
export function Gift({ panels, clipboard }: GiftProps) {
  return (
    <section className={styles.gift} aria-labelledby="sd-gift-heading">
      <span className={styles.giftGlow} aria-hidden="true" />

      <div className={styles.giftHead}>
        <p className={styles.giftEyebrow}>{COPY.eyebrow}</p>
        <h2 className={styles.giftHeading} id="sd-gift-heading">
          {COPY.heading}
        </h2>
        <span className={styles.giftRule} aria-hidden="true" />
        <p className={styles.giftNote}>{COPY.note}</p>
      </div>

      <GiftEnvelope panels={panels} clipboard={clipboard} />
    </section>
  );
}
