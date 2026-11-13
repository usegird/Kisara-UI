import { create } from 'zustand';

import { notesFilePath } from '@/graph/kisara-files';
import { createBaseUrlActions } from '@/store/kit/base-url-resource';
import { comfyPort } from '@/store/ports/comfy-port';

// ─────────────────────────────
// モデルのメモをどこから読むか。`kisara/notes/` のメモを先に、無ければ pysssss が書いた同名の
// `.txt` を読む（拡張があるときだけ）。一覧と拡張の有無は接続ごとに 1 回だけ確かめて持ち回す。
// ─────────────────────────────

/** メモの一覧と拡張の有無を確かめる段階 */
type ModelNotesRouteStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * メモの置き場の状態と、読む・書く操作。一覧を持つのは、無いメモを取りに行かないため
 * （接続先は読むだけでも親のフォルダを作る）。ComfyUI の再起動で拡張が入った場合に備え、
 * 確かめ直す口を持つ
 */
interface ModelNotesStoreState {
  readonly status: ModelNotesRouteStatus;
  /** どの接続先の結果か。変わったら確かめ直す */
  readonly baseUrl: string;
  readonly error: string | null;
  /** pysssss の経路があるか（同名の `.txt` を読めるか） */
  readonly pysssss: boolean;
  /** `kisara/notes` に保存したメモの経路 */
  readonly saved: ReadonlySet<string>;
  /** その接続先の分が未確認のときだけ確かめる */
  readonly ensure: (baseUrl: string) => Promise<void>;
  /** 確かめ直す */
  readonly refresh: (baseUrl: string) => Promise<void>;
  /** 未確認に戻す（接続し直すとき） */
  readonly invalidate: () => void;
  /** 1 モデル分を読む。確かめ終えてから呼ぶ。どちらにも無ければ null */
  readonly read: (baseUrl: string, folder: string, filename: string) => Promise<string | null>;
  /** `kisara/` に書き、以後はそちらを読む */
  readonly save: (baseUrl: string, folder: string, filename: string, text: string) => Promise<void>;
}

const NO_NOTES: ReadonlySet<string> = new Set();

export const useModelNotesStore = create<ModelNotesStoreState>()((set, get) => {
  async function fetchRoutes(baseUrl: string): Promise<Partial<ModelNotesStoreState>> {
    const { models } = comfyPort();
    const [pysssss, saved] = await Promise.all([
      models.hasNotesRoute(baseUrl, {}),
      models.listNotes(baseUrl, {}),
    ]);
    return { status: 'ready', pysssss, saved };
  }

  return {
    status: 'idle',
    baseUrl: '',
    error: null,
    pysssss: false,
    saved: NO_NOTES,
    ...createBaseUrlActions(set, get, fetchRoutes),
    read: async (baseUrl, folder, filename) => {
      const { models } = comfyPort();
      const state = get();
      if (state.saved.has(notesFilePath(folder, filename))) {
        const saved = await models.fetchNotes(baseUrl, folder, filename);
        // 空のメモは「書いていない」とみなし、pysssss の同名の `.txt` を読む（消す口は持たない。
        // 空で保存すると空のファイルが残るため）
        if (saved !== null && saved.trim().length > 0) return saved;
      }
      if (state.pysssss) return models.fetchPysssssNotes(baseUrl, folder, filename);
      return null;
    },
    save: async (baseUrl, folder, filename, text) => {
      await comfyPort().models.saveNotes(baseUrl, { folder, filename, text });
      if (get().baseUrl !== baseUrl) return;
      set((state) => ({ saved: new Set(state.saved).add(notesFilePath(folder, filename)) }));
    },
  };
});
