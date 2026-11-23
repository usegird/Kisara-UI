import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '@/comfy/client';
import { listUserFiles, readUserFile, removeUserFile } from '@/comfy/user-files';

const base = 'http://127.0.0.1:8188';

function respond(body: string, status = 200) {
  return vi.fn<FetchLike>(() => Promise.resolve(new Response(body, { status })));
}

describe('ユーザーフォルダの物', () => {
  it('一覧は full_info の大きさと時刻を読み、秒の時刻はミリ秒にする', async () => {
    const fetchImpl = respond(
      JSON.stringify([
        { path: 'checkpoints\\a.txt', size: 12, modified: 1_700_000_000.5 },
        { path: 'b.txt', size: 3, modified: 1_700_000_000_000 },
      ]),
    );
    const files = await listUserFiles(base, 'notes', { fetchImpl });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('dir=kisara%2Fnotes');
    expect(files).toEqual([
      { path: 'checkpoints/a.txt', bytes: 12, modified: 1_700_000_000_500 },
      { path: 'b.txt', bytes: 3, modified: 1_700_000_000_000 },
    ]);
  });

  it('フォルダが無ければ空。無いファイルは null', async () => {
    expect(await listUserFiles(base, 'history', { fetchImpl: respond('', 404) })).toEqual([]);
    expect(await readUserFile(base, 'styles', 'a.json', { fetchImpl: respond('', 404) })).toBe(
      null,
    );
  });

  it('タグ辞書は kisara/tags の辞書と消したタグのファイルを消す', async () => {
    const fetchImpl = respond('');
    await removeUserFile(base, 'tags', 'KisaraUI.csv', { fetchImpl });
    await removeUserFile(base, 'tags', 'hidden.txt', { fetchImpl });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `${base}/userdata/kisara%2Ftags%2FKisaraUI.csv`,
      `${base}/userdata/kisara%2Ftags%2Fhidden.txt`,
    ]);
  });

  it('消すのはその種類のフォルダの 1 つだけ。外へ出る経路は送らない', async () => {
    const fetchImpl = respond('', 404);
    await removeUserFile(base, 'history', 'session-1.json', { fetchImpl });
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [`${base}/userdata/kisara%2Fhistory%2Fsession-1.json`, 'DELETE'],
    ]);
    for (const path of ['../x.json', '/x.json', 'a//b.txt', '']) {
      await expect(removeUserFile(base, 'notes', path, { fetchImpl })).rejects.toThrow();
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
