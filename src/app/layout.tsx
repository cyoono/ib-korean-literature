import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IB · 글로컬 K-문학",
  description: "IB Language A: Literature 자기주도 학습 온라인 강좌",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;700;900&family=Noto+Sans+KR:wght@300;400;500;700&family=Cormorant+Garamond:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}