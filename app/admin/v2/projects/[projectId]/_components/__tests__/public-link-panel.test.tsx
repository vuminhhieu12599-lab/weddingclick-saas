import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../../../../../../lib/admin/admin-api-error";

/** LAUNCH-P0-02 correction: Staff reviews, edits and explicitly confirms the immutable friendly URL. */

vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({ assignInvitationPublicAlias: vi.fn() }));

const { FriendlyLinkReviewForm, submitFriendlyLink } = await import("../public-link-panel");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const noop = () => {};
const form = (primary: string, secondary: string, variant: "GROOM" | "BRIDE" = "BRIDE") =>
  renderToStaticMarkup(
    <FriendlyLinkReviewForm
      variant={variant}
      origin="https://thiep.example"
      primary={primary}
      secondary={secondary}
      pending={false}
      onPrimaryChange={noop}
      onSecondaryChange={noop}
      onConfirm={noop}
      onCancel={noop}
    />,
  );

describe("FriendlyLinkReviewForm", () => {
  it("shows the proposed names, the normalized final URL, the permanence warning and an explicit confirm", () => {
    const html = form("thu-ha", "minh-anh");
    expect(html).toContain('value="thu-ha"');
    expect(html).toContain('value="minh-anh"');
    expect(html).toContain("https://thiep.example/i/thu-ha&amp;minh-anh");
    expect(html).toContain("không thể sửa");
    expect(html).toContain("Xác nhận tạo link");
    expect(html).toContain("cô dâu trước, chú rể sau");
    expect(form("minh-anh", "thu-ha", "GROOM")).toContain("chú rể trước, cô dâu sau");
  });

  it("edited Vietnamese names are normalized live (accents, đ, spaces)", () => {
    expect(form("Thu Hà", "Đặng Minh Anh")).toContain("/i/thu-ha&amp;dang-minh-anh");
  });

  it("invalid names: no final URL and the confirm button is disabled", () => {
    const html = form("Thu Hà", "!!!");
    expect(html).toContain("cần đủ hai tên");
    expect(html).toMatch(/<button type="submit" disabled=""/);
  });
});

describe("submitFriendlyLink", () => {
  it("writes exactly the reviewed alias once", async () => {
    const assign = vi.fn(async () => ({ variant: "BRIDE" as const, alias: "ha&anh", publicPath: "/i/ha&anh" }));
    expect(await submitFriendlyLink(PROJECT_ID, "BRIDE", "Hà", "Anh", assign)).toEqual({ status: "CREATED" });
    expect(assign).toHaveBeenCalledExactlyOnceWith(PROJECT_ID, "BRIDE", "ha&anh");
  });

  it("invalid input never reaches the server", async () => {
    const assign = vi.fn();
    expect(await submitFriendlyLink(PROJECT_ID, "GROOM", "", "Anh", assign)).toEqual({ status: "INVALID" });
    expect(assign).not.toHaveBeenCalled();
  });

  it("a collision keeps the form open (no reload) with a usable message; already-assigned reloads", async () => {
    const taken = await submitFriendlyLink(PROJECT_ID, "BRIDE", "Thu Hà", "Minh Anh", async () => {
      throw new AdminApiError(409, "taken", { reason: "ALIAS_TAKEN", alias: "thu-ha&minh-anh" });
    });
    expect(taken).toMatchObject({ status: "FAILED", reload: false, failure: { manual: true } });
    expect(taken.status === "FAILED" && taken.failure.message).toContain("đã được dùng");
    const assigned = await submitFriendlyLink(PROJECT_ID, "BRIDE", "Thu Hà", "Minh Anh", async () => {
      throw new AdminApiError(409, "x", { reason: "ALIAS_ALREADY_ASSIGNED" });
    });
    expect(assigned).toMatchObject({ status: "FAILED", reload: true });
  });
});
