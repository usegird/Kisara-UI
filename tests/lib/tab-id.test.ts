// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { claimTabId } from '@/lib/tab-id';

// ─────────────────────────────
// タブごとの識別子。複製したタブとは分ける
// ─────────────────────────────

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

/** Web Locks の代わり。`held` にある名前の鍵は取れない */
function stubLocks(held: ReadonlySet<string>): void {
  vi.stubGlobal('navigator', {
    locks: {
      request: (name: string, _options: unknown, callback: (lock: object | null) => unknown) => {
        void callback(held.has(name) ? null : {});
        return Promise.resolve();
      },
    },
  });
}

describe('claimTabId', () => {
  it('保存してあればそれを使い、無ければ作って保存する', async () => {
    stubLocks(new Set());
    expect(await claimTabId('k', () => 'made')).toBe('made');
    expect(await claimTabId('k', () => 'other')).toBe('made');
  });

  it('ほかのタブが同じ値を使っていれば作り直す（複製したタブ）', async () => {
    sessionStorage.setItem('k', 'copied');
    stubLocks(new Set(['k:copied']));

    expect(await claimTabId('k', () => 'fresh')).toBe('fresh');
    expect(sessionStorage.getItem('k')).toBe('fresh');
  });
});
