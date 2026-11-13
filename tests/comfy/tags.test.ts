import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '@/comfy/client';
import {
  fetchPysssssOverrides,
  fetchPysssssTags,
  fetchTagDictionaries,
  removeTagDictionary,
  savePysssssOverrides,
  saveTagDictionary,
} from '@/comfy/tags';

import { tagEntry } from '../helpers/tags';

// ─────────────────────────────
// タグ辞書の読み書き。pysssss の一覧は読むだけ、書くのは `kisara/tags/` の辞書と消したタグ。
// ─────────────────────────────

const base = 'http://127.0.0.1:8188';
const dir = `${base}/userdata/kisara%2Ftags%2F`;

function notFound(): Promise<Response> {
  return Promise.resolve(new Response('', { status: 404 }));
}

function ok(body = ''): Promise<Response> {
  return Promise.resolve(new Response(body, { status: 200 }));
}

describe('pysssss の一覧', () => {
  it('経路の一覧を読み、無ければ null', async () => {
    const found = vi.fn<FetchLike>(() => ok('long_hair,10\n'));
    const tags = await fetchPysssssTags(base, { fetchImpl: found });
    expect(tags?.[0]?.tag).toBe('long_hair');
    expect(String(found.mock.calls[0]?.[0])).toBe(`${base}/pysssss/autocomplete`);

    await expect(fetchPysssssTags(base, { fetchImpl: vi.fn<FetchLike>(notFound) })).resolves.toBe(
      null,
    );
  });
});

describe('kisara/tags', () => {
  it('直下の .csv だけをファイル名の順に読み、名前の退避を戻す', async () => {
    const fetchImpl = vi.fn<FetchLike>((input) => {
      const url = String(input);
      if (url.includes('?dir=')) {
        return Promise.resolve(
          Response.json(['b.csv', 'override/pysssss.csv', 'sub/c.csv', { path: 'a~3Ab.csv' }]),
        );
      }
      return ok(url.startsWith(`${dir}b.csv`) ? 'x,1\n' : 'y,2\nz,3\n');
    });

    const dictionaries = await fetchTagDictionaries(base, { fetchImpl });

    expect(dictionaries.map((dictionary) => dictionary.name)).toEqual(['a:b', 'b']);
    expect(dictionaries[0]?.entries).toHaveLength(2);
  });

  it('置き場も pysssss の上書きも無ければ空', async () => {
    const fetchImpl = vi.fn<FetchLike>(notFound);
    await expect(fetchTagDictionaries(base, { fetchImpl })).resolves.toEqual([]);
    await expect(fetchPysssssOverrides(base, { fetchImpl })).resolves.toEqual([]);
  });

  it('辞書は上書きの指定を渡して丸ごと書き、pysssss の上書きは同じ形で別のフォルダに書く', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => ok());
    await saveTagDictionary(base, { name: 'Mine', entries: [tagEntry('a', 1)] }, false, {
      fetchImpl,
    });
    await savePysssssOverrides(base, [tagEntry('cat', 2)], { fetchImpl });

    const [first, second] = fetchImpl.mock.calls;
    expect(String(first?.[0])).toBe(`${dir}Mine.csv?overwrite=false`);
    expect(first?.[1]?.body).toBe('a,0,1,\n');
    expect(String(second?.[0])).toBe(`${dir}override%2Fpysssss.csv?overwrite=true`);
    expect(second?.[1]?.body).toBe('cat,0,2,\n');
  });

  it('辞書を消す。無ければ済み', async () => {
    const fetchImpl = vi.fn<FetchLike>(notFound);
    await expect(removeTagDictionary(base, 'Mine', { fetchImpl })).resolves.toBeUndefined();
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });
});
