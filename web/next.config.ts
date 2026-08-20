import type { NextConfig } from "next";

// 資安複查發現這裡完全空白,沒有任何應用層 header。這是一個合理的基準線,不是完整
// nonce-based CSP(那個工程量更大,牽動 Next.js middleware 產生每次請求的 nonce,
// 這輪先不做)。CSP 的 connect-src/frame-src/img-src 對應到真的在用的外部服務:
// Supabase(API + 未來的檔案)、Backblaze B2(音檔簽章網址)、YouTube(推薦曲目 iframe)、
// Google avatar CDN。
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://lh3.googleusercontent.com https://cdn.discordapp.com https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.backblazeb2.com https://studio-api-prod.suno.com",
  "frame-src https://www.youtube.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
