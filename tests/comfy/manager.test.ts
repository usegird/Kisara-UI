import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '@/comfy/client';
import { fetchManagerVersion, installNodePack, rebootComfy } from '@/comfy/manager';
import { parseComfyEvent } from '@/comfy/schema-event';
import { parseManagerQueueStatus, parseNodePackMappings } from '@/comfy/schema-manager';

const BASE = 'http://127.0.0.1:8188';

function bodiesOf(fetchImpl: ReturnType<typeof vi.fn<FetchLike>>): unknown[] {
  return fetchImpl.mock.calls.map(([, init]) =>
    typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
  );
}

describe('Manager の有無', () => {
  it('版の文字を返し、404 なら null', async () => {
    const found = vi.fn<FetchLike>().mockResolvedValue(new Response('V3.42\n'));
    expect(await fetchManagerVersion(BASE, { fetchImpl: found })).toBe('V3.42');
    const missing = vi.fn<FetchLike>().mockResolvedValue(new Response('', { status: 404 }));
    expect(await fetchManagerVersion(BASE, { fetchImpl: missing })).toBeNull();
  });
});

describe('パックの導入', () => {
  it('Registry のパックは最新の版で積み、待ち行列を動かす', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockImplementation(() => Promise.resolve(new Response('')));
    await installNodePack(BASE, { key: 'comfyui-kjnodes', registry: true }, { fetchImpl });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `${BASE}/manager/queue/install`,
      `${BASE}/manager/queue/start`,
    ]);
    expect(bodiesOf(fetchImpl)[0]).toMatchObject({
      id: 'comfyui-kjnodes',
      selected_version: 'latest',
      ui_id: 'comfyui-kjnodes',
    });
  });

  it('git の URL のパックは版を持たず、URL を files に入れる', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockImplementation(() => Promise.resolve(new Response('')));
    await installNodePack(BASE, { key: 'https://github.com/a/b', registry: false }, { fetchImpl });
    expect(bodiesOf(fetchImpl)[0]).toMatchObject({
      version: 'unknown',
      files: ['https://github.com/a/b'],
    });
  });

  it('断られたら積んだ後の待ち行列を動かさない', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('', { status: 403 }));
    await expect(
      installNodePack(BASE, { key: 'x', registry: true }, { fetchImpl }),
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('再起動', () => {
  it('応答の前に切れたら起動し直した印として成功にし、断られたら失敗にする', async () => {
    const dropped = vi.fn<FetchLike>().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(rebootComfy(BASE, { fetchImpl: dropped })).resolves.toBeUndefined();
    const refused = vi.fn<FetchLike>().mockResolvedValue(new Response('', { status: 403 }));
    await expect(rebootComfy(BASE, { fetchImpl: refused })).rejects.toThrow();
  });
});

describe('Manager の応答の検証', () => {
  it('対応表の形の違う項目は外し、題が無ければ鍵を使う', () => {
    const mappings = parseNodePackMappings({
      a: [['N1', 2], { title_aux: 'A', nodename_pattern: '^N' }],
      b: [['N2']],
      c: 'bad',
    });
    expect(mappings.map((entry) => [entry.key, entry.title, entry.nodes, entry.pattern])).toEqual([
      ['a', 'A', ['N1'], '^N'],
      ['b', 'b', ['N2'], null],
    ]);
  });

  it('導入の終わりの通知を読み、知らない段階は捨てる', () => {
    const done = parseManagerQueueStatus({
      status: 'done',
      nodepack_result: { a: 'success', b: 1 },
    });
    expect(done?.results).toEqual({ a: 'success' });
    expect(parseManagerQueueStatus({ status: 'other' })).toBeNull();
  });

  it('通知の口では Manager の通知を実行の通知と分ける', () => {
    const raw = JSON.stringify({
      type: 'cm-queue-status',
      data: { status: 'in_progress', target: 'a' },
    });
    expect(parseComfyEvent(raw)).toMatchObject({ type: 'manager_queue', target: 'a' });
  });
});
