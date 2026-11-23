import { useEffect } from 'react';

import {
  missingModels,
  modelDirectories,
  workflowModels,
  type WorkflowModel,
} from '@/graph/missing-models';
import { useConnectionStore } from '@/store/use-connection-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useModelFilesStore } from '@/store/use-model-files-store';
import { useSettingsStore } from '@/store/use-settings-store';

export function useMissingModels(enabled: boolean): WorkflowModel[] {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const connected = useConnectionStore((state) => state.status === 'connected');
  const workflow = useGraphStore((state) => state.workflow);
  const folders = useModelFilesStore((state) => state.folders);
  const ensure = useModelFilesStore((state) => state.ensure);

  const active = enabled && connected && workflow !== null;
  const models = active ? workflowModels(workflow) : [];
  const directories = modelDirectories(models);
  const directoryKey = directories.join('\n');

  useEffect(() => {
    if (!active || baseUrl.length === 0 || directoryKey.length === 0) return;
    for (const folder of directoryKey.split('\n')) void ensure(baseUrl, folder);
  }, [active, baseUrl, directoryKey, ensure]);

  return missingModels(models, (directory) => {
    const folder = folders.get(directory);
    return folder?.status === 'ready' ? folder.files.map((file) => file.name) : null;
  });
}
