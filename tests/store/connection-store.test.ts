import { afterEach, describe, expect, it, vi } from 'vitest';

import { useConnectionStore } from '@/store/use-connection-store';

// ─────────────────────────────
// 疎通確認の失敗を、CORS 拒否／未起動／HTTP エラーに切り分けて残すこと。
// 1 回目が通常の要求、2 回目が中身を読まない到達確認。
// ─────────────────────────────

const BASE_URL = 'http://127.0.0.1:8188';

function stubFetch(...results: Array<() => Promise<Response>>): void {
  let call = 0;
  vi.stubGlobal('fetch', () => {
    const next = results[Math.min(call, results.length - 1)];
    call += 1;
    return next === undefined ? Promise.reject(new Error('no stub')) : next();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  useConnectionStore.getState().reset();
});

describe('接続ストアの原因切り分け', () => {
  it('通常の要求は落ちるが到達確認は通る → CORS 拒否', async () => {
    stubFetch(
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => Promise.resolve(new Response(null, { status: 200 })),
    );

    await expect(useConnectionStore.getState().probe(BASE_URL)).resolves.toBe(false);
    expect(useConnectionStore.getState().diagnosis?.code).toBe('cors');
  });

  it('到達確認も落ちる → 未起動', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    await useConnectionStore.getState().probe(BASE_URL);
    expect(useConnectionStore.getState().diagnosis?.code).toBe('down');
  });

  it('HTTP エラーは番号つきで残し、到達確認はしない', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('{}', { status: 502 })));
    vi.stubGlobal('fetch', fetchImpl);

    await useConnectionStore.getState().probe(BASE_URL);

    const diagnosis = useConnectionStore.getState().diagnosis;
    expect(diagnosis?.code).toBe('http-error');
    expect(diagnosis?.status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
