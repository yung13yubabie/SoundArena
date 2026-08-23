// <input type="datetime-local"> 的 value 是沒有時區資訊的「牆上時鐘」字串
// (YYYY-MM-DDTHH:mm)，必須用瀏覽器自己的 Date 物件換算成正確帶時區的 ISO 字串
// 再送給伺服器，否則 Postgres 會把它當成 UTC 解讀，造成時區換算錯誤。

export function toDatetimeLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalInput(value: string): string {
  return value === "" ? "" : new Date(value).toISOString();
}

// value 已經是 datetime-local 格式(本地時區的純文字)，不需要再經過 Date 物件
// 轉換就能直接重新排版顯示。
export function formatLocalForDisplay(value: string): string {
  if (!value) return "（尚未設定）";
  const [datePart, timePart] = value.split("T");
  const [, month, day] = datePart.split("-");
  return timePart ? `${Number(month)}/${Number(day)} ${timePart}` : `${Number(month)}/${Number(day)}`;
}
