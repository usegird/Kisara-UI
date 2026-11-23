import { useCallback, useState } from 'react';

import { t } from '@/i18n';
import { pngOutputsOf } from '@/queue/outputs';
import type { HistoryRun } from '@/queue/run-history-view';
import { openWorkflow } from '@/store/persist/workflow-file';
import { comfyPort } from '@/store/ports/comfy-port';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

interface OpenRunWorkflow {
  readonly open: (run: HistoryRun) => Promise<void>;
  readonly opening: boolean;
  readonly error: string | null;
  readonly clearError: () => void;
}

export function useOpenRunWorkflow(): OpenRunWorkflow {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(
    async (run: HistoryRun): Promise<void> => {
      setOpening(true);
      setError(null);
      try {
        for (const file of pngOutputsOf(run.outputs)) {
          const workflow = await comfyPort()
            .queue.fetchWorkflowFromImage(baseUrl, file)
            .catch(() => null);
          if (workflow === null) continue;
          useTabsStore.getState().prepareOpen();
          try {
            openWorkflow(workflow, run.entry.name ?? t('history.card.unnamed'));
            return;
          } catch {
          }
        }
        setError(t('history.detail.openFailed'));
      } finally {
        setOpening(false);
      }
    },
    [baseUrl],
  );

  const clearError = useCallback(() => setError(null), []);
  return { open, opening, error, clearError };
}
