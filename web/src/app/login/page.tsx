import { connection } from "next/server";
import { LoginClient } from "./LoginClient";

// nonce-based CSP 只能在動態渲染的頁面套用(nonce 要在請求當下產生,靜態頁面
// build time 就把 HTML 定形了,沒有請求可以附加 nonce)。這頁本來會被 Next.js
// 判定成純靜態(沒有任何 await/資料抓取),用 connection() 強制它變成逐請求渲染,
// 讓 proxy.ts 產生的 nonce 能正確套用到這頁的 script 標籤上。
export default async function LoginPage() {
  await connection();
  return <LoginClient />;
}
