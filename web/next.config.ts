import type { NextConfig } from "next";

// Content-Security-Policy 改成 nonce-based,由 web/src/proxy.ts 逐請求產生
// (每個請求的 nonce 都不一樣,沒辦法在這裡用固定字串)——這裡只放不需要 nonce、
// 對全部路徑都適用的固定 header。
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
