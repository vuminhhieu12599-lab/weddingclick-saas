import type { Metadata } from "next";
import Link from "next/link";

import { ContactActions } from "../_showroom/contact-actions";
import { CopyMessage } from "../_showroom/copy-message";
import { PhoneMockup } from "../_showroom/phone-mockup";
import { ShowroomShell } from "../_showroom/site-chrome";
import styles from "../_showroom/showroom.module.css";
import { PUBLIC_SHOWROOM_TEMPLATES, findPublicShowroomTemplate } from "../../lib/showroom/showroom-catalog";
import { buildConsultationMessage, getShowroomContact, hasAnyShowroomContact } from "../../lib/showroom/showroom-contact";
import { SHOWROOM_SOCIAL_IMAGE } from "../../lib/showroom/showroom-metadata";
import { SHOWROOM_TEMPLATES_HREF, consultationHref, demoHref } from "../../lib/showroom/showroom-routes";

export const metadata: Metadata = {
  title: "Tư vấn thiệp cưới miễn phí | WeddingClick",
  description: "Chọn mẫu thiệp yêu thích và nhắn cho WeddingClick để được tư vấn miễn phí.",
  robots: { index: false, follow: true },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: "WeddingClick",
    title: "Tư vấn thiệp cưới miễn phí | WeddingClick",
    description: "Chọn mẫu thiệp yêu thích và nhắn cho WeddingClick để được tư vấn miễn phí.",
    images: [SHOWROOM_SOCIAL_IMAGE],
  },
};

/**
 * LAUNCH-P0-04 consultation page. `?mau=<templateCode>` carries the chosen
 * template; it is resolved against the PUBLIC catalog only (unknown or
 * hidden codes are simply "no selection", never echoed). The visitor gets a
 * message naming the template (Vietnamese name + stable code) to send via
 * the configured business Zalo, or calls the hotline. Nothing is stored and
 * no request is made to WeddingClick from this page.
 */
export default async function ConsultationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { mau } = await searchParams;
  const selected = typeof mau === "string" ? (findPublicShowroomTemplate(mau) ?? null) : null;
  const contact = getShowroomContact();
  const message = buildConsultationMessage(selected);

  return (
    <ShowroomShell contact={contact}>
      <div className={styles.consultMain}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Tư vấn miễn phí</p>
            <h1 className={styles.sectionTitle}>
              {selected === null ? (
                <>
                  Hãy kể cho chúng tôi <em>về ngày vui của bạn</em>
                </>
              ) : (
                <>
                  Bạn đã chọn <em>{selected.nameVi}</em>
                </>
              )}
            </h1>
            <p className={styles.sectionLead}>
              Nhắn cho WeddingClick, chúng tôi sẽ tư vấn gói phù hợp và hướng dẫn bạn gửi thông tin đám cưới.
            </p>
          </div>

          <div className={styles.consultGrid}>
            {selected !== null ? (
              <div className={styles.consultSelected}>
                <div className={styles.selected}>
                  <PhoneMockup image={selected.cover} sizes="112px" />
                  <div>
                    <p className={styles.selectedLabel}>Mẫu đã chọn</p>
                    <p className={styles.selectedName}>{selected.nameVi}</p>
                    <p className={styles.selectedEn}>
                      {selected.nameEn} · mã mẫu {selected.templateCode}
                    </p>
                    <div className={styles.selectedLinks}>
                      <Link href={demoHref(selected.templateCode)} className={styles.textLink}>
                        Xem lại thiệp mẫu
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className={styles.consultCard}>
              <h2>Nhắn cho WeddingClick</h2>
              <ol className={styles.consultSteps}>
                <li>Sao chép tin nhắn gợi ý bên dưới{selected === null ? "" : " (đã ghi sẵn mẫu bạn chọn)"}.</li>
                <li>Mở Zalo của WeddingClick và dán tin nhắn để gửi.</li>
                <li>Nhân viên tư vấn gói phù hợp và hướng dẫn bạn gửi thông tin đám cưới.</li>
              </ol>
              <CopyMessage message={message} />
              {hasAnyShowroomContact(contact) ? (
                <>
                  <div className={styles.contactActions}>
                    <ContactActions contact={contact} />
                  </div>
                  {contact.zalo !== null ? (
                    <p className={styles.contactHint}>Zalo không tự điền sẵn tin nhắn, bạn chỉ cần dán đoạn đã sao chép.</p>
                  ) : null}
                </>
              ) : (
                <div className={styles.notice} role="note">
                  <strong>Kênh liên hệ đang được cập nhật</strong>
                  Số Zalo và điện thoại chính thức của WeddingClick sẽ sớm có tại đây. Vui lòng quay lại sau ít phút.
                </div>
              )}
            </div>

            {PUBLIC_SHOWROOM_TEMPLATES.length > 0 ? (
              <div className={styles.consultChooser}>
                <div className={styles.chooser}>
                  <p className={styles.chooserTitle}>{selected === null ? "Bạn đã ưng mẫu nào chưa?" : "Đổi sang mẫu khác"}</p>
                  <ul className={styles.chooserList}>
                    {PUBLIC_SHOWROOM_TEMPLATES.map((template) => (
                      <li key={template.templateCode}>
                        <Link
                          href={consultationHref(template.templateCode)}
                          className={styles.chooserItem}
                          aria-current={selected?.templateCode === template.templateCode ? "true" : undefined}
                        >
                          <span className={styles.chooserName}>{template.nameVi}</span>
                          <span className={styles.chooserEn}>{template.nameEn}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link href={SHOWROOM_TEMPLATES_HREF} className={styles.textLink}>
                    Xem cả bộ sưu tập
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </ShowroomShell>
  );
}
