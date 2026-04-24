import type { NextConfig } from "next";

// 프로덕션 CSP는 report-only 로 먼저 배포해 Firebase/Google/Apple SDK 위반을
// 모니터링한 뒤 점진적으로 enforcing 으로 전환한다.
const cspReportOnly =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' " +
    "https://*.gstatic.com https://*.googleapis.com https://apis.google.com " +
    "https://*.firebaseapp.com https://*.firebase.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "img-src 'self' data: blob: https:; " +
  "font-src 'self' data: https://fonts.gstatic.com; " +
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com " +
    "wss://*.firebaseio.com https://*.firebase.com https://*.firebaseapp.com " +
    "https://securetoken.googleapis.com https://identitytoolkit.googleapis.com " +
    "https://*.neon.tech https://firebasestorage.googleapis.com; " +
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://appleid.apple.com; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "frame-ancestors 'none'; " +
  "upgrade-insecure-requests";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Report-Only: 실제 차단하지 않고 위반만 브라우저 콘솔에 리포트. 안정화 후 enforcing 전환.
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  images: {
    // Next.js <Image> 가 허용할 외부 이미지 호스트 화이트리스트.
    // Cloudinary 직접 URL은 대체로 optimizeCloudinaryUrl() 로 변환 후 그대로 쓰지만,
    // <Image> 로 감싸 사용할 경우를 대비해 등록.
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google 프로필
      { protocol: "https", hostname: "appleid.cdn-apple.com" }, // Apple 프로필
    ],
  },
  async redirects() {
    return [
      // index.html 요청을 / 로 리다이렉트 (Bing 404 에러 방지)
      { source: "/index.html", destination: "/", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // API 라우트 CORS: 같은 도메인만 허용
        source: "/api/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "Access-Control-Allow-Origin",
            value: process.env.ALLOWED_ORIGIN || "https://moducm.com",
          },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
