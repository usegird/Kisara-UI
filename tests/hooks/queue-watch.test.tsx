// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useQueueWatch, WATCH_INTERVAL_MS } from '@/hooks/run/use-queue-watch';
import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useSettingsStore } from '@/store/use-settings-store';

const ORIGINAL = { poll: useQueueStore.getState().poll, refresh: useQueueStore.getState().refresh };

let poll: ReturnType<typeof vi.fn<(baseUrl: string) => Promise<boolean>>>;

beforeEach(() => {
  vi.useFakeTimers();
  poll = vi.fn(() => Promise.resolve(false));
  useSettingsStore.setState({ baseUrl: 'http://127.0.0.1:8188' });
  useQueueStore.setState({ poll, refresh: () => Promise.resolve() });
  useConnectionStore.setState({
    status: 'connected',
    socketStatus: 'open',
    socketTimeout: null,
    socketSuspicion: 0,
  });
  useExecutionStore.setState({ status: 'running' });
});

afterEach(() => {
  vi.useRealTimers();
  useQueueStore.setState(ORIGINAL);
  useConnectionStore.getState().reset();
  useExecutionStore.getState().reset();
});

async function tick(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(WATCH_INTERVAL_MS);
  });
}

describe('実行中の見張り', () => {
  it('取れなければ通知の口を疑う。取れれば疑わない', async () => {
    renderHook(() => useQueueWatch());

    await tick();
    expect(useConnectionStore.getState().socketSuspicion).toBe(1);

    poll.mockImplementation(() => Promise.resolve(true));
    await tick();
    expect(useConnectionStore.getState().socketSuspicion).toBe(1);
  });

  it('通知を諦めたら（タイムアウト）問い合わせない', async () => {
    useConnectionStore.setState({ socketStatus: 'closed', socketTimeout: 'retries' });
    renderHook(() => useQueueWatch());

    await tick();
    expect(poll).not.toHaveBeenCalled();
  });
});
