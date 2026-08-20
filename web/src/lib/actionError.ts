import "server-only";

export interface KnownDbError {
  test: (message: string, code?: string) => boolean;
  friendly: string;
}

// Postgres 的原始錯誤訊息可能露出 constraint/function/table/column 名稱,不該直接丟給
// 使用者。已知情境用清楚的中文訊息取代;沒對到的一律變成「操作失敗 + 錯誤代碼」,
// 真正的錯誤內容記到伺服器 log(Vercel function log),不會出現在使用者畫面上。
export function toFriendlyError(error: { message: string; code?: string }, known: KnownDbError[] = []): string {
  for (const k of known) {
    if (k.test(error.message, error.code)) return k.friendly;
  }
  const errorId = Math.random().toString(36).slice(2, 8).toUpperCase();
  console.error(`[action-error ${errorId}]`, error);
  return `操作失敗，請稍後再試（錯誤代碼 ${errorId}）`;
}
