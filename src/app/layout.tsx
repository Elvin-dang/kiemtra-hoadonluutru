import { Be_Vietnam_Pro } from "next/font/google";

import "./globals.css";

import type { Metadata } from "next";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kiểm tra hóa đơn lưu trú",
  description: "Kiểm tra thời điểm lập hóa đơn so với ngày check-out.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${beVietnamPro.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
