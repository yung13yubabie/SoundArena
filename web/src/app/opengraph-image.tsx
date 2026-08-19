import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#130b09",
          backgroundImage:
            "radial-gradient(1200px 600px at 15% -10%, rgba(255,106,61,0.22), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(192,57,43,0.16), transparent 55%)",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 110,
            height: 110,
            borderRadius: 28,
            background: "linear-gradient(135deg, #ff9457 0%, #ff6a3d 55%, #c0392b 100%)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 36,
          }}
        >
          <svg width="52" height="52" viewBox="0 0 64 64">
            <rect
              x="20"
              y="20"
              width="24"
              height="24"
              rx="4"
              fill="none"
              stroke="#1a0e08"
              strokeWidth="2.5"
              transform="rotate(45 32 32)"
            />
            <rect x="26" y="26" width="12" height="12" rx="2" fill="#1a0e08" transform="rotate(45 32 32)" />
          </svg>
        </div>
        <div style={{ display: "flex", fontSize: 76, color: "#f3ece7", fontWeight: 700, letterSpacing: -2 }}>
          聲擂 SoundArena
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#b9a89f", marginTop: 18 }}>AI 音樂比賽投票網站</div>
      </div>
    ),
    { ...size },
  );
}
