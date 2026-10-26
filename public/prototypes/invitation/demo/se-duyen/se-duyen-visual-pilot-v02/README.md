# WeddingClick — Se Duyên / Hộp cưới mở ra (Visual Pilot v0.2)

Chỉ dùng để **duyệt giao diện prototype**, chưa phải asset production được duyệt.

## Nội dung

- `cover-background.webp`: Nền truyền thống lấy cảm hứng từ sơn mài, sen Việt.
- `box-closed.webp`: Hộp cưới ở trạng thái đóng (raster alpha).
- `box-open.webp`: Hộp cưới ở trạng thái mở (raster alpha).
- `open-seal.webp`: Nút/bằng chứng chạm mở hộp, có thể dùng nhỏ hoặc không dùng nếu làm chật màn hình.
- `red-thread.webp`: Dải tơ hồng dùng tiết chế làm lớp trang trí.

## Pilot cần dựng

1. Màn hình đầu có nền + HỘP ĐÓNG làm chủ thể, chỉ một nút **“Chạm để mở hộp”** nằm ở vị trí an toàn trên điện thoại nhỏ.
2. Chạm -> phản hồi nút -> chuyển từ hộp đóng sang hộp mở, tạo cảm giác nắp mở; **ảnh cưới demo hư cấu** xuất hiện/từ trong hộp nổi lên.
3. Sau chuyển động, sang **hero** với ảnh cưới lớn, tên cô dâu/chú rể và ngày cưới là text DOM, không ghi chữ lên asset. Hero ngắn, thoáng.
4. Không dùng khung ảnh vàng dày; ảnh cưới quan trọng hơn hoa văn.
5. Chỉ review 390px. Kiểm tra không che nút ở 360px là đủ trong bước này. Không thêm section, không tests/build toàn repo, không commit/push/Production.

## Giới hạn quan trọng

`box-closed` và `box-open` là **hai ảnh AI render độc lập**, không phải hai frame 3D khớp hình học 100%. Chúng thích hợp để **thử hướng visual qua crossfade / scale / translate**, không đủ để làm một hoạt cảnh bản lề nắp hộp chính xác. Nếu hiệu ứng trông như nhảy cảnh, dừng lại và đề xuất tạo cặp asset nắp/thân nhất quán trước; **không viết animation phức tạp để che sai khác hình học**.

Các họa tiết có cảm hứng từ mỹ thuật Việt, **không phải hoa văn lịch sử được chứng nhận**. Không dùng chữ Hán/cung đình Trung Hoa làm điểm nhấn. Ảnh cưới demo cần riêng, do PO cung cấp hoặc một bộ demo có quyền sử dụng; không dùng dữ liệu khách thật.

## Thông số asset

| File | Kích thước | Dung lượng | Alpha | SHA-256 |
|---|---:|---:|:---:|---|
| `cover-background.webp` | 941×1672 | 140 KiB | no | `02a9032359315e91cada944f9390424f3866d21238fe426c42d6dae052185c93` |
| `box-closed.webp` | 800×1000 | 128 KiB | yes | `07cb480575cf920ae2403ec6d4d0212c2fbb2b19b574261424b41ccfea650602` |
| `box-open.webp` | 800×1000 | 107 KiB | yes | `9bc5dbdd53688bddc4abb484ca2073a9aa955455ed8d311fdb0e49789f859536` |
| `open-seal.webp` | 320×320 | 26 KiB | yes | `7d7bc608d46c8f714fe9d47db9a548ead3e797d5444f34efcc2bd8567c18b25c` |
| `red-thread.webp` | 700×525 | 39 KiB | yes | `0d41e433d79c7ca64bed77f31bef7feeb8caade56324c0748e37cf672dc21372` |
