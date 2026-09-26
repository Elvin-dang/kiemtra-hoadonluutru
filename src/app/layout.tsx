import { Be_Vietnam_Pro } from "next/font/google";

import "./globals.css";

import type { Metadata, Viewport } from "next";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
});

const SITE_NAME = "Kiểm tra hóa đơn lưu trú";
const DESCRIPTION =
  "Tải lên file xuất hóa đơn điện tử bán ra để tìm ngày check-out, cảnh báo hóa đơn lưu trú lập trễ và tải kết quả Excel. Dữ liệu được xử lý ngay trên trình duyệt.";

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "kiểm tra hóa đơn",
    "hóa đơn điện tử",
    "hóa đơn bán ra",
    "hóa đơn lưu trú",
    "khách sạn",
    "ngày check-out",
    "thời điểm lập hóa đơn",
  ],
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "vi_VN", siteName: SITE_NAME, title: SITE_NAME, description: DESCRIPTION },
  twitter: { card: "summary", title: SITE_NAME, description: DESCRIPTION },
  // Tax codes and invoice numbers are long digit runs; stop iOS from turning them into phone links.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#006B4F",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${beVietnamPro.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
