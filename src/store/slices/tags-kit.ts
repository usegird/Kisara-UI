import {
  checkDictionaryName,
  dictionaryKey,
  isDefaultDictionary,
  orderDictionaries,
  type DictionaryNameError,
  type TagDictionary,
  type TagEntry,
  type TagSources,
} from '@/graph/tag-dictionary';
import type { TagsPort } from '@/port/tags';

// ─────────────────────────────
// タグ辞書の確定の段取り。直しかけをまとめて書く手続きの並びと、書けた分ずつ手元へ入れる変え方を組み立てる。
// ─────────────────────────────

/** 確定できなかった理由。名前の規則に加え、読み終えていない */
export type TagCommitFailure = DictionaryNameError | 'not-loaded';

/** 確定でまとめて書く直しかけ */
export interface TagChanges {
  /** 丸ごと書く辞書（直した辞書と足した辞書） */
  readonly dictionaries: readonly TagDictionary[];
  /** ファイルを消す辞書の名前 */
  readonly removed: readonly string[];
  /** 書き直す pysssss の上書き。変えていなければ null */
  readonly overrides: readonly TagEntry[] | null;
}

/** 書く手続き 1 つと、書けたら手元の材料へ入れる変え方 */
export interface WriteStep {
  readonly run: () => Promise<void>;
  readonly apply: (sources: TagSources) => TagSources;
}

/**
 * 直しかけをまとめて書く段取りを組む。手元にファイルのある辞書と既定の辞書は上書きし、
 * ほかは新しい辞書として上書きせずに書く（名前が重なれば何も書かない）。
 * 書けた分は手元に入るので、途中で止まっても組み直せば残りだけが新しい辞書になる
 */
export function planCommit(
  state: TagSources,
  port: TagsPort,
  baseUrl: string,
  changes: TagChanges,
): readonly WriteStep[] | DictionaryNameError {
  const steps: WriteStep[] = [];
  for (const name of changes.removed) {
    if (findDictionary(state, name) === undefined) continue;
    steps.push({
      run: () => port.removeDictionary(baseUrl, name, {}),
      apply: (sources) => ({ ...sources, dictionaries: without(sources.dictionaries, name) }),
    });
  }
  for (const dictionary of changes.dictionaries) {
    const overwrite =
      isDefaultDictionary(dictionary.name) || findDictionary(state, dictionary.name) !== undefined;
    if (!overwrite) {
      const failure = checkDictionaryName(state.dictionaries, dictionary.name);
      if (failure !== null) return failure;
    }
    steps.push({
      run: () => port.saveDictionary(baseUrl, dictionary, overwrite, {}),
      apply: (sources) => ({
        ...sources,
        dictionaries: orderDictionaries([
          ...without(sources.dictionaries, dictionary.name),
          dictionary,
        ]),
      }),
    });
  }
  const { overrides } = changes;
  if (overrides !== null) {
    steps.push({
      run: () => port.saveOverrides(baseUrl, overrides, {}),
      apply: (sources) => ({ ...sources, overrides }),
    });
  }
  return steps;
}

function findDictionary(state: TagSources, name: string): TagDictionary | undefined {
  const key = dictionaryKey(name);
  return state.dictionaries.find((item) => dictionaryKey(item.name) === key);
}

function without(dictionaries: readonly TagDictionary[], name: string): TagDictionary[] {
  const key = dictionaryKey(name);
  return dictionaries.filter((item) => dictionaryKey(item.name) !== key);
}
