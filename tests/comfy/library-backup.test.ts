import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '@/comfy/client';
import { removeLibraryItem, saveLibraryItem } from '@/comfy/library-backup';

// ─────────────────────────────
// プリセットとテンプレートの控え。`kisara/` の下にだけ書き・消す。
// ─────────────────────────────

const base = 'http://127.0.0.1:8188';

function okFetch() {
  return vi.fn<FetchLike>(() => Promise.resolve(new Response('', { status: 200 })));
}

describe('控えのファイル', () => {
  it('プリセットは画像を書いてから本文を、上書きの指定つきで書く', async () => {
    const fetchImpl = okFetch();
    const image = new Blob(['png'], { type: 'image/png' });
    await saveLibraryItem(base, { kind: 'presets', id: 'abc1', body: '{}', image }, { fetchImpl });
    const calls = fetchImpl.mock.calls;
    expect(calls.map(([url]) => url)).toEqual([
      `${base}/userdata/kisara%2Fpresets%2Fabc1.png?overwrite=true`,
      `${base}/userdata/kisara%2Fpresets%2Fabc1.json?overwrite=true`,
    ]);
    expect(calls[0]?.[1]?.body).toBe(image);
    expect(calls[1]?.[1]?.body).toBe('{}');
  });

  it('テンプレートは kisara/system-prompts に本文だけを書く', async () => {
    const fetchImpl = okFetch();
    await saveLibraryItem(
      base,
      { kind: 'system-prompts', id: 'x9', body: '{"v":1}', image: null },
      { fetchImpl },
    );
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `${base}/userdata/kisara%2Fsystem-prompts%2Fx9.json?overwrite=true`,
    ]);
  });

  it('消すのは本文と画像の 2 つ。無いものは済みとする', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(new Response('', { status: 404 })));
    await removeLibraryItem(base, 'presets', 'abc1', { fetchImpl });
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(['DELETE', 'DELETE']);
  });

  it('英小文字と数字でない id は書かない（ほかのフォルダへ出ない）', async () => {
    const fetchImpl = okFetch();
    await expect(
      saveLibraryItem(
        base,
        { kind: 'presets', id: '../x', body: '{}', image: null },
        { fetchImpl },
      ),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
