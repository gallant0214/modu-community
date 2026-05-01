import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/app/components/auth-provider";
import { NavBar } from "@/app/components/nav-bar";
import { AppResilience } from "@/app/components/app-resilience";
import { WebPushInitializer } from "@/app/components/web-push-initializer";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "모두의 지도사 커뮤니티",
  description: "종목별 경험과 정보를 나누는 커뮤니티. 실기·구술 후기, 스포츠 구인 공고를 한곳에서 확인하세요.",
  metadataBase: new URL("https://moducm.com"),
  openGraph: {
    title: "모두의 지도사 커뮤니티",
    description: "종목별 경험과 정보를 나누는 커뮤니티. 실기·구술 후기, 스포츠 구인 공고를 한곳에서 확인하세요.",
    url: "https://moducm.com",
    siteName: "모두의 지도사 커뮤니티",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "모두의 지도사 커뮤니티" }],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "모두의 지도사 커뮤니티",
    description: "종목별 경험과 정보를 나누는 커뮤니티. 실기·구술 후기, 스포츠 구인 공고를 한곳에서 확인하세요.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  other: {
    "color-scheme": "light",
    "msvalidate.01": "0BB0F3FA8383FA4BC8A43B4559FFA2AF",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning className="light" style={{ colorScheme: "light" }}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{
          // NavBar(56px) + safe-area-top
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
        }}
      >
        <AuthProvider>
          <AppResilience />
          <WebPushInitializer />
          <NavBar />
          {children}
        </AuthProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
