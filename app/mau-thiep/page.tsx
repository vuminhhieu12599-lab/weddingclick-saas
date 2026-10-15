import { redirect } from "next/navigation";

import { SHOWROOM_TEMPLATES_HREF } from "../../lib/showroom/showroom-routes";

/** `/mau-thiep` has no page of its own: the collection lives on the homepage. */
export default function ShowroomTemplatesIndex(): never {
  redirect(SHOWROOM_TEMPLATES_HREF);
}
