import Link from "next/link";
import type { ReactNode } from "react";

import type { ShowroomContact } from "../../lib/showroom/showroom-contact";
import { SHOWROOM_SECTION_IDS, consultationHref } from "../../lib/showroom/showroom-routes";
import { FloatingContact } from "./floating-contact";
import { ShowroomIcons } from "./icons";
import { SHOWROOM_FONT_VARIABLES_CLASS_NAME } from "./showroom-fonts";
import styles from "./showroom.module.css";

const NAV_ITEMS = [
  { href: `/#${SHOWROOM_SECTION_IDS.templates}`, label: "Mẫu thiệp" },
  { href: `/#${SHOWROOM_SECTION_IDS.benefits}`, label: "Tính năng" },
  { href: `/#${SHOWROOM_SECTION_IDS.pricing}`, label: "Bảng giá" },
  { href: `/#${SHOWROOM_SECTION_IDS.contact}`, label: "Liên hệ" },
] as const;

export function BrandLink() {
  return (
    <Link href="/" className={styles.brand} aria-label="WeddingClick — trang chủ">
      <span className={styles.brandMark} aria-hidden="true">
        W
      </span>
      <span className={styles.brandName}>WeddingClick</span>
    </Link>
  );
}

/**
 * Sticky header. Mobile navigation is a native `<details>` disclosure, so it
 * works without JavaScript and is keyboard accessible. Staff login stays
 * reachable but visually secondary.
 */
export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={`${styles.container} ${styles.headerInner}`}>
        <BrandLink />
        <nav className={styles.nav} aria-label="Điều hướng chính">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <Link href="/login" className={styles.staffLink}>
            Nhân viên đăng nhập
          </Link>
          <Link href={consultationHref()} className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonSmall} ${styles.headerCta}`}>
            Tư vấn miễn phí
          </Link>
          <details className={styles.menu}>
            <summary className={styles.menuToggle} aria-label="Mở menu">
              {ShowroomIcons.menu(styles.buttonIcon)}
            </summary>
            <nav className={styles.menuPanel} aria-label="Điều hướng trên di động">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
              <Link href={consultationHref()} className={styles.menuCta}>
                Tư vấn miễn phí
              </Link>
              <Link href="/login" className={styles.menuStaff}>
                Nhân viên đăng nhập
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ contact }: { readonly contact: ShowroomContact }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.footerGrid}>
          <div>
            <BrandLink />
            <p className={styles.footerTagline}>Thiệp cưới online được thiết kế và dựng bởi đội ngũ WeddingClick.</p>
          </div>
          <div>
            <p className={styles.footerHeading}>Khám phá</p>
            <ul className={styles.footerLinks}>
              {NAV_ITEMS.slice(0, 3).map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
              <li>
                <Link href={`/#${SHOWROOM_SECTION_IDS.process}`}>Quy trình đặt thiệp</Link>
              </li>
            </ul>
          </div>
          <div>
            <p className={styles.footerHeading}>Liên hệ</p>
            <ul className={styles.footerLinks}>
              {contact.zalo !== null ? (
                <li>
                  <a href={contact.zalo.href} target="_blank" rel="noopener noreferrer">
                    Zalo: {contact.zalo.display}
                  </a>
                </li>
              ) : null}
              {contact.hotline !== null ? (
                <li>
                  <a href={contact.hotline.href}>Điện thoại: {contact.hotline.display}</a>
                </li>
              ) : null}
              <li>
                <Link href={consultationHref()}>Nhận tư vấn</Link>
              </li>
              <li>
                <Link href="/login">Nhân viên đăng nhập</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} WeddingClick</span>
          <span>Thiệp cưới online · Việt Nam</span>
        </div>
      </div>
    </footer>
  );
}

/**
 * Root wrapper: showroom fonts, tokens, skip link, header and footer.
 *
 * WC-SHOWROOM-CONTACT-01: the floating contact buttons are a sibling of the
 * styled root, not a child, so the root's `overflow-x: clip` can never clip
 * them and no showroom stacking context can trap them.
 */
export function ShowroomShell({ contact, children }: { readonly contact: ShowroomContact; readonly children: ReactNode }) {
  return (
    <>
      <div className={`${SHOWROOM_FONT_VARIABLES_CLASS_NAME} ${styles.root}`}>
        <a href="#noi-dung" className={styles.skipLink}>
          Bỏ qua tới nội dung
        </a>
        <SiteHeader />
        <main id="noi-dung">{children}</main>
        <SiteFooter contact={contact} />
      </div>
      <FloatingContact />
    </>
  );
}
