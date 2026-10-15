import type { ShowroomContact } from "../../lib/showroom/showroom-contact";
import { ShowroomIcons } from "./icons";
import styles from "./showroom.module.css";

/**
 * Zalo / call buttons for the configured business contact only. Renders
 * nothing for a channel that is not configured: never a placeholder link.
 */
export function ContactActions({ contact, tone = "light" }: { readonly contact: ShowroomContact; readonly tone?: "light" | "dark" }) {
  const callClass = tone === "dark" ? styles.buttonOnDark : styles.buttonGhost;
  return (
    <>
      {contact.zalo !== null ? (
        <a href={contact.zalo.href} target="_blank" rel="noopener noreferrer" className={`${styles.button} ${styles.buttonZalo}`}>
          {ShowroomIcons.chat(styles.buttonIcon)} Nhắn Zalo {contact.zalo.display}
        </a>
      ) : null}
      {contact.hotline !== null ? (
        <a href={contact.hotline.href} className={`${styles.button} ${callClass}`}>
          {ShowroomIcons.phone(styles.buttonIcon)} Gọi {contact.hotline.display}
        </a>
      ) : null}
    </>
  );
}
