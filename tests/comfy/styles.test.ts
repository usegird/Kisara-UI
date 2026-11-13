import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '@/comfy/client';
import { fetchSavedStyles, fetchStyleTable, saveStyle } from '@/comfy/styles';

// ─────────────────────────────
// スタイルの読み書き。`styles.csv` は読むだけ、書くのは `kisara/styles/` の 1 件。
// ─────────────────────────────

const base = 'http://127.0.0.1:8188';
const dir = `${base}/userdata/kisara%2Fstyles%2F`;

describe('kisara/styles', () => {
  it('全件を経路の名前順に読み、形の合わない・JSON でないファイルは外す', async () => {
    const fetchImpl = vi.fn<FetchLike>((input) => {
      const url = String(input);
      if (url.includes('?dir=')) {
        return Promise.resolve(
          Response.json([{ path: 'b.json' }, { path: 'a.json' }, { path: 'c.json' }, 'x.txt']),
        );
      }
      if (url.startsWith(`${dir}a.json`)) {
        return Promise.resolve(Response.json({ v: 1, name: 'A', prompt: 'p', negative: '' }));
      }
      if (url.startsWith(`${dir}b.json`)) {
        return Promise.resolve(Response.json({ v: 1, name: 'b', deleted: true }));
      }
      return Promise.resolve(new Response('{', { status: 200 }));
    });

    const saved = await fetchSavedStyles(base, { fetchImpl });

    expect(saved.map((entry) => entry.deleted)).toEqual([false, true]);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('x.txt'))).toBe(false);
  });

  it('置き場が無ければ空', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('', { status: 404 }));

    await expect(fetchSavedStyles(base, { fetchImpl })).resolves.toEqual([]);
  });

  it('1 件を小文字の名前のファイルへ、上書きの指定つきで書く。消した印も同じファイル', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(new Response('', { status: 200 })));
    const style = { name: 'Anime', prompt: 'p', negative: '', other: {} };

    await saveStyle(base, { deleted: false, style }, { fetchImpl });
    await saveStyle(base, { deleted: true, name: 'ANIME' }, { fetchImpl });

    const urls = fetchImpl.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual([`${dir}anime.json?overwrite=true`, `${dir}anime.json?overwrite=true`]);
  });
});

describe('styles.csv', () => {
  it('無ければ空の表（置いていないだけで失敗ではない）', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('', { status: 404 }));

    await expect(fetchStyleTable(base, { fetchImpl })).resolves.toEqual({ styles: [] });
  });
});
