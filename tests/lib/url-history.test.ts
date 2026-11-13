import { describe, expect, it } from 'vitest';

import {
  normalizeUrlHistory,
  pushUrlHistory,
  trimBaseUrl,
  URL_HISTORY_LIMIT,
} from '@/lib/url-history';

// ─────────────────────────────
// 接続先の履歴の並びと件数。
// ─────────────────────────────

describe('接続先の履歴', () => {
  it('先頭に足し、同じものは先頭へ寄せる', () => {
    expect(pushUrlHistory(['a', 'b'], 'b')).toEqual(['b', 'a']);
    expect(pushUrlHistory(['a'], ' c ')).toEqual(['c', 'a']);
  });

  it('上限を超えたら古いものから手放し、空は足さない', () => {
    const full = Array.from({ length: URL_HISTORY_LIMIT }, (_, index) => `u${String(index)}`);
    expect(pushUrlHistory(full, 'new')).toHaveLength(URL_HISTORY_LIMIT);
    expect(pushUrlHistory(full, 'new').at(-1)).toBe(`u${String(URL_HISTORY_LIMIT - 2)}`);
    expect(pushUrlHistory(['a'], '  ')).toEqual(['a']);
  });

  it('残した値は文字だけを読み、重なりを落とす', () => {
    expect(normalizeUrlHistory(['a', 1, 'a', ' ', 'b'])).toEqual(['a', 'b']);
    expect(normalizeUrlHistory('a')).toEqual([]);
  });

  it('接続先は末尾の / の有無で別物にしない', () => {
    expect(trimBaseUrl(' http://127.0.0.1:8188/ ')).toBe('http://127.0.0.1:8188');
    expect(trimBaseUrl('https://example.com/comfy//')).toBe('https://example.com/comfy');
  });
});
