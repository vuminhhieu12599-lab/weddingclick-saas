"use client";

import { useState } from "react";

import { HongAnOpening } from "./_opening/hong-an-opening";
import { LAYER_SRC } from "./_opening/layer-geometry";
import styles from "./prototype.module.css";

/**
 * HA-OPEN-02 — Product Owner review page for the approved Hồng Ân V4
 * opening effect.
 *
 * Isolated visual prototype. Static demo copy, no database, no API, no
 * audio, not part of production navigation and not imported by any
 * renderer. It exists so the movement and the light can be approved
 * before a Hồng Ân template is designed around them.
 */

const WIDTHS = [360, 390, 430] as const;
type Width = (typeof WIDTHS)[number];

/**
 * Hero photographs. The V4 stand-in comes first because it is the one the
 * approved review frames were made from, so the preview can be compared
 * against them directly; the others are borrowed from the existing
 * showroom demo sets to show how other crops behave behind the doors. A
 * real Project supplies this photo through the InvitationViewModel.
 */
const PHOTOS: ReadonlyArray<{ key: string; label: string; src: string }> = [
  { key: "v4", label: "Ảnh V4", src: LAYER_SRC.demoPhoto },
  {
    key: "steps",
    label: "Cận cảnh",
    src: "/showroom/demo/romantic-minimal/photos/09-wedding-couple-steps.webp",
  },
  {
    key: "vows",
    label: "Toàn thân",
    src: "/showroom/demo/romantic-minimal/photos/07-garden-wedding-vows.webp",
  },
  {
    key: "editorial",
    label: "Editorial",
    src: "/showroom/demo/elegant-editorial/photos/01-cover-couple-portrait.webp",
  },
];

export default function HongAnOpeningPrototypePage() {
  const [width, setWidth] = useState<Width>(390);
  const [photo, setPhoto] = useState(PHOTOS[0]);
  const [reducedMotion, setReducedMotion] = useState(false);
  // Remounting the prototype is the simplest honest replay: it restores
  // the true first-visit state rather than reversing the animation.
  const [replay, setReplay] = useState(0);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Hồng Ân — HA-OPEN-02 · hiệu ứng mở cửa nhà thờ (bản V4)
        </h1>
        <p className={styles.subtitle}>
          Dựng theo bộ asset V4 đã được duyệt. Kiến trúc nhà thờ tràn viền toàn
          màn hình và đứng yên; hai cánh cửa là hai lớp độc lập cắt từ cùng một
          ảnh gốc, xoay quanh bản lề ngoài bằng CSS 3D cùng một vệt sáng ấm ở
          khe cửa. <strong>Ảnh cưới nằm sẵn phía sau</strong> từ khung hình đầu
          tiên: cửa mở ra là lộ chính tấm ảnh đó, rồi phần đá và hoa tan đi để
          ảnh thành hero toàn màn hình — không có cảnh nhà thờ thứ hai, không
          có tấm panel trắng đục. Toàn bộ tên, ngày và lời Kinh Thánh là chữ
          sống, không nằm trong ảnh. Không có nhạc tự động.
        </p>
      </header>

      <p className={styles.warning}>
        <strong>Asset V4 — bản duyệt hình ảnh, chưa phải production.</strong>{" "}
        Cánh cửa chưa có bề dày thật và mặt trong của vòm vẫn là xấp xỉ, không
        phải hình học 3D chính xác. Ảnh cưới mặc định là ảnh minh hoạ kèm theo
        gói V4, không phải ảnh của khách. Xem danh sách tồn đọng ở cuối trang
        trước khi kết luận về chất lượng hình ảnh.
      </p>

      <div className={styles.controls}>
        <div className={styles.group}>
          <span className={styles.groupLabel}>Chiều rộng</span>
          <div className={styles.buttons}>
            {WIDTHS.map((value) => (
              <button
                key={value}
                type="button"
                className={styles.chip}
                aria-pressed={width === value}
                onClick={() => setWidth(value)}
              >
                {value}px
              </button>
            ))}
          </div>
        </div>

        <div className={styles.group}>
          <span className={styles.groupLabel}>Ảnh cưới</span>
          <div className={styles.buttons}>
            {PHOTOS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={styles.chip}
                aria-pressed={photo.key === option.key}
                onClick={() => setPhoto(option)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.group}>
          <span className={styles.groupLabel}>Giảm chuyển động</span>
          <div className={styles.buttons}>
            <button
              type="button"
              className={styles.chip}
              aria-pressed={reducedMotion}
              onClick={() => setReducedMotion((on) => !on)}
            >
              {reducedMotion ? "Đang bật" : "Giả lập"}
            </button>
          </div>
        </div>

        <div className={styles.group}>
          <span className={styles.groupLabel}>Xem lại</span>
          <div className={styles.buttons}>
            <button
              type="button"
              className={styles.chip}
              onClick={() => setReplay((n) => n + 1)}
            >
              ↻ Phát lại
            </button>
          </div>
        </div>
      </div>

      <div className={styles.canvas}>
        <div className={styles.phone} style={{ width: `${width + 14}px` }}>
          <div className={styles.screen}>
            <HongAnOpening
              key={`${replay}-${reducedMotion}-${photo.key}`}
              photoSrc={photo.src}
              forceReducedMotion={reducedMotion}
            />
          </div>
        </div>
      </div>

      <div className={styles.footnote}>
        <strong>
          Tồn đọng hình ảnh đã ghi nhận (cần một lượt art pass trước khi dựng
          template):
        </strong>
        <ul>
          <li>
            Cánh cửa chưa có bề dày: xoay đến góc lớn vẫn mỏng như tờ giấy, chỉ
            có đổ bóng cạnh giả lập chứ chưa có mặt cạnh thật.
          </li>
          <li>
            Mặt trong của vòm và má cửa (<code>door-reveal</code>) là lớp xấp
            xỉ, không phải kiến trúc 3D dựng lại cho đúng phối cảnh.
          </li>
          <li>
            Chữ đang dùng font hệ thống (Georgia / Arial). Bản production cần
            một bộ serif có giấy phép web và đã kiểm tra đủ dấu tiếng Việt theo{" "}
            <code>docs/TYPOGRAPHY_AND_MOTION.md</code> §3–4.
          </li>
          <li>
            Bộ asset nặng ~3,9&nbsp;MB (WebP lossless để giữ nguyên pixel đã
            duyệt). Bản production phải xuất lớp theo đúng kích thước hiển thị
            và nén có mất dữ liệu ở mức chấp nhận được.
          </li>
          <li>
            Ảnh cưới mặc định là ảnh minh hoạ của gói V4; template thật phải
            lấy ảnh từ media của Project.
          </li>
        </ul>
      </div>
    </main>
  );
}
