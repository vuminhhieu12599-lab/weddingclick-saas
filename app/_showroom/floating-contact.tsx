import styles from "./floating-contact.module.css";

/**
 * The WeddingClick Facebook page, exactly as the Product Owner gave it. It is
 * a public page address, not a secret and not an environment value, and it is
 * used by this dock alone — `lib/showroom/showroom-contact.ts` stays the
 * env-driven Zalo/hotline configuration it was, untouched.
 *
 * It opens the page. It is not a Messenger deep link, and no label here
 * promises that it starts a conversation.
 */
export const WEDDINGCLICK_FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61582288501879";

/**
 * Facebook's "f" in white on Facebook blue. Brand colour and letterform only,
 * drawn here — no Facebook logo artwork is bundled. The glyph is nudged up so
 * it sits centred in the round button rather than riding its lower edge.
 */
function FacebookMark() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#ffffff"
        transform="translate(0 -1.1)"
        d="M13.5 21.5v-8h2.7l.4-3.1h-3.1V8.4c0-.9.25-1.5 1.55-1.5H16.7V4.1c-.29-.04-1.27-.13-2.4-.13-2.38 0-4 1.45-4 4.11v2.3H7.6v3.1h2.7v8h3.2Z"
      />
    </svg>
  );
}

/**
 * WC-SHOWROOM-CONTACT-04 — the floating contact button on the public showroom
 * (homepage, consultation page and the template demos).
 *
 * One button: the WeddingClick Facebook page. The floating Zalo button is
 * withdrawn until WeddingClick has a Zalo Official Account — the configured
 * Zalo number and every other place it appears (the in-flow contact buttons,
 * the footer) are untouched, so only this dock changed.
 *
 * Server-rendered and CSS-only: no client island, no timer, no chat SDK.
 * Mount it outside any invitation renderer.
 */
export function FloatingContact() {
  return (
    <div className={styles.dock}>
      <a
        href={WEDDINGCLICK_FACEBOOK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`${styles.button} ${styles.facebook}`}
        aria-label="Xem Facebook WeddingClick"
        title="Xem Facebook WeddingClick"
      >
        <FacebookMark />
      </a>
    </div>
  );
}
