export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // 中文/日文等 CJK 字元直接取第一個字；英數名稱取前兩個字首字母（Gmail 的預設頭像規則）。
  if (/[㐀-鿿]/.test(trimmed)) return trimmed.slice(0, 1);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : trimmed.slice(0, 2);
  return letters.toUpperCase();
}
