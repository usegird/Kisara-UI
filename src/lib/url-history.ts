export function trimBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export const URL_HISTORY_LIMIT = 10;

export function pushUrlHistory(history: readonly string[], url: string): string[] {
  const trimmed = url.trim();
  if (trimmed.length === 0) return [...history];
  return [trimmed, ...history.filter((item) => item !== trimmed)].slice(0, URL_HISTORY_LIMIT);
}

export function normalizeUrlHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item === 'string' && item.trim().length > 0) seen.add(item.trim());
  }
  return [...seen].slice(0, URL_HISTORY_LIMIT);
}
