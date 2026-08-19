import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import "./globals.css";
import { HelpBubble } from "@/components/HelpBubble";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://web-mocha-xi-12.vercel.app"),
  title: "聲擂 SoundArena",
  description: "音樂比賽投票網站",
};

const SYSTEM_SANS_VARIABLE_STYLE = {
  "--font-system-sans":
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif',
} as React.CSSProperties;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${newsreader.variable} h-full`} suppressHydrationWarning>
      <body
        className="min-h-full flex flex-col font-sans antialiased"
        style={SYSTEM_SANS_VARIABLE_STYLE}
      >
        {children}
        <HelpBubble />
      </body>
    </html>
  );
}
