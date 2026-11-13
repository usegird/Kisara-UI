import { describe, expect, it } from 'vitest';

import { wildcardListUrl } from '@/comfy/endpoints';
import { parseWildcardList } from '@/comfy/schema';

// ─────────────────────────────
// ワイルドカードの一覧。本体ではなく Impact Pack の経路。
// 形が違えば「使えない」として null にする。
// ─────────────────────────────

describe('ワイルドカードの一覧', () => {
  it('Impact Pack の経路を組み立てる', () => {
    expect(wildcardListUrl('http://127.0.0.1:8188/')).toBe(
      'http://127.0.0.1:8188/impact/wildcards/list',
    );
  });

  it('名前の並びを読み、文字でない項目は捨てる', () => {
    expect(parseWildcardList({ data: ['__a__', 3, '', '__b/c__'] })).toEqual(['__a__', '__b/c__']);
  });

  it('形が違えば null', () => {
    expect(parseWildcardList(['__a__'])).toBeNull();
    expect(parseWildcardList({ data: 'x' })).toBeNull();
  });
});
