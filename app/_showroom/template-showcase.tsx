import Link from "next/link";

import type { ShowroomTemplateEntry } from "../../lib/showroom/showroom-catalog";
import { SHOWROOM_SECTION_IDS, consultationHref } from "../../lib/showroom/showroom-routes";
import styles from "./showroom.module.css";
import { TemplateGrid } from "./template-grid";

/**
 * The template collection. Renders whatever public entries it is given, in
 * order, through the filterable `TemplateGrid` (2 per row on phones, 3–4 on
 * wider screens). Zero entries → a calm empty state.
 */
export function TemplateShowcase({ templates }: { readonly templates: readonly ShowroomTemplateEntry[] }) {
  return (
    <section id={SHOWROOM_SECTION_IDS.templates} className={`${styles.section} ${styles.showroomSection}`} aria-labelledby="mau-thiep-title">
      <div className={styles.container}>
        <div className={styles.showroomHead}>
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Bộ sưu tập</p>
            <h2 id="mau-thiep-title" className={styles.sectionTitle}>
              Mỗi mẫu thiệp, <em>một câu chuyện riêng</em>
            </h2>
            <p className={styles.sectionLead}>Chạm vào một mẫu để mở thiệp và trải nghiệm đúng như khách mời của bạn sẽ thấy.</p>
          </div>
          {templates.length > 0 ? (
            <p className={styles.showroomCount}>{templates.length} mẫu thiệp đang có</p>
          ) : null}
        </div>

        {templates.length > 0 ? (
          <TemplateGrid templates={templates} />
        ) : (
          <div className={styles.emptyState}>
            <h3>Bộ sưu tập đang được làm mới</h3>
            <p>Các mẫu thiệp mới sắp ra mắt. Bạn vẫn có thể nhận tư vấn ngay hôm nay.</p>
            <Link href={consultationHref()} className={`${styles.button} ${styles.buttonPrimary}`}>
              Tư vấn miễn phí
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
