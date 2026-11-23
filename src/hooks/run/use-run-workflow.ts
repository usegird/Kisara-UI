import { useCallback, useState } from 'react';

import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { activeRunSource, submitRun, tabRunSource, type RunSource } from '@/store/run/run-submit';
import { useExecutionStore } from '@/store/use-execution-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useSettingsStore } from '@/store/use-settings-store';

interface RunWorkflow {
  readonly run: () => Promise<void>;
  readonly runTab: (tabId: string) => Promise<string | null>;
  readonly interrupt: (promptId: string) => Promise<void>;
  readonly cancelQueued: (promptId: string) => Promise<void>;
  readonly busy: boolean;
}

export function useRunWorkflow(): RunWorkflow {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const clientId = useSettingsStore((state) => state.clientId);
  const fail = useExecutionStore((state) => state.fail);
  const stop = useExecutionStore((state) => state.stop);
  const refreshQueue = useQueueStore((state) => state.refresh);

  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (source: RunSource | null): Promise<string | null> => {
      if (!source || baseUrl.length === 0 || clientId.length === 0) return null;
      setBusy(true);
      try {
        return await submitRun(source);
      } finally {
        setBusy(false);
      }
    },
    [baseUrl, clientId],
  );

  const run = useCallback(async () => {
    await submit(activeRunSource());
  }, [submit]);

  const runTab = useCallback((tabId: string) => submit(tabRunSource(tabId)), [submit]);

  const interrupt = useCallback(
    async (promptId: string) => {
      if (baseUrl.length === 0) return;
      try {
        await comfyPort().run.interrupt(baseUrl, promptId);
        if (useExecutionStore.getState().promptId === promptId) stop();
        await refreshQueue(baseUrl);
      } catch (error) {
        fail({ node: null, message: formatComfyFailure(error) });
      }
    },
    [baseUrl, fail, stop, refreshQueue],
  );

  const cancelQueued = useCallback(
    async (promptId: string) => {
      if (baseUrl.length === 0) return;
      try {
        await comfyPort().queue.deleteQueued(baseUrl, promptId);
        if (useExecutionStore.getState().promptId === promptId) stop();
        await refreshQueue(baseUrl);
      } catch (error) {
        fail({ node: null, message: formatComfyFailure(error) });
      }
    },
    [baseUrl, fail, stop, refreshQueue],
  );

  return { run, runTab, interrupt, cancelQueued, busy };
}
