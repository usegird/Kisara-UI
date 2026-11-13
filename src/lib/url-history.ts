// ─────────────────────────────
// 接続先の履歴。つながった接続先を新しい順に持つ。同じものは先頭へ寄せ、
// 上限を超えたら古いものから手放す。
// ─────────────────────────────

/**
 * ComfyUI の接続先を揃える。前後の空白と末尾の `/` を落とす。
 * 接続先はノード定義のキャッシュの鍵にもなるので、`/` の有無で別の接続先として扱わない
 */
export function trimBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** 覚えておく数 */
export const URL_HISTORY_LIMIT = 10;

/** 先頭に足す。空は足さない */
export function pushUrlHistory(history: readonly string[], url: string): string[] {
  const trimmed = url.trim();
  if (trimmed.length === 0) return [...history];
  return [trimmed, ...history.filter((item) => item !== trimmed)].slice(0, URL_HISTORY_LIMIT);
}

/** 残した値を読む。文字の並びでなければ空。重なりと空を落とし、上限で切る */
export function normalizeUrlHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item === 'string' && item.trim().length > 0) seen.add(item.trim());
  }
  return [...seen].slice(0, URL_HISTORY_LIMIT);
}
