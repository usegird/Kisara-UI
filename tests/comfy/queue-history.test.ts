import { describe, expect, it } from 'vitest';

import { fetchHistory, HISTORY_PAGE_SIZE } from '@/comfy/queue';

function entries(from: number, count: number): Record<string, unknown> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, at) => [`p${String(from + at)}`, { outputs: {} }]),
  );
}

function fakeFetch(answer: (url: URL) => unknown): { urls: URL[]; fetchImpl: typeof fetch } {
  const urls: URL[] = [];
  const fetchImpl = ((input: string) => {
    const url = new URL(input);
    urls.push(url);
    return Promise.resolve(Response.json(answer(url)));
  }) as typeof fetch;
  return { urls, fetchImpl };
}

describe('履歴を全件読む', () => {
  it('古い方から決めた件数ずつ offset をずらし、足りない回で止めてまとめる', async () => {
    const total = HISTORY_PAGE_SIZE * 2 + 5;
    const { urls, fetchImpl } = fakeFetch((url) => {
      const offset = Number(url.searchParams.get('offset'));
      const size = Number(url.searchParams.get('max_items'));
      return entries(offset, Math.max(0, Math.min(size, total - offset)));
    });
    const result = await fetchHistory('http://x', undefined, { fetchImpl });
    expect(urls.map((url) => url.searchParams.get('offset'))).toEqual(['0', '100', '200']);
    expect(Object.keys(result.raw)).toHaveLength(total);
  });

  it('offset を知らない接続先が同じ分を返したら、そこで止める', async () => {
    const { urls, fetchImpl } = fakeFetch(() => entries(0, HISTORY_PAGE_SIZE));
    const result = await fetchHistory('http://x', undefined, { fetchImpl });
    expect(urls).toHaveLength(2);
    expect(Object.keys(result.raw)).toHaveLength(HISTORY_PAGE_SIZE);
  });

  it('件数を指定したら 1 回で新しいものから取る', async () => {
    const { urls, fetchImpl } = fakeFetch(() => entries(0, 3));
    await fetchHistory('http://x', 20, { fetchImpl });
    expect(urls).toHaveLength(1);
    expect(urls[0]?.searchParams.get('offset')).toBeNull();
  });
});
