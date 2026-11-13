import { create } from 'zustand';

import {
  mergeTags,
  orderDictionaries,
  type IndexedTag,
  type TagSources,
} from '@/graph/tag-dictionary';
import type { TagsPort } from '@/port/tags';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { registerTabScopedValue } from '@/store/kit/tab-scoped';
import { comfyPort } from '@/store/ports/comfy-port';
import {
  planCommit,
  type TagChanges,
  type TagCommitFailure,
  type WriteStep,
} from '@/store/slices/tags-kit';

export type { TagChanges, TagCommitFailure } from '@/store/slices/tags-kit';

/** 書けなかった理由。読み終えていない・接続先が断った（理由はストアの `error`） */
export type TagWriteFailure = 'not-loaded' | 'failed';

// ─────────────────────────────
// タグ辞書の保持（pysssss の一覧・`kisara/tags/` の辞書・pysssss の上書きと、それらを合わせた一覧）と書き込み。
// 辞書の画面を開いているかもここが持つ（重ねる先は別の部品なので、状態で受け渡す）。
// ─────────────────────────────

/** タグ辞書の画面のダイアログの名前（出し方を端末に残す鍵・開いている順の鍵） */
export const TAG_PANEL_DIALOG = 'tag-panel';

/** 辞書の読み書きの段階 */
type TagsStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

/** 辞書の状態と、読む・書く操作・画面の開閉 */
interface TagsState extends TagSources {
  readonly status: TagsStatus;
  /** 読み終えた接続先。書けるのはこの接続先だけ（読めていない辞書で書くと行を失う） */
  readonly loadedFrom: string | null;
  readonly error: string | null;
  /** 出どころを合わせた一覧（補完と「すべて」が使う）。材料が変わったときに作り直す */
  readonly merged: readonly IndexedTag[];
  /** 未取得のときだけ取る */
  readonly load: (baseUrl: string) => Promise<void>;
  /** 手動の取り直し */
  readonly refresh: (baseUrl: string) => Promise<void>;
  /** 未読み込みに戻す（接続し直すとき）。途中の読み書きの結果は捨てる */
  readonly invalidate: () => void;
  /**
   * 直しかけをまとめて書く（確定）。書けた分は手元に入れ、途中で断られたらそこで止めて理由を返す。
   * 名前が重なる新しい辞書があれば何も書かない
   */
  readonly commit: (
    baseUrl: string,
    changes: TagChanges,
  ) => Promise<TagCommitFailure | TagWriteFailure | null>;
  readonly panelOpen: boolean;
  readonly openPanel: () => void;
  readonly closePanel: () => void;
  /** 外（アイコンの押し直し・ほかの埋め込み）から閉じるよう頼まれたか。直しかけの確認は画面が持つ */
  readonly closeRequested: boolean;
  readonly requestClosePanel: () => void;
  readonly clearCloseRequest: () => void;
}

const EMPTY: TagSources & { readonly merged: readonly IndexedTag[] } = {
  pysssss: null,
  dictionaries: [],
  overrides: [],
  merged: [],
};

/** 材料を差し替えて、合わせた一覧も作り直す */
function withSources(state: TagSources, patch: Partial<TagSources>): Partial<TagsState> {
  const sources = {
    pysssss: state.pysssss,
    dictionaries: state.dictionaries,
    overrides: state.overrides,
    ...patch,
  };
  return { ...patch, merged: mergeTags(sources) };
}

/** 画面の開け閉て */
function panelActions(
  set: (patch: Partial<TagsState>) => void,
): Pick<
  TagsState,
  | 'panelOpen'
  | 'openPanel'
  | 'closePanel'
  | 'closeRequested'
  | 'requestClosePanel'
  | 'clearCloseRequest'
> {
  return {
    panelOpen: false,
    openPanel: () => set({ panelOpen: true, closeRequested: false }),
    closePanel: () => set({ panelOpen: false, closeRequested: false }),
    closeRequested: false,
    requestClosePanel: () => set({ closeRequested: true }),
    clearCloseRequest: () => set({ closeRequested: false }),
  };
}

/** 渡した窓口でタグ辞書のストアを作る（テストでは作り物を渡す） */
export function createTagsStore(port: TagsPort) {
  return create<TagsState>()((set, get) => {
    /** 読み書きの世代。接続し直したら進め、古い結果を入れない */
    let generation = 0;

    async function load(baseUrl: string): Promise<void> {
      if (baseUrl.length === 0) return;
      const current = ++generation;
      set({ status: 'loading', error: null });
      try {
        const [pysssss, dictionaries, overrides] = await Promise.all([
          port.fetchPysssss(baseUrl, {}),
          port.fetchDictionaries(baseUrl, {}),
          port.fetchOverrides(baseUrl, {}),
        ]);
        if (current !== generation) return;
        const sources = { pysssss, dictionaries: orderDictionaries(dictionaries), overrides };
        set({
          status: 'ready',
          loadedFrom: baseUrl,
          error: null,
          ...withSources(sources, sources),
        });
      } catch (error) {
        if (current !== generation) return;
        set({ status: 'error', loadedFrom: null, error: formatComfyFailure(error), ...EMPTY });
      }
    }

    /** 段取りどおり順に書き、書けた分ずつ手元にも入れる。断られたらそこで止めて false */
    async function write(steps: readonly WriteStep[]): Promise<boolean> {
      const current = generation;
      set({ status: 'saving', error: null });
      try {
        for (const step of steps) {
          await step.run();
          if (current === generation) set(withSources(get(), step.apply(get())));
        }
        if (current === generation) set({ status: 'ready' });
        return true;
      } catch (error) {
        if (current === generation) set({ status: 'ready', error: formatComfyFailure(error) });
        return false;
      }
    }

    return {
      status: 'idle',
      loadedFrom: null,
      error: null,
      ...EMPTY,
      async load(baseUrl) {
        if (get().status !== 'idle') return;
        await load(baseUrl);
      },
      refresh: load,
      invalidate: () => {
        generation++;
        set({ status: 'idle', loadedFrom: null });
      },
      async commit(baseUrl, changes) {
        if (get().loadedFrom !== baseUrl) return 'not-loaded';
        const steps = planCommit(get(), port, baseUrl, changes);
        if (typeof steps === 'string') return steps;
        return (await write(steps)) ? null : 'failed';
      },
      ...panelActions(set),
    };
  });
}

/** 受け口に入れた窓口のタグ辞書の群を呼ぶ（入れる前に作られるので、呼ぶたびに引く） */
const portTags: TagsPort = {
  fetchPysssss: (...args) => comfyPort().tags.fetchPysssss(...args),
  fetchDictionaries: (...args) => comfyPort().tags.fetchDictionaries(...args),
  fetchOverrides: (...args) => comfyPort().tags.fetchOverrides(...args),
  saveDictionary: (...args) => comfyPort().tags.saveDictionary(...args),
  saveOverrides: (...args) => comfyPort().tags.saveOverrides(...args),
  removeDictionary: (...args) => comfyPort().tags.removeDictionary(...args),
};

export const useTagsStore = createTagsStore(portTags);

// タグ辞書の画面はタブのもの（直しかけは控えない）
registerTabScopedValue('tagPanel', {
  current: () => (useTagsStore.getState().panelOpen ? true : null),
  isValue: (saved): saved is true => saved === true,
  open: () => useTagsStore.getState().openPanel(),
  close: () => useTagsStore.getState().closePanel(),
});
