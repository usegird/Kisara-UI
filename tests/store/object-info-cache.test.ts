import { describe, expect, it } from 'vitest';

import { createMemoryCache, forgetDefinitionsOf } from '@/store/persist/object-info-cache';

import { loadDefinitions } from '../helpers/fixtures';

// ─────────────────────────────
// 接続先の履歴の × で、その接続先のノード定義の控えも消す
// ─────────────────────────────

describe('履歴から外した接続先の控え', () => {
  it('ほかに同じ相手が無ければ消し、今の接続先・残る履歴と同じ相手なら残す', async () => {
    const cache = createMemoryCache();
    await cache.save('http://a:8188', loadDefinitions(), 1, []);
    await cache.save('http://b:8188', loadDefinitions(), 1, []);

    await forgetDefinitionsOf('http://a:8188', ['http://b:8188'], () => cache);
    await forgetDefinitionsOf('http://b:8188/', ['https://b:8188'], () => cache);

    expect(await cache.load('http://a:8188')).toBeNull();
    expect(await cache.load('http://b:8188')).not.toBeNull();
  });
});
