import { afterEach, describe, expect, it, vi } from 'vitest';

import { HISTORY_LIMIT, queueChanged, queueIds, useQueueStore } from '@/store/use-queue-store';

import { queueEntry } from '../helpers/queue';

const snapshot = (running: string[], pending: string[]) => ({
  running: running.map((promptId) => queueEntry(promptId, null)),
  pending: pending.map((promptId) => queueEntry(promptId, null)),
});

describe('キューの見張り', () => {
  it('実行中から待機の順に並べる', () => {
    expect(queueIds(snapshot(['a'], ['b', 'c']))).toEqual(['a', 'b', 'c']);
  });

  it('同じ並びなら変わっていない', () => {
    expect(queueChanged(snapshot(['a'], ['b']), snapshot(['a'], ['b']))).toBe(false);
  });

  it('終わって消えた・積まれた・入れ替わったときは変わっている', () => {
    expect(queueChanged(snapshot(['a'], ['b']), snapshot(['b'], []))).toBe(true);
    expect(queueChanged(snapshot(['a'], []), snapshot(['a'], ['b']))).toBe(true);
    expect(queueChanged(snapshot([], ['a', 'b']), snapshot([], ['b', 'a']))).toBe(true);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useQueueStore.getState().clear();
});

describe('履歴の件数', () => {
  it('最初は全件を読み、以後は新しい方から決まった件数だけ読む', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        urls.push(url);
        const body = url.includes('/queue') ? { queue_running: [], queue_pending: [] } : {};
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      }),
    );
    const history = (): string[] => urls.filter((url) => url.includes('/history'));

    await useQueueStore.getState().refresh('http://127.0.0.1:8188');
    expect(history().at(-1)).toContain('offset=0');

    await useQueueStore.getState().refresh('http://127.0.0.1:8188');
    expect(history().at(-1)).toBe(
      `http://127.0.0.1:8188/history?max_items=${String(HISTORY_LIMIT)}`,
    );

    useQueueStore.getState().clear();
    urls.length = 0;
    await Promise.all([
      useQueueStore.getState().refresh('http://127.0.0.1:8188'),
      useQueueStore.getState().refresh('http://127.0.0.1:8188'),
    ]);
    expect(history().filter((url) => url.includes('offset='))).toHaveLength(1);

    useQueueStore.getState().clear();
    await useQueueStore.getState().refresh('http://127.0.0.1:8188');
    expect(history().at(-1)).toContain('offset=0');

    await useQueueStore.getState().refresh('http://127.0.0.1:8188', true);
    expect(history().at(-1)).toContain('offset=0');
  });
});

describe('取り直しを 1 本にまとめる', () => {
  it('取得中に来た依頼は重ねず、終わってから 1 回だけ取り直す', async () => {
    let active = 0;
    let most = 0;
    let queues = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        active += 1;
        most = Math.max(most, active);
        if (url.includes('/queue')) queues += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        const body = url.includes('/queue') ? { queue_running: [], queue_pending: [] } : {};
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    useQueueStore.getState().clear();
    const base = 'http://127.0.0.1:8188';
    const first = useQueueStore.getState().refresh(base);
    const later = [1, 2, 3].map(() => useQueueStore.getState().refresh(base));
    await Promise.all([first, ...later]);

    expect(most).toBe(2);
    expect(queues).toBe(2);
    expect(useQueueStore.getState().requestedAt).not.toBeNull();
  });
});
