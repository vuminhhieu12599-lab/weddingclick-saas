"use client";

import { useState } from "react";

import styles from "./showroom.module.css";

type CopyState = "IDLE" | "COPIED" | "FAILED";

/**
 * The prepared consultation message, selectable by hand and copyable with
 * one tap. "Đã sao chép" appears only after the Clipboard API confirmed the
 * write; any failure asks the visitor to copy manually.
 */
export function CopyMessage({ message }: { readonly message: string }) {
  const [state, setState] = useState<CopyState>("IDLE");

  async function copy() {
    try {
      if (typeof navigator === "undefined" || navigator.clipboard === undefined) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(message);
      setState("COPIED");
    } catch {
      setState("FAILED");
    }
  }

  return (
    <div className={styles.messageBox}>
      <label htmlFor="tin-nhan-tu-van" className={styles.messageLabel}>
        Tin nhắn gợi ý
      </label>
      <textarea id="tin-nhan-tu-van" className={styles.messageText} readOnly value={message} rows={4} />
      <div className={styles.messageRow}>
        <button type="button" onClick={copy} className={`${styles.button} ${styles.buttonGhost} ${styles.buttonSmall}`}>
          Sao chép tin nhắn
        </button>
        <span className={styles.copyStatus} role="status" aria-live="polite">
          {state === "COPIED" ? "Đã sao chép. Dán vào Zalo để gửi cho chúng tôi." : null}
          {state === "FAILED" ? "Chưa sao chép được, bạn hãy chọn và sao chép đoạn tin nhắn ở trên." : null}
        </span>
      </div>
    </div>
  );
}
