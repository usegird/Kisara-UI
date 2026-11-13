import { create } from 'zustand';

import { parseDictionary, sameEntries, type Dictionary } from '@/chat/dictionary';
import {
  DICTIONARY_FILE_MAX_BYTES,
  readDictionaryFile,
  type DictionaryFileProblem,
} from '@/chat/dictionary-file';
import type { LoreEntry } from '@/chat/lore';
import { isTooLarge } from '@/lib/file-size';
import { newShortId } from '@/lib/id';
import { omitKey } from '@/lib/own-key';
import {
  createLibraryTable,
  restoreOutcomeOf,
  type RestoreOutcome,
} from '@/store/kit/library-table';
import type { ChatTable } from '@/store/persist/chat-repo';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 全体の追加辞書の一覧。端末の大きい保存領域に 1 冊 1 件で置き、画面の中にも全部を持つ
// （書けなくても画面の中では使える）。全体で有効にした並びは設定のストアが持つ。
// ─────────────────────────────

const dictionaryTable = createLibraryTable('dictionary');

/** テストから置き場を差し替える */
export function installDictionaryTable(next: ChatTable | null): void {
  dictionaryTable.install(next);
}

/** 足した結果。同じ項目の列の辞書が既にあれば、足さずにそれを返す */
interface AdoptResult {
  readonly dictionary: Dictionary;
  readonly added: boolean;
}

interface DictionariesState {
  readonly dictionaries: Readonly<Record<string, Dictionary>>;
  /** 置き場から読み終えたか（読む前は、辞書が見つからないと決めつけない） */
  readonly loaded: boolean;
  readonly load: () => Promise<void>;
  /**
   * 項目の列を全体の 1 冊として足す。同じ項目の列の全体の辞書があれば
   * それを使う
   */
  readonly adopt: (name: string, entries: readonly LoreEntry[]) => AdoptResult;
  /**
   * 個別追加辞書を 1 冊足す（毎回作る。全体で有効にはしない）
   */
  /**
   * 項目の無い辞書を足し、全体で有効にする（拡張のタブの新規作成）
   */
  readonly add: (name: string) => Dictionary;
  /**
   * 名前・項目の列を直す
   */
  readonly update: (
    id: string,
    patch: Partial<Pick<Dictionary, 'name' | 'entries' | 'scanDepth'>>,
  ) => void;
  /** 一覧から消す（端末から消す。ComfyUI の控えは残す。有効にした並びからも外す） */
  readonly remove: (id: string) => void;
  /** 控えから戻す。同じ id があれば最後に変えた時刻（版）の新しい方を残す */
  readonly restore: (dictionary: Dictionary) => RestoreOutcome;
}

export const useDictionariesStore = create<DictionariesState>()((set, get) => {
  /**
   * 一覧に入れて端末に書く。書けなくても、この画面の中では使える。持っていた 1 件を直すときは、
   * 置き場の 1 件がほかのタブで変わっていないかを照合してから書く。
   * 控えから戻すときは照合しない（`checked: false`）
   */
  const put = (dictionary: Dictionary, checked = true): void => {
    const expected = checked ? (get().dictionaries[dictionary.id]?.updatedAt ?? null) : null;
    set({ dictionaries: { ...get().dictionaries, [dictionary.id]: dictionary } });
    dictionaryTable.write({
      id: dictionary.id,
      value: dictionary,
      expected,
      name: dictionary.name,
      latest: () => get().dictionaries[dictionary.id],
    });
  };

  return {
    dictionaries: {},
    loaded: false,

    load: async () => {
      const found = await dictionaryTable.loadAll(parseDictionary, (item) => item.id);
      const dictionaries = { ...found, ...get().dictionaries };
      set({ dictionaries, loaded: true });
      // 有効にした並びに、一覧に無い id があれば外す
      useSettingsStore.getState().keepLoreDictionaryIds(new Set(Object.keys(dictionaries)));
    },

    adopt: (name, entries) => {
      const same = Object.values(get().dictionaries).find((item) =>
        sameEntries(item.entries, entries),
      );
      if (same !== undefined) return { dictionary: same, added: false };
      const now = Date.now();
      const dictionary: Dictionary = {
        id: newShortId(),
        name,
        entries,
        createdAt: now,
        updatedAt: now,
      };
      put(dictionary);
      return { dictionary, added: true };
    },

    add: (name) => {
      const now = Date.now();
      const dictionary: Dictionary = {
        id: newShortId(),
        name,
        entries: [],
        createdAt: now,
        updatedAt: now,
      };
      put(dictionary);
      useSettingsStore.getState().setLoreDictionaryEnabled(dictionary.id, true);
      return dictionary;
    },

    update: (id, patch) => {
      const dictionary = get().dictionaries[id];
      if (dictionary !== undefined) put({ ...dictionary, ...patch, updatedAt: Date.now() });
    },

    remove: (id) => {
      set({ dictionaries: omitKey(get().dictionaries, id) });
      useSettingsStore.getState().setLoreDictionaryEnabled(id, false);
      dictionaryTable.remove(id);
    },

    restore: (dictionary) => {
      const outcome = restoreOutcomeOf(get().dictionaries[dictionary.id], dictionary);
      if (outcome !== null) put(dictionary, false);
      return outcome;
    },
  };
});

/**
 * 取り込んだ 1 ファイルの結果（拡張のタブの通知に出す）
 */
export type DictionaryImport =
  | { readonly kind: 'added' | 'existing'; readonly name: string; readonly count: number }
  | { readonly kind: 'error'; readonly fileName: string; readonly problem: DictionaryFileProblem };

/**
 * ファイルを追加辞書として取り込み、全体で有効にする（有効でなければ並びの最後に足す）。
 * 同じ項目の列の辞書があれば、足さずにそれを有効にする
 */
export async function importDictionaryFile(file: File): Promise<DictionaryImport> {
  // 丸ごと読む前に大きさを見る（巨大なファイルで画面を止めない）
  if (isTooLarge(file, DICTIONARY_FILE_MAX_BYTES)) {
    return { kind: 'error', fileName: file.name, problem: 'size' };
  }
  let content: string;
  try {
    content = await file.text();
  } catch {
    return { kind: 'error', fileName: file.name, problem: 'format' };
  }
  const read = readDictionaryFile(file.name, content);
  if (read.kind === 'error') return { kind: 'error', fileName: file.name, problem: read.problem };
  const { dictionary, added } = useDictionariesStore.getState().adopt(read.name, read.entries);
  useSettingsStore.getState().setLoreDictionaryEnabled(dictionary.id, true);
  return {
    kind: added ? 'added' : 'existing',
    name: dictionary.name,
    count: dictionary.entries.length,
  };
}
