import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useTabsStore } from '@/store/use-tabs-store';

export function useTabRunning(tabId: string): boolean {
  const session = useTabsStore(
    (state) => state.tabs.find((tab) => tab.id === tabId)?.runSession ?? null,
  );
  const localId = useExecutionStore((state) =>
    state.status === 'running' ? state.promptId : null,
  );
  const running = useQueueStore((state) => {
    if (session === null) return false;
    if (state.running.some((entry) => entry.session === session)) return true;
    if (localId === null) return false;
    const local = [...state.running, ...state.pending].find((entry) => entry.promptId === localId);
    return local?.session === session;
  });
  const timedOut = useConnectionStore((state) => state.socketTimeout !== null);
  return !timedOut && running;
}
