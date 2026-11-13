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

// ─────────────────────────────
// カードで選ばせる種別（Lora・モデル）の一覧を取り寄せる。
// ─────────────────────────────

/** 種別ごとのモデルの一覧の索引と、状態・取り直しの手続き */
export interface ModelFiles {
  /** 種別 → 正規化した名前で引く索引。突き合わせに使う */
  readonly indexes: ReadonlyMap<string, ReadonlyMap<string, ModelFile>>;
  readonly baseUrl: string;
  readonly statusOf: (folder: string) => ModelFolderStatus;
  readonly refresh: (folder: string) => void;
}

/**
 * 種別ごとのモデルの一覧を取り、正規化した名前の索引で返す。
 * 一覧の経路を持たない接続先では失敗のまま置く
 */
export function useModelFiles(enabled: boolean): ModelFiles {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const folders = useModelFilesStore((state) => state.folders);
  const ensure = useModelFilesStore((state) => state.ensure);
  const refreshFolder = useModelFilesStore((state) => state.refresh);
  // つながったら取りに行く（接続し直したときも、初めての接続と同じくここから取る）
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
