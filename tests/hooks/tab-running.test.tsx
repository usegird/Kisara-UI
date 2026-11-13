// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useTabRunning } from '@/hooks/run/use-tab-running';
import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useTabsStore } from '@/store/use-tabs-store';

import { queueEntry } from '../helpers/queue';

// ─────────────────────────────
// 上の帯のタブに回るアイコンを出すのは、そのタブから投げたタスクが実行中の間だけ。
// ─────────────────────────────

const initialTabs = useTabsStore.getState();
const initialQueue = useQueueStore.getState();
const initialExecution = useExecutionStore.getState();

beforeEach(() => {
  useTabsStore.setState({
    tabs: [
      { id: 'a', kind: 'workflow', runSession: 'sa' },
      { id: 'b', kind: 'workflow', runSession: 'sb' },
    ],
    activeId: 'a',
  });
  useConnectionStore.setState({ socketTimeout: null });
});

afterEach(() => {
  cleanup();
  useTabsStore.setState(initialTabs, true);
  useQueueStore.setState(initialQueue, true);
  useExecutionStore.setState(initialExecution, true);
});

describe('タブごとの実行中', () => {
  it('実行中のタスクを投げたセッションのタブだけが実行中になる', () => {
    useQueueStore.setState({ running: [queueEntry('p1', 1, null, 'sb')], pending: [] });

    expect(renderHook(() => useTabRunning('a')).result.current).toBe(false);
    expect(renderHook(() => useTabRunning('b')).result.current).toBe(true);
  });

  it('手元の実行はキューの待ちに居る間もそのセッションで見分ける', () => {
    useQueueStore.setState({ running: [], pending: [queueEntry('p2', 2, null, 'sa')] });
    useExecutionStore.setState({ status: 'running', promptId: 'p2' });

    expect(renderHook(() => useTabRunning('a')).result.current).toBe(true);
    expect(renderHook(() => useTabRunning('b')).result.current).toBe(false);
  });

  it('通知がタイムアウトしたら回さない', () => {
    useQueueStore.setState({ running: [queueEntry('p1', 1, null, 'sa')], pending: [] });
    useConnectionStore.setState({ socketTimeout: 'retries' });

    expect(renderHook(() => useTabRunning('a')).result.current).toBe(false);
  });
});
