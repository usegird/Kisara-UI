import { useEffect } from 'react';

import { hasRunInFlight } from '@/queue/execution-state';
import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useSettingsStore } from '@/store/use-settings-store';

export const WATCH_INTERVAL_MS = 5_000;

export function useQueueWatch(): void {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const connected = useConnectionStore((state) => state.status === 'connected');
  const socketStatus = useConnectionStore((state) => state.socketStatus);
  const timedOut = useConnectionStore((state) => state.socketTimeout !== null);
  const suspectSocket = useConnectionStore((state) => state.suspectSocket);

  const refresh = useQueueStore((state) => state.refresh);
  const poll = useQueueStore((state) => state.poll);
  const running = useQueueStore((state) => state.running);
  const pending = useQueueStore((state) => state.pending);
  const history = useQueueStore((state) => state.history);
  const fetchedAt = useQueueStore((state) => state.fetchedAt);
  const requestedAt = useQueueStore((state) => state.requestedAt);

  const status = useExecutionStore((state) => state.status);
  const queueRemaining = useExecutionStore((state) => state.queueRemaining);
  const reconcile = useExecutionStore((state) => state.reconcile);

  useEffect(() => {
    if (!connected) return;
    void refresh(baseUrl);
  }, [connected, baseUrl, refresh, status, queueRemaining, socketStatus]);

  const inFlight = hasRunInFlight(status, running.length + pending.length);

  useEffect(() => {
    if (!connected || !inFlight || timedOut) return;

    const tick = async (): Promise<void> => {
      if (!(await poll(baseUrl))) suspectSocket();
    };
    const timer = setInterval(() => void tick(), WATCH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [connected, inFlight, timedOut, baseUrl, poll, suspectSocket]);

  useEffect(() => {
    if (fetchedAt === null) return;

    reconcile({
      active: [...running, ...pending].map((entry) => entry.promptId),
      finished: history,
      requestedAt: requestedAt ?? fetchedAt,
    });
  }, [fetchedAt, requestedAt, running, pending, history, reconcile]);
}
