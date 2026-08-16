export function youtubeEmbedUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const patterns = [/youtu\.be\/([\w-]{6,})/, /[?&]v=([\w-]{6,})/, /youtube\.com\/embed\/([\w-]{6,})/, /youtube\.com\/shorts\/([\w-]{6,})/];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return `https://www.youtube.com/embed/${match[1]}`;
  }
  return null;
}
