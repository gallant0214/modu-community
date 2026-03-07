import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "모두의 지도사 게시판",
  description: "모두의 지도사 게시판 게시판",
  other: {
    "color-scheme": "light dark",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 36px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
        }}
      >
        {/* 상단 상태바 고정 배경 - 스크롤 시 콘텐츠가 시계 뒤로 가리지 않도록 */}
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 'calc(env(safe-area-inset-top, 0px) + 36px)',
            zIndex: 9990,
            pointerEvents: 'none',
          }}
          className="bg-white dark:bg-zinc-950"
        />
        {children}
      </body>
    </html>
  );
}
