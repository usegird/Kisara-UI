import { useEffect } from 'react';

import { CHECKPOINT_FOLDER, DIFFUSION_MODEL_FOLDER, LORA_FOLDER } from '@/graph/model-files';
import { useConnectionStore } from '@/store/use-connection-store';
import { useModelFilesStore } from '@/store/use-model-files-store';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { activeSession, useTabsStore } from '@/store/use-tabs-store';

export function useRunHistoryLoad(): void {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const connected = useConnectionStore((state) => state.status === 'connected');
  const load = useRunHistoryStore((state) => state.load);
  const ensureModels = useModelFilesStore((state) => state.ensure);

  useEffect(() => {
    if (!connected) return;
    void load(baseUrl);
    for (const folder of [LORA_FOLDER, CHECKPOINT_FOLDER, DIFFUSION_MODEL_FOLDER]) {
      void ensureModels(baseUrl, folder);
    }
  }, [connected, baseUrl, load, ensureModels]);

  const session = useTabsStore(activeSession);
  const loadSession = useRunHistoryStore((state) => state.loadSession);
  useEffect(() => {
    if (!connected) return;
    void loadSession(baseUrl);
  }, [connected, baseUrl, session, loadSession]);
}
