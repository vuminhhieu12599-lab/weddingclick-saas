import type { Metadata } from "next";

import { Benefits, ClosingCta, Hero, OrderingSteps, Pricing } from "./_showroom/home-sections";
import { ShowroomShell } from "./_showroom/site-chrome";
import { TemplateShowcase } from "./_showroom/template-showcase";
import { PUBLIC_SHOWROOM_TEMPLATES } from "../lib/showroom/showroom-catalog";
import { getShowroomContact } from "../lib/showroom/showroom-contact";
import { SHOWROOM_SOCIAL_IMAGE } from "../lib/showroom/showroom-metadata";
import { SHOWROOM_SITE_URL } from "../lib/showroom/showroom-site-url";
import { SHOWROOM_ADDON_OFFERS, SHOWROOM_PACKAGE_OFFERS } from "../lib/showroom/showroom-pricing";

const TITLE = "WeddingClick — Thiệp cưới online đẹp từ ánh nhìn đầu tiên";
const DESCRIPTION =
  "Bộ sưu tập thiệp cưới online sang trọng: xem thử từng mẫu, thiệp chung hoặc riêng nhà trai nhà gái, xác nhận tham dự, chỉ đường Google Maps. Đội ngũ WeddingClick dựng thiệp giúp bạn.";

/**
 * WC-PROD-REVIEW-01: `metadataBase` is set HERE, on the page, not in the root
 * layout, so published invitations and the template demo pages keep resolving
 * their own Open Graph images exactly as before. Every value is a build-time
 * constant, so the homepage stays statically rendered.
 */
export const metadata: Metadata = {
  metadataBase: SHOWROOM_SITE_URL,
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: "WeddingClick",
    url: SHOWROOM_SITE_URL.toString(),
    title: TITLE,
    description: DESCRIPTION,
    images: [SHOWROOM_SOCIAL_IMAGE],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [SHOWROOM_SOCIAL_IMAGE.url] },
};

/**
 * LAUNCH-P0-04 public showroom homepage. Static: built from the public
 * template catalog, the typed price list and the configured contact; no
 * database, no session, no customer data.
 */
export default function ShowroomHomePage() {
  const contact = getShowroomContact();
  const startingPriceVnd = Math.min(...SHOWROOM_PACKAGE_OFFERS.map((offer) => offer.priceVnd));
  return (
    <ShowroomShell contact={contact}>
      <Hero templates={PUBLIC_SHOWROOM_TEMPLATES} startingPriceVnd={startingPriceVnd} />
      <TemplateShowcase templates={PUBLIC_SHOWROOM_TEMPLATES} />
      <Benefits templates={PUBLIC_SHOWROOM_TEMPLATES} />
      <OrderingSteps />
      <Pricing packages={SHOWROOM_PACKAGE_OFFERS} addons={SHOWROOM_ADDON_OFFERS} />
      <ClosingCta contact={contact} />
    </ShowroomShell>
  );
}
