import type { ShowroomContact, ShowroomContactChannel } from "../../lib/showroom/showroom-contact";
import styles from "./floating-contact.module.css";

/**
 * The business Messenger conversation, built from the Facebook id the Product
 * Owner supplied. It is a public address, not a secret and not an environment
 * value, and it is used by this dock alone — `lib/showroom/showroom-contact.ts`
 * stays the env-driven Zalo/hotline configuration it was, untouched.
 *
 * `m.me/<id>` is Facebook's own deep link and is meant to open the chat with
 * that account. WC-SHOWROOM-CONTACT-02: that destination has NOT been opened
 * and confirmed against Facebook here, so nothing claims it is verified; the
 * Product Owner confirms it manually on the Preview. The label stays the
 * modest "Liên hệ qua Messenger".
 */
export const WEDDINGCLICK_MESSENGER_URL = "https://m.me/61582288501879";

/**
 * WC-SHOWROOM-CONTACT-03: the two destinations for the one configured number.
 *
 * `zalo.me/<phone>` is Zalo's own link format and is what hands off to the app
 * on a phone; `chat.zalo.me/?phone=<phone>` is the Zalo Web conversation, which
 * is what a desktop browser can actually open — `zalo.me/<phone>` there only
 * shows a profile page. The number is read back from the canonical href rather
 * than configured a second time, so `getShowroomContact()` stays the one source.
 */
export function zaloChatLinks(zalo: ShowroomContactChannel): { readonly app: string; readonly web: string } {
  const phone = /^https:\/\/zalo\.me\/(\d+)$/.exec(zalo.href)?.[1];
  return { app: zalo.href, web: phone === undefined ? zalo.href : `https://chat.zalo.me/?phone=${phone}` };
}

/**
 * Zalo's blue bubble with a bold white-on-blue "Z". Brand colour and shape
 * only, drawn here — no Zalo logo artwork is bundled. The bubble fills the
 * button and the "Z" fills the bubble, so the mark still reads at 28px on a
 * phone.
 */
function ZaloMark() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#ffffff"
        d="M12 1.9C6.2 1.9 1.5 5.8 1.5 10.6c0 2.72 1.52 5.14 3.9 6.72-.2 1.09-.69 2.37-1.77 3.45-.34.34-.09.93.39.87 2.26-.29 4.06-1.28 5.16-2.06.9.2 1.85.31 2.82.31 5.8 0 10.5-3.9 10.5-8.7S17.8 1.9 12 1.9Z"
      />
      <path fill="#0068ff" d="M7 5.9h10v2.2l-6.1 5.3H17v2.2H7v-2.2l6.1-5.3H7V5.9Z" />
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
function ZaloButton({ zalo }: { readonly zalo: ShowroomContactChannel }) {
  const links = zaloChatLinks(zalo);
  const label = "Liên hệ qua Zalo";
  return (
    <>
      {/*
       * Phones: the app link, navigated in this tab. A universal / app link
       * only hands off to the installed app from a top-level navigation —
       * opening it in a new tab or an in-app webview is what leaves the
       * visitor on Zalo's "get the app" page instead of in the conversation.
       * With no app installed the same URL still lands on Zalo's own page, so
       * the fallback is Zalo, never an app store as the destination.
       */}
      <a href={links.app} className={`${styles.button} ${styles.zalo} ${styles.zaloApp}`} aria-label={label} title={label}>
        <ZaloMark />
      </a>
      {/* Desktop: Zalo Web's conversation, in a new tab so the showroom stays open. */}
      <a
        href={links.web}
        target="_blank"
        rel="noopener noreferrer"
        className={`${styles.button} ${styles.zalo} ${styles.zaloWeb}`}
        aria-label={label}
        title={label}
      >
        <ZaloMark />
      </a>
    </>
  );
}

export function FloatingContact({ contact }: { readonly contact: ShowroomContact }) {
  return (
    <div className={styles.dock}>
      {contact.zalo === null ? null : <ZaloButton zalo={contact.zalo} />}
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
