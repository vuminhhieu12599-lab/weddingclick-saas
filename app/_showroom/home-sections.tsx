import Link from "next/link";
import type { ReactNode } from "react";

import { formatVnd } from "../../lib/presentation/format-vnd";
import type { ShowroomTemplateEntry } from "../../lib/showroom/showroom-catalog";
import type { ShowroomContact } from "../../lib/showroom/showroom-contact";
import type { ShowroomAddonOffer, ShowroomPackageOffer } from "../../lib/showroom/showroom-pricing";
import { SHOWROOM_SECTION_IDS, SHOWROOM_TEMPLATES_HREF, consultationHref } from "../../lib/showroom/showroom-routes";
import { SectionLink } from "./section-link";
import { ContactActions } from "./contact-actions";
import { ShowroomIcons } from "./icons";
import { PhoneMockup } from "./phone-mockup";
import styles from "./showroom.module.css";

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

const HERO_PHONE_COUNT = 3;

export function Hero({ templates, startingPriceVnd }: { readonly templates: readonly ShowroomTemplateEntry[]; readonly startingPriceVnd: number }) {
  // Up to three real template covers; the first catalog entry stands in the centre.
  const featured = templates.slice(0, HERO_PHONE_COUNT);
  const ordered = featured.length === HERO_PHONE_COUNT ? [featured[1], featured[0], featured[2]] : featured;
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={`${styles.container} ${styles.heroGrid}`}>
        <div>
          <p className={`${styles.eyebrow} ${styles.rise}`}>Thiệp cưới online</p>
          <h1 id="hero-title" className={`${styles.heroTitle} ${styles.rise} ${styles.riseDelay1}`}>
            <span className={styles.heroTitleLine}>Thiệp cưới của riêng bạn.</span>
            <span className={styles.heroTitleAccent}>Đẹp từ ánh nhìn đầu tiên.</span>
          </h1>
          <p className={`${styles.heroLead} ${styles.rise} ${styles.riseDelay2}`}>
            Chọn một mẫu thiệp bạn yêu thích, gửi thông tin đám cưới, đội ngũ WeddingClick sẽ dựng thiệp hoàn chỉnh để bạn xem và duyệt
            trước khi gửi tới khách mời.
          </p>
          <div className={`${styles.heroActions} ${styles.rise} ${styles.riseDelay3}`}>
            <SectionLink href={SHOWROOM_TEMPLATES_HREF} className={`${styles.button} ${styles.buttonPrimary}`}>
              Khám phá mẫu thiệp
            </SectionLink>
            <Link href={consultationHref()} className={`${styles.button} ${styles.buttonGhost}`}>
              Tư vấn miễn phí
            </Link>
          </div>
          <ul className={`${styles.heroFacts} ${styles.rise} ${styles.riseDelay3}`}>
            {templates.length > 0 ? <li>{templates.length} mẫu thiệp để chọn</li> : null}
            <li>Thiệp chung hoặc riêng hai nhà</li>
            <li>Từ {formatVnd(startingPriceVnd)}</li>
          </ul>
        </div>
        {ordered.length > 0 ? (
          <div className={styles.heroStage}>
            <div className={styles.heroArch} aria-hidden="true" />
            <div className={styles.heroPhones}>
              {ordered.map((template, index) =>
                template === undefined ? null : (
                  <div key={template.templateCode} className={styles.heroPhone}>
                    <PhoneMockup image={template.cover} sizes="(min-width: 1024px) 252px, 44vw" priority={index === 1 || ordered.length === 1} />
                  </div>
                ),
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Benefits                                                            */
/* ------------------------------------------------------------------ */

interface Benefit {
  readonly icon: keyof typeof ShowroomIcons;
  readonly title: string;
  readonly text: string;
  readonly note?: string;
}

/** Only capabilities the V2 platform delivers today (CLAUDE.md §23). */
const BENEFITS: readonly Benefit[] = [
  { icon: "envelope", title: "Thiệp online tinh tế", text: "Thiết kế riêng cho màn hình điện thoại, hiệu ứng mở thiệp nhẹ nhàng, chữ tiếng Việt rõ đẹp." },
  { icon: "share", title: "Gửi nhanh qua Zalo, Messenger", text: "Chỉ một đường link, khách bấm là mở thiệp, không cần cài đặt gì." },
  {
    icon: "families",
    title: "Thiệp riêng nhà trai, nhà gái",
    text: "Nhà trai mời Lễ Thành Hôn, nhà gái mời Lễ Vu Quy, mỗi bên một đường link.",
    note: "Gói thiệp riêng hai nhà",
  },
  { icon: "rsvp", title: "Xác nhận tham dự (RSVP)", text: "Khách xác nhận ngay trên thiệp; cô dâu chú rể theo dõi danh sách phản hồi." },
  { icon: "map", title: "Chỉ đường Google Maps", text: "Mỗi địa điểm tổ chức có nút chỉ đường, khách không lạc giữa ngày vui." },
  { icon: "gallery", title: "Album ảnh cưới", text: "Những khoảnh khắc đẹp nhất của hai bạn, xem thoải mái trên điện thoại." },
  {
    icon: "guest",
    title: "Thiệp có tên từng khách mời",
    text: "Mỗi khách nhận đường link riêng với lời mời ghi đúng tên, ví dụ “Anh Hiếu và gia đình”.",
    note: "Dịch vụ thêm",
  },
  { icon: "support", title: "Nhân viên dựng thiệp giúp bạn", text: "Bạn chỉ cần gửi thông tin; chúng tôi dựng thiệp, gửi bản xem trước và chỉnh theo góp ý." },
];

export function Benefits({ templates }: { readonly templates: readonly ShowroomTemplateEntry[] }) {
  const figures = templates.slice(0, 2);
  return (
    <section id={SHOWROOM_SECTION_IDS.benefits} className={styles.section} aria-labelledby="loi-ich-title">
      <div className={`${styles.container} ${styles.benefitsGrid}`}>
        <div className={styles.benefitsAside}>
          <p className={styles.eyebrow}>Vì sao chọn WeddingClick</p>
          <h2 id="loi-ich-title" className={styles.sectionTitle}>
            Mọi điều tấm thiệp cưới <em>cần có</em>
          </h2>
          <p className={styles.sectionLead}>Đẹp để khách mời nhớ, tiện để hai gia đình yên tâm.</p>
          {figures.length > 0 ? (
            <div className={styles.benefitsFigure} aria-hidden="true">
              {figures.map((template) => (
                <PhoneMockup key={template.templateCode} image={{ ...template.preview, alt: "" }} sizes="220px" />
              ))}
            </div>
          ) : null}
        </div>
        <ul className={styles.benefitList}>
          {BENEFITS.map((benefit) => (
            <li key={benefit.title} className={styles.benefit}>
              <span className={styles.benefitIcon}>{ShowroomIcons[benefit.icon]()}</span>
              <div>
                <h3>{benefit.title}</h3>
                <p>{benefit.text}</p>
                {benefit.note !== undefined ? <span className={styles.benefitNote}>{benefit.note}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Ordering process                                                    */
/* ------------------------------------------------------------------ */

const STEPS: readonly { readonly title: string; readonly text: string }[] = [
  { title: "Chọn mẫu thiệp", text: "Xem thử các mẫu và chọn phong cách hợp với hai bạn." },
  { title: "Gửi thông tin đám cưới", text: "Tên cô dâu chú rể, gia đình, ngày giờ, địa điểm và ảnh cưới." },
  { title: "Xem và duyệt thiệp", text: "Nhận bản xem trước, góp ý chỉnh sửa cho tới khi ưng ý." },
  { title: "Nhận đường link thiệp", text: "Thiệp được phát hành, sẵn sàng gửi tới khách mời." },
];

export function OrderingSteps() {
  return (
    <section id={SHOWROOM_SECTION_IDS.process} className={`${styles.section} ${styles.processSection}`} aria-labelledby="quy-trinh-title">
      <div className={styles.container}>
        <div className={styles.sectionHeadCentered}>
          <p className={styles.eyebrow}>Quy trình</p>
          <h2 id="quy-trinh-title" className={styles.sectionTitle}>
            Bốn bước, <em>thật nhẹ nhàng</em>
          </h2>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

export function Pricing({
  packages,
  addons,
}: {
  readonly packages: readonly ShowroomPackageOffer[];
  readonly addons: readonly ShowroomAddonOffer[];
}) {
  return (
    <section id={SHOWROOM_SECTION_IDS.pricing} className={styles.section} aria-labelledby="bang-gia-title">
      <div className={styles.container}>
        <div className={styles.sectionHeadCentered}>
          <p className={styles.eyebrow}>Bảng giá</p>
          <h2 id="bang-gia-title" className={styles.sectionTitle}>
            Giá theo gói, <em>mẫu nào cũng vậy</em>
          </h2>
          <p className={styles.sectionLead}>Bạn chọn mẫu thiệp yêu thích, rồi chọn gói phù hợp với cách hai gia đình mời khách.</p>
        </div>
        <div className={styles.pricingGrid}>
          {packages.map((offer) => (
            <article key={offer.code} className={`${styles.plan} ${offer.highlighted ? styles.planHighlighted : ""}`}>
              {offer.highlighted ? <span className={styles.planBadge}>Trọn vẹn cho hai nhà</span> : null}
              <h3 className={styles.planName}>{offer.nameVi}</h3>
              <p className={styles.planSummary}>{offer.summaryVi}</p>
              <p className={styles.planPrice}>
                <span className={styles.planAmount}>{formatVnd(offer.priceVnd)}</span>
                <span className={styles.planUnit}>/ đám cưới</span>
              </p>
              <ul className={styles.planIncludes}>
                {offer.includesVi.map((item) => (
                  <li key={item}>
                    {ShowroomIcons.check()}
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={consultationHref()}
                className={`${styles.button} ${offer.highlighted ? styles.buttonPrimary : styles.buttonGhost}`}
              >
                Tư vấn gói này
              </Link>
            </article>
          ))}
        </div>
        {addons.map((addon) => (
          <div key={addon.code} className={styles.addon}>
            <div>
              <p className={styles.addonName}>{addon.nameVi}</p>
              <p className={styles.addonSummary}>{addon.summaryVi}</p>
            </div>
            <span className={styles.addonPrice}>+{formatVnd(addon.priceVnd)}</span>
          </div>
        ))}
        <p className={styles.pricingNote}>Thanh toán trực tiếp với WeddingClick sau khi tư vấn. Không cần tạo tài khoản.</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Closing CTA                                                         */
/* ------------------------------------------------------------------ */

export function ClosingCta({ contact }: { readonly contact: ShowroomContact }) {
  return (
    <section id={SHOWROOM_SECTION_IDS.contact} className={`${styles.closing} ${styles.section}`} aria-labelledby="lien-he-title">
      <div className={styles.container}>
        <div className={styles.closingPanel}>
          <p className={styles.eyebrow}>Bắt đầu từ hôm nay</p>
          <h2 id="lien-he-title" className={styles.closingTitle}>
            Ngày vui của hai bạn xứng đáng <em>một tấm thiệp thật đẹp</em>
          </h2>
          <p className={styles.closingLead}>Chọn mẫu bạn thích hoặc trò chuyện với chúng tôi để được gợi ý miễn phí.</p>
          <div className={styles.closingActions}>
            <SectionLink href={SHOWROOM_TEMPLATES_HREF} className={`${styles.button} ${styles.buttonLight}`}>
              Chọn mẫu thiệp
            </SectionLink>
            <ClosingContact contact={contact} />
          </div>
        </div>
      </div>
    </section>
  );
}

function ClosingContact({ contact }: { readonly contact: ShowroomContact }): ReactNode {
  if (contact.zalo === null && contact.hotline === null) {
    return (
      <Link href={consultationHref()} className={`${styles.button} ${styles.buttonOnDark}`}>
        Tư vấn miễn phí
      </Link>
    );
  }
  return <ContactActions contact={contact} tone="dark" />;
}
