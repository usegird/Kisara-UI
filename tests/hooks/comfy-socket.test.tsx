// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FULL_REFRESH_GAP_MS, useComfySocket } from '@/hooks/comfy/use-comfy-socket';
import type { SocketStatus } from '@/port/connection';
import { useQueueStore } from '@/store/use-queue-store';

const statuses = vi.hoisted(() => ({ notify: (_status: SocketStatus): void => {} }));
vi.mock('@/comfy/ws', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/ws')>()),
  connectComfySocket: (options: { onStatus: (status: SocketStatus) => void }) => {
    statuses.notify = options.onStatus;
    return { status: () => 'open', suspect: () => {}, close: () => {} };
  },
}));

const ORIGINAL_REFRESH = useQueueStore.getState().refresh;

afterEach(() => {
  cleanup();
  useQueueStore.setState({ refresh: ORIGINAL_REFRESH });
});

describe('通知の口', () => {
  it('最初は取り直さず、張り直して開いたら取り直す。全件は間を置いてから', () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(() => Promise.resolve());
      useQueueStore.setState({ refresh });
      renderHook(() => useComfySocket('http://comfy.test', 'client', true));

      statuses.notify('open');
      expect(refresh).not.toHaveBeenCalled();

      statuses.notify('reconnecting');
      statuses.notify('open');
      expect(refresh).toHaveBeenLastCalledWith('http://comfy.test', false);

      vi.advanceTimersByTime(FULL_REFRESH_GAP_MS);
      statuses.notify('reconnecting');
      statuses.notify('open');
      expect(refresh).toHaveBeenLastCalledWith('http://comfy.test', true);
    } finally {
      vi.useRealTimers();
    }
  });
});
