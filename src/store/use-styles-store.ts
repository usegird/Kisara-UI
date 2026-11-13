import { create } from 'zustand';

import {
  EMPTY_STYLE_TABLE,
  mergeStyles,
  removeStyle,
  styleKey,
  upsertStyle,
  type SavedStyle,
  type Style,
  type StyleTable,
  type StyleWriteError,
} from '@/graph/styles';
import { isRecord } from '@/lib/guards';
import type { AssetsPort } from '@/port/comfy-port';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { registerTabScoped } from '@/store/kit/tab-scoped';
import { comfyPort } from '@/store/ports/comfy-port';

// ─────────────────────────────
// スタイルの一覧の保持（`styles.csv` と `kisara/` の 1 件ずつを名前で合わせる）と、`kisara/` への書き込み。
// 編集の画面を開いているかもここが持つ（重ねる先は別の部品なので、状態で受け渡す）。
// ─────────────────────────────

/** スタイルの一覧の読み書きの段階 */
type StylesStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

/** スタイルの編集のダイアログの名前（出し方を端末に残す鍵・開いている順の鍵） */
export const STYLE_EDITOR_DIALOG = 'style-editor';

/** 保存できなかった理由。名前の規則に加え、まだ読み終えていないとき */
export type StyleSaveFailure = StyleWriteError | 'not-loaded';

/**
 * スタイルの一覧と編集の画面の状態と、読む・書く操作。取るのは開いたときの 1 回だけで、
 * 書くのは押されたときに `kisara/` の 1 件だけ（`styles.csv` は書かない）
 */
interface StylesState {
  readonly status: StylesStatus;
  readonly table: StyleTable;
  /**
   * 一覧を読み終えた接続先。読めていなければ null。書けるのはこの接続先だけ（読めていない一覧・
   * 前の接続先の一覧で書くと、`kisara/` が `styles.csv` の行を隠してしまう）
   */
  readonly loadedFrom: string | null;
  readonly error: string | null;
  /**
   * 編集の画面で開いている名前。`null` は新規、閉じているときは `editing` 自体が null。
   * `prompt` は新規を開くときに肯定へ入れておく文面（アプリ入力から送る）。
   * `draft` はタブを切り替えて戻したときの直しかけ
   */
  readonly editing: {
    readonly name: string | null;
    readonly prompt?: string;
    readonly draft?: Style;
  } | null;
  /** 未取得のときだけ取る */
  readonly load: (baseUrl: string) => Promise<void>;
  /** 手動の取り直し */
  readonly refresh: (baseUrl: string) => Promise<void>;
  /**
   * 1 件を `kisara/` に書く。名前を変えたら古い名前に消した印も書く。
   * 名前が空・重なり・読み終えていないなら書かずに理由を返す
   */
  readonly save: (
    baseUrl: string,
    original: string | null,
    style: Style,
  ) => Promise<StyleSaveFailure | null>;
  /** 消した印を `kisara/` に書く。読み終えていなければ何もしない */
  readonly remove: (baseUrl: string, name: string) => Promise<void>;
  /** 未読み込みに戻す（接続し直すとき）。一覧も捨て、次の `load` で読み直す。途中の読み書きの結果は捨てる */
  readonly invalidate: () => void;
  readonly openEditor: (name: string | null, prompt?: string) => void;
  readonly closeEditor: () => void;
  /**
   * 文面を肯定に入れた新規として開くよう頼む。閉じていればすぐ開き、開いていれば画面が受ける
   * （直しかけがあれば捨てる前に確かめる）
   */
  readonly requestNewStyle: (prompt: string) => void;
  /** 画面がまだ受けていない、新規として開く文面 */
  readonly newStyleRequest: string | null;
  readonly clearNewStyleRequest: () => void;
  /**
   * 外（アイコンの押し直し・ほかの埋め込みが開いた）から閉じるよう頼まれたか。
   * 直しかけの確認は画面が持つ
   */
  readonly closeRequested: boolean;
  readonly requestCloseEditor: () => void;
  readonly clearCloseRequest: () => void;
}

/** スタイルのストアが使う読み書き（テストでは作り物に差し替える） */
export interface StylesDeps {
  readonly fetchTable: AssetsPort['fetchStyleTable'];
  readonly fetchSaved: AssetsPort['fetchSavedStyles'];
  readonly saveStyle: AssetsPort['saveStyle'];
}

function message(error: unknown): string {
  return formatComfyFailure(error);
}

/** 渡した読み書きでスタイルのストアを作る */
export function createStylesStore(deps: StylesDeps) {
  return create<StylesState>()((set, get) => {
    /** 読み書きの世代。接続し直したら進め、古い結果を一覧へ入れない */
    let generation = 0;

    async function load(baseUrl: string): Promise<void> {
      if (baseUrl.length === 0) return;
      const current = ++generation;
      set({ status: 'loading', error: null });

      try {
        const [csv, saved] = await Promise.all([
          deps.fetchTable(baseUrl, {}),
          deps.fetchSaved(baseUrl, {}),
        ]);
        if (current !== generation) return;
        set({ status: 'ready', table: mergeStyles(csv, saved), loadedFrom: baseUrl, error: null });
      } catch (error) {
        if (current !== generation) return;
        set({ status: 'error', table: EMPTY_STYLE_TABLE, loadedFrom: null, error: message(error) });
      }
    }

    /** 書いて手元にも反映する。失敗したら手元は変えない */
    async function write(
      baseUrl: string,
      entries: readonly SavedStyle[],
      table: StyleTable,
    ): Promise<void> {
      const current = generation;
      set({ status: 'saving', error: null });

      try {
        // 順に書く。名前の変更は新しい名前を先に書くので、途中で失敗しても消えた名前は出ない
        for (const entry of entries) await deps.saveStyle(baseUrl, entry, {});
        if (current !== generation) return;
        set({ status: 'ready', table, error: null });
      } catch (error) {
        if (current !== generation) return;
        set({ status: 'ready', error: message(error) });
      }
    }

    return {
      status: 'idle',
      table: EMPTY_STYLE_TABLE,
      loadedFrom: null,
      error: null,
      editing: null,

      async load(baseUrl) {
        if (get().status !== 'idle') return;
        await load(baseUrl);
      },

      refresh: load,

      async save(baseUrl, original, style) {
        if (get().loadedFrom !== baseUrl) return 'not-loaded';
        const result = upsertStyle(get().table, original, style);
        if (result.table === null || result.style === null) return result.error;

        await write(baseUrl, savedEntriesOf(original, result.style), result.table);
        return null;
      },

      async remove(baseUrl, name) {
        if (get().loadedFrom !== baseUrl) return;
        await write(baseUrl, [{ deleted: true, name }], removeStyle(get().table, name));
      },

      invalidate: () => {
        generation++;
        set({ status: 'idle', table: EMPTY_STYLE_TABLE, loadedFrom: null });
      },

      openEditor: (name, prompt) =>
        set({ editing: prompt === undefined ? { name } : { name, prompt } }),
      requestNewStyle: (prompt) =>
        set((state) =>
          state.editing === null
            ? { editing: { name: null, prompt }, newStyleRequest: null }
            : { newStyleRequest: prompt },
        ),
      newStyleRequest: null,
      clearNewStyleRequest: () => set({ newStyleRequest: null }),
      closeEditor: () => set({ editing: null, closeRequested: false, newStyleRequest: null }),
      closeRequested: false,
      requestCloseEditor: () => set({ closeRequested: true }),
      clearCloseRequest: () => set({ closeRequested: false }),
    };
  });
}

/** 保存で書く分。名前を変えたら、新しい名前を書いてから前の名前に消した印を書く */
function savedEntriesOf(original: string | null, style: Style): SavedStyle[] {
  const entries: SavedStyle[] = [{ deleted: false, style }];
  // 大文字小文字だけの変更は同じファイルなので、印を書くと今書いた分を消してしまう
  if (original !== null && styleKey(original) !== styleKey(style.name)) {
    entries.push({ deleted: true, name: original });
  }
  return entries;
}

export const useStylesStore = createStylesStore({
  fetchTable: (baseUrl, options) => comfyPort().assets.fetchStyleTable(baseUrl, options),
  fetchSaved: (baseUrl, options) => comfyPort().assets.fetchSavedStyles(baseUrl, options),
  saveStyle: (baseUrl, entry, options) => comfyPort().assets.saveStyle(baseUrl, entry, options),
});

// ─────────────────────────────
// 編集の画面はタブのもの。直しかけは画面が持つので、
// 画面が今の直しかけを知らせ、タブを切り替えるときに一緒に控える。
// ─────────────────────────────

let liveDraft: Style | null = null;

function isStyle(value: unknown): value is Style {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.prompt === 'string' &&
    typeof value.negative === 'string' &&
    isRecord(value.other)
  );
}

/** 編集の画面が直しかけを知らせる（直しかけが無ければ null） */
export function reportStyleDraft(draft: Style | null): void {
  liveDraft = draft;
}

registerTabScoped('styleEditor', {
  capture: () => {
    const { editing } = useStylesStore.getState();
    if (editing === null) return undefined;
    return liveDraft === null ? editing : { ...editing, draft: liveDraft };
  },
  restore: (saved) => {
    const styles = useStylesStore.getState();
    if (isRecord(saved) && (typeof saved.name === 'string' || saved.name === null)) {
      const { name, prompt, draft } = saved;
      const editing = {
        name,
        ...(typeof prompt === 'string' ? { prompt } : {}),
        ...(isStyle(draft) ? { draft } : {}),
      };
      useStylesStore.setState({ editing, closeRequested: false });
    } else if (styles.editing !== null) {
      useStylesStore.setState({ editing: null, closeRequested: false, newStyleRequest: null });
    }
  },
});
