import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '@/comfy/client';
import { fetchSavedNotes, listSavedNotes, saveNotes } from '@/comfy/notes';

// ─────────────────────────────
// `kisara/notes/` のメモ。書くのは `/userdata` だけで、上書きを必ず指定する。
// ─────────────────────────────

const base = 'http://127.0.0.1:8188';

describe('メモの読み書き', () => {
  it('kisara/notes へ上書きの指定つきで、本文を生のまま書く', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('', { status: 200 }));

    await saveNotes(
      base,
      { folder: 'loras', filename: 'sub/a.safetensors', text: 'x\ny' },
      { fetchImpl },
    );

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(
      `${base}/userdata/kisara%2Fnotes%2Floras%2Fsub%2Fa.safetensors.txt?overwrite=true`,
    );
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('x\ny');
  });

  it('名前の % は 2 回符号化し、接続先が 2 回ほどいても元の名前に戻る', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('', { status: 200 }));

    await saveNotes(
      base,
      { folder: 'loras', filename: 'a%20b.safetensors', text: '' },
      { fetchImpl },
    );

    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('a%252520b.safetensors.txt');
  });

  it('無い（404）は null', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('', { status: 404 }));

    await expect(fetchSavedNotes(base, 'loras', 'a.safetensors', { fetchImpl })).resolves.toBe(
      null,
    );
  });

  it('一覧は区切りを / に揃え、置き場が無ければ空', async () => {
    const listed = vi
      .fn<FetchLike>()
      .mockResolvedValue(Response.json([{ path: 'loras\\a.safetensors.txt' }, 'loras/b.txt']));
    const missing = vi.fn<FetchLike>().mockResolvedValue(new Response('', { status: 404 }));

    expect([...(await listSavedNotes(base, { fetchImpl: listed }))]).toEqual([
      'loras/a.safetensors.txt',
      'loras/b.txt',
    ]);
    expect((await listSavedNotes(base, { fetchImpl: missing })).size).toBe(0);
  });
});
