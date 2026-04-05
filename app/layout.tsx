import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/app/components/auth-provider";
import { NavBar } from "@/app/components/nav-bar";

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
  description: "모두의 지도사 커뮤니티 - 종목후기, 구인 게시판",
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
          // NavBar(56px) + safe-area-top
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
        }}
      >
        <AuthProvider>
          <NavBar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
