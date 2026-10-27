import type { ShowroomContact } from "../../lib/showroom/showroom-contact";
import styles from "./floating-contact.module.css";

/**
 * The business Facebook profile, exactly as the Product Owner gave it. It is a
 * public page address, not a secret and not an environment value, and it is
 * used by this dock alone — `lib/showroom/showroom-contact.ts` stays the
 * env-driven Zalo/hotline configuration it was, untouched.
 *
 * It opens the profile. It is NOT an `m.me` chat deep link, and no label here
 * promises that it starts a conversation.
 */
export const WEDDINGCLICK_MESSENGER_URL = "https://www.facebook.com/profile.php?id=61582288501879";

/**
 * Zalo's blue speech bubble with its "Z". Brand colour and shape only, drawn
 * here — no Zalo logo artwork is bundled.
 */
function ZaloMark() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#ffffff"
        d="M12 3.6c-4.76 0-8.6 3.17-8.6 7.08 0 2.23 1.25 4.22 3.2 5.52-.13.93-.6 2.08-1.6 3.14-.2.21-.06.56.23.53 1.86-.2 3.43-.98 4.5-1.74.72.15 1.48.23 2.27.23 4.76 0 8.6-3.17 8.6-7.68S16.76 3.6 12 3.6Z"
      />
      <path fill="#0068ff" d="M8.9 8.2h5.3v1.5l-3.3 3.6h3.4v1.6H8.6v-1.5l3.3-3.6H8.9V8.2Z" />
    </svg>
  );
}

/**
 * Messenger's bubble with the bolt punched through to the gradient behind it
 * (`fill-rule="evenodd"`). Brand colours and shape only — no logo artwork.
 */
function MessengerMark() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#ffffff"
        fillRule="evenodd"
        d="M12 2.8c-5.2 0-9.2 3.8-9.2 8.9 0 2.9 1.3 5.4 3.4 7.1v3.5l3.2-1.8c.84.23 1.73.35 2.6.35 5.2 0 9.2-3.8 9.2-8.9S17.2 2.8 12 2.8Zm-5.3 11.6 4.9-5.2 2.5 2.6 4.3-2.6-4.9 5.2-2.5-2.6-4.3 2.6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * WC-SHOWROOM-CONTACT-01 — the two floating contact buttons on the public
 * showroom (homepage, consultation page and the template demos).
 *
 * Zalo reuses the one configured business number from `getShowroomContact()`
 * and simply does not render when that number is not configured: no
 * placeholder, no second copy of the number. Messenger links to the Product
 * Owner's Facebook profile verbatim — that opens the page, not a chat thread,
 * which is why the label says "liên hệ" rather than promising a direct chat.
 *
 * Server-rendered and CSS-only: no client island, no timer, no chat SDK.
 * Mount it outside any invitation renderer.
 */
export function FloatingContact({ contact }: { readonly contact: ShowroomContact }) {
  return (
    <div className={styles.dock}>
      {contact.zalo === null ? null : (
        <a
          href={contact.zalo.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`${styles.button} ${styles.zalo}`}
          aria-label="Liên hệ qua Zalo"
          title="Liên hệ qua Zalo"
        >
          <ZaloMark />
        </a>
      )}
      <a
        href={WEDDINGCLICK_MESSENGER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`${styles.button} ${styles.messenger}`}
        aria-label="Liên hệ qua Messenger"
        title="Liên hệ qua Messenger"
      >
        <MessengerMark />
      </a>
    </div>
  );
}
