import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '@/comfy/client';
import { probeReachability } from '@/comfy/health';

const BASE_URL = 'http://127.0.0.1:8188';

describe('到達確認', () => {
  it('中身を読まない要求（no-cors）を /features に送る', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(new Response(null, { status: 200 })));

    await expect(probeReachability(BASE_URL, { fetchImpl })).resolves.toBe('reachable');

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/features`);
    expect(init?.mode).toBe('no-cors');
  });

  it('要求が落ちれば届いていない', async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new TypeError('Failed to fetch'));

    await expect(probeReachability(BASE_URL, { fetchImpl })).resolves.toBe('unreachable');
  });

  it('時間内に決着しなければ不明', async () => {
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
      });

    await expect(probeReachability(BASE_URL, { fetchImpl, timeoutMs: 5 })).resolves.toBe('unknown');
  });
});
