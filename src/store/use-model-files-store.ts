import { create } from 'zustand';

import { MODEL_FOLDERS, modelFileIndex, type ModelFile } from '@/graph/model-files';
import { compositeKey } from '@/lib/own-key';
import type { ModelsPort } from '@/port/comfy-port';
import type { RequestFailure } from '@/port/connection';
import { fallbackRequestFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';

// ─────────────────────────────
// モデルファイルの一覧（種別ごと）の保持。ノード定義と同じく、取るのは 1 回だけで取り直しは手動。
// 持たない接続先では失敗したまま置き、画面は選択肢だけで進める。
// ─────────────────────────────

/** 1 つの種別の一覧の取得の段階 */
export type ModelFolderStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 1 つの種別のモデルファイルの一覧 */
export interface ModelFolder {
  readonly status: ModelFolderStatus;
  readonly files: readonly ModelFile[];
  /** 正規化した名前で引く索引。選択肢との突き合わせに使う */
  readonly index: ReadonlyMap<string, ModelFile>;
  readonly error: RequestFailure | null;
}

/** 取れている種別だけを、突き合わせを試す順に並べた索引（種別 → 正規化した名前で引く索引） */
export function modelIndexes(
  folders: ReadonlyMap<string, ModelFolder>,
): Map<string, ReadonlyMap<string, ModelFile>> {
  const map = new Map<string, ReadonlyMap<string, ModelFile>>();
  for (const folder of MODEL_FOLDERS) {
    const entry = folders.get(folder);
    if (entry !== undefined && entry.index.size > 0) map.set(folder, entry.index);
  }
  return map;
}

/** 未取得の種別を表す値。**同じ参照を返す**（セレクタが毎回作り直さないように） */
export const EMPTY_MODEL_FOLDER: ModelFolder = {
  status: 'idle',
  files: [],
  index: new Map<string, ModelFile>(),
  error: null,
};

/** 種別ごとのモデルファイルの一覧と、取る・取り直す操作 */
interface ModelFilesState {
  readonly folders: ReadonlyMap<string, ModelFolder>;
  /** 未取得のときだけ取る */
  readonly ensure: (baseUrl: string, folder: string) => Promise<void>;
  /** 手動の取り直し。状態によらず取り直す */
  readonly refresh: (baseUrl: string, folder: string) => Promise<void>;
  /**
   * 失敗している種別だけ取り直す（通知の口が開き直したとき）。落ちている間・再起動中に
   * 取りに行った失敗を、つながり直した後まで残さない
   */
  readonly retryFailed: (baseUrl: string) => Promise<void>;
  /** 未取得に戻す（接続し直すとき）。一覧は残し、次の `ensure` で取り直す */
  readonly invalidate: () => void;
  readonly clear: () => void;
}

/** モデルファイルのストアが使う取得（テストでは作り物に差し替える） */
interface ModelFilesDeps {
  readonly fetchFiles: ModelsPort['fetchFiles'];
}

function toFailure(error: unknown, url: string): RequestFailure {
  return comfyPort().connection.failureOf(error) ?? fallbackRequestFailure(error, url);
}

/** 渡した取得でモデルファイルのストアを作る */
export function createModelFilesStore(deps: ModelFilesDeps) {
  /** 同じ種別の取得が重ならないようにする */
  const inFlight = new Set<string>();

  return create<ModelFilesState>()((set, get) => {
    function put(folder: string, next: ModelFolder): void {
      const folders = new Map(get().folders);
      folders.set(folder, next);
      set({ folders });
    }

    async function load(baseUrl: string, folder: string): Promise<void> {
      const key = compositeKey(baseUrl, folder);
      if (inFlight.has(key)) return;
      inFlight.add(key);

      const current = get().folders.get(folder) ?? EMPTY_MODEL_FOLDER;
      put(folder, { ...current, status: 'loading', error: null });

      try {
        const files = await deps.fetchFiles(baseUrl, folder, {});
        put(folder, { status: 'ready', files, index: modelFileIndex(files), error: null });
      } catch (error) {
        const failure = toFailure(error, baseUrl);
        put(folder, { status: 'error', files: [], index: new Map(), error: failure });
      } finally {
        inFlight.delete(key);
      }
    }

    return {
      folders: new Map<string, ModelFolder>(),

      async ensure(baseUrl, folder) {
        if (baseUrl.length === 0) return;

        const current = get().folders.get(folder);
        if (current !== undefined && current.status !== 'idle') return;

        await load(baseUrl, folder);
      },

      refresh: (baseUrl, folder) =>
        baseUrl.length === 0 ? Promise.resolve() : load(baseUrl, folder),

      async retryFailed(baseUrl) {
        if (baseUrl.length === 0) return;
        const failed = [...get().folders].filter(([, entry]) => entry.status === 'error');
        await Promise.all(failed.map(([folder]) => load(baseUrl, folder)));
      },

      invalidate: () => {
        const folders = new Map<string, ModelFolder>();
        for (const [folder, entry] of get().folders) {
          folders.set(folder, entry.status === 'loading' ? entry : { ...entry, status: 'idle' });
        }
        set({ folders });
      },

      clear: () => set({ folders: new Map<string, ModelFolder>() }),
    };
  });
}

// 通信は呼ぶたびに窓口から引く
export const useModelFilesStore = createModelFilesStore({
  fetchFiles: (baseUrl, folder, options) => comfyPort().models.fetchFiles(baseUrl, folder, options),
});
