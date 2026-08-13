import type { Metadata } from "next";
import "./globals.css"; // DÒNG QUAN TRỌNG NHẤT ĐỂ NẠP TAILWIND CSS

export const metadata: Metadata = {
  title: "WeddingClick - Thiệp cưới online",
  description: "Nền tảng tạo thiệp cưới thông minh",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}