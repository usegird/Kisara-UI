import { afterEach, describe, expect, it, vi } from 'vitest';

import { yieldToMain } from '@/lib/yield-to-main';

afterEach(() => vi.unstubAllGlobals());

describe('ブラウザへ処理を返す', () => {
  it('scheduler.yield があればそれを使う', async () => {
    const yieldFn = vi.fn(() => Promise.resolve());
    vi.stubGlobal('scheduler', { yield: yieldFn });
    await yieldToMain();
    expect(yieldFn).toHaveBeenCalledTimes(1);
  });

  it('無ければ次の task まで待つ', async () => {
    vi.stubGlobal('scheduler', undefined);
    let done = false;
    const waiting = yieldToMain().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    await waiting;
    expect(done).toBe(true);
  });
});
