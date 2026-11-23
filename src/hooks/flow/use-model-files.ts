import { useEffect } from 'react';

import { MODEL_FOLDERS } from '@/graph/model-files';
import type { ModelFile } from '@/graph/model-files';
import { useConnectionStore } from '@/store/use-connection-store';
import {
  EMPTY_MODEL_FOLDER,
  modelIndexes,
  useModelFilesStore,
  type ModelFolderStatus,
} from '@/store/use-model-files-store';
import { useSettingsStore } from '@/store/use-settings-store';

export interface ModelFiles {
  readonly indexes: ReadonlyMap<string, ReadonlyMap<string, ModelFile>>;
  readonly baseUrl: string;
  readonly statusOf: (folder: string) => ModelFolderStatus;
  readonly refresh: (folder: string) => void;
}

export function useModelFiles(enabled: boolean): ModelFiles {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const folders = useModelFilesStore((state) => state.folders);
  const ensure = useModelFilesStore((state) => state.ensure);
  const refreshFolder = useModelFilesStore((state) => state.refresh);
  const connected = useConnectionStore((state) => state.status === 'connected');

  useEffect(() => {
    if (!enabled || !connected || baseUrl.length === 0) return;

    for (const folder of MODEL_FOLDERS) void ensure(baseUrl, folder);
  }, [enabled, connected, baseUrl, ensure]);

  const indexes = modelIndexes(folders);

  const statusOf = (folder: string): ModelFolderStatus =>
    folders.get(folder)?.status ?? EMPTY_MODEL_FOLDER.status;

  const refresh = (folder: string): void => {
    void refreshFolder(baseUrl, folder);
  };

  return { indexes, baseUrl, statusOf, refresh };
}
