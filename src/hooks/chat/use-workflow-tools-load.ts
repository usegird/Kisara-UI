import { useEffect } from 'react';

import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useWorkflowToolsStore } from '@/store/use-workflow-tools-store';

export function useWorkflowToolsLoad(): void {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const connected = useConnectionStore((state) => state.status === 'connected');
  const ready = useDefinitionsStore((state) => state.definitions.size > 0);
  const loadedFor = useWorkflowToolsStore((state) => state.loadedFor);

  useEffect(() => {
    if (connected && ready && baseUrl.length > 0 && loadedFor !== baseUrl) {
      void useWorkflowToolsStore.getState().refresh(baseUrl);
    }
  }, [baseUrl, connected, ready, loadedFor]);
}
