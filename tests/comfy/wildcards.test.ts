import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '@/comfy/client';
import { wildcardListUrl } from '@/comfy/endpoints';
import { parseWildcardList } from '@/comfy/schema';
import { fetchWildcardEntries } from '@/comfy/wildcards';

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

describe('ワイルドカードの中身', () => {
  const base = 'http://127.0.0.1:8188';

  it('全部を選ぶ展開の書式を送り、返った候補を名前順に並べる', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response(JSON.stringify({ text: 'red␞ blue ␞␞red' })));

    const entries = await fetchWildcardEntries(base, '__color/warm__', { fetchImpl });

    expect(entries).toEqual(['blue', 'red', 'red']);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(`${base}/impact/wildcards`);
    const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
    expect(body).toEqual({ text: '{9999$$␞$$__color/warm__}' });
  });

  it('経路が無い（404）なら null', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('', { status: 404 }));
    expect(await fetchWildcardEntries(base, '__a__', { fetchImpl })).toBeNull();
  });

  it('形が違えば失敗にする', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('{"data":1}'));
    await expect(fetchWildcardEntries(base, '__a__', { fetchImpl })).rejects.toThrow();
  });
});
