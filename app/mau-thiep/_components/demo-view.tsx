import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { InvitationVariant } from "../../../lib/domain";
import {
  DEMO_VARIANT_SEGMENTS,
  buildDemoRenderData,
  isDemoVariantSegment,
  type DemoVariantSegment,
} from "../../../lib/showroom/demo/build-demo-render-data";
import { PUBLIC_SHOWROOM_TEMPLATES, findPublicShowroomTemplate, type PublicShowroomTemplate } from "../../../lib/showroom/showroom-catalog";
import { getShowroomContact } from "../../../lib/showroom/showroom-contact";
import { SHOWROOM_TEMPLATES_HREF, consultationHref, demoHref } from "../../../lib/showroom/showroom-routes";
import { FloatingContact } from "../../_showroom/floating-contact";
import { ShowroomIcons } from "../../_showroom/icons";
import { SHOWROOM_FONT_VARIABLES_CLASS_NAME } from "../../_showroom/showroom-fonts";
import styles from "./demo.module.css";
import { DemoInvitationRenderer } from "./demo-invitation-renderer";

const VARIANT_TABS: readonly { readonly segment: DemoVariantSegment | undefined; readonly variant: InvitationVariant; readonly label: string }[] = [
  { segment: undefined, variant: "COMMON", label: "Thiệp chung" },
  { segment: "nha-trai", variant: DEMO_VARIANT_SEGMENTS["nha-trai"], label: "Nhà trai" },
  { segment: "nha-gai", variant: DEMO_VARIANT_SEGMENTS["nha-gai"], label: "Nhà gái" },
];

/** Static params for every public template (× optional variant segment). */
export function demoTemplateParams(): { templateCode: string }[] {
  return PUBLIC_SHOWROOM_TEMPLATES.map((template) => ({ templateCode: template.templateCode }));
}

export function resolveDemoRoute(templateCode: string, segment: string | undefined): { template: PublicShowroomTemplate; segment: DemoVariantSegment | undefined } {
  const template = findPublicShowroomTemplate(templateCode);
  if (template === undefined) notFound();
  if (segment !== undefined && !isDemoVariantSegment(segment)) notFound();
  return { template, segment };
}

export function demoMetadata(template: PublicShowroomTemplate, segment: DemoVariantSegment | undefined): Metadata {
  const title = `${template.nameVi} — Thiệp cưới mẫu | WeddingClick`;
  const description = `Xem thử mẫu thiệp cưới online “${template.nameVi}” (${template.nameEn}). ${template.taglineVi}`;
  return {
    title,
    description,
    // Variant pages repeat the same design; only the main demo page is indexed.
    ...(segment === undefined ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "website",
      locale: "vi_VN",
      siteName: "WeddingClick",
      title,
      description,
      images: [{ url: template.cover.src, width: template.cover.width, height: template.cover.height, alt: template.cover.alt }],
    },
  };
}

/**
 * A public showroom demo: the real production renderer over the fictional
 * demo wedding, framed by an in-flow demo bar above and a call to action
 * below (never overlaying the invitation's own fixed UI).
 *
 * WC-SHOWROOM-CONTACT-01: the floating contact buttons mount beside the demo
 * root, outside `DemoInvitationRenderer`, so no invitation renderer changes
 * and the template's own fixed controls (all top-right) keep their corner.
 */
export async function DemoView({ template, segment }: { readonly template: PublicShowroomTemplate; readonly segment: DemoVariantSegment | undefined }) {
  const variant = segment === undefined ? "COMMON" : DEMO_VARIANT_SEGMENTS[segment];
  const data = await buildDemoRenderData(template.rendererKey, variant);
  const contact = getShowroomContact();
  return (
    <>
      <div className={`${SHOWROOM_FONT_VARIABLES_CLASS_NAME} ${styles.root}`}>
        <header className={styles.bar}>
          <div className={styles.barRow}>
            <Link href={SHOWROOM_TEMPLATES_HREF} className={styles.back}>
              {ShowroomIcons.arrowLeft(styles.icon)} <span>Mẫu thiệp</span>
            </Link>
            <p className={styles.title}>
              <span className={styles.badge}>Thiệp mẫu</span>
              <span className={styles.name}>{template.nameVi}</span>
            </p>
            <Link href={consultationHref(template.templateCode)} className={styles.choose}>
              Chọn mẫu này
            </Link>
          </div>
          <nav className={styles.tabs} aria-label="Xem thiệp theo bên">
            {VARIANT_TABS.map((tab) => (
              <Link
                key={tab.label}
                href={demoHref(template.templateCode, tab.segment)}
                className={styles.tab}
                aria-current={tab.segment === segment ? "page" : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
          <p className={styles.note}>Tên, ngày giờ, địa điểm và ảnh là minh hoạ. Phản hồi RSVP trong thiệp mẫu không được gửi đi.</p>
        </header>

        <DemoInvitationRenderer rendererKey={data.rendererKey} viewModel={data.viewModel} sections={data.sections} />

        <aside className={styles.footer} aria-label="Đặt mẫu thiệp này">
          <p className={styles.footerEyebrow}>{template.nameEn}</p>
          <h2 className={styles.footerTitle}>Bạn thích mẫu “{template.nameVi}”?</h2>
          <p className={styles.footerText}>{template.descriptionVi}</p>
          <div className={styles.footerActions}>
            <Link href={consultationHref(template.templateCode)} className={styles.primary}>
              Chọn mẫu này
            </Link>
            <Link href={SHOWROOM_TEMPLATES_HREF} className={styles.secondary}>
              Xem mẫu khác
            </Link>
          </div>
        </aside>
      </div>
      <FloatingContact contact={contact} />
    </>
  );
}
