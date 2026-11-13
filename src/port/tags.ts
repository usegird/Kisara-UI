import type { TagDictionary, TagEntry } from '@/graph/tag-dictionary';
import type { RequestOptions } from '@/port/connection';

// ─────────────────────────────
// タグ辞書の読み書きの窓口の型。pysssss の一覧は読むだけで、書くのは `kisara/tags/` の下だけ。
// ─────────────────────────────

/** タグ辞書（pysssss の一覧・`kisara/tags/` の辞書・pysssss の上書き） */
export interface TagsPort {
  /** pysssss の補完の一覧（読むだけ）。拡張か一覧が無ければ null */
  readonly fetchPysssss: (baseUrl: string, options?: RequestOptions) => Promise<TagEntry[] | null>;
  /** `kisara/tags/` の辞書の全件（ファイル名の順） */
  readonly fetchDictionaries: (
    baseUrl: string,
    options?: RequestOptions,
  ) => Promise<TagDictionary[]>;
  /** pysssss の上書き（辞書と同じ形の行）。無ければ空 */
  readonly fetchOverrides: (baseUrl: string, options?: RequestOptions) => Promise<TagEntry[]>;
  /** 辞書 1 つを丸ごと書く。`overwrite` が false なら、あるときは接続先が断る */
  readonly saveDictionary: (
    baseUrl: string,
    dictionary: TagDictionary,
    overwrite: boolean,
    options?: RequestOptions,
  ) => Promise<void>;
  /** pysssss の上書きを丸ごと書く */
  readonly saveOverrides: (
    baseUrl: string,
    overrides: readonly TagEntry[],
    options?: RequestOptions,
  ) => Promise<void>;
  /** 辞書のファイルを消す */
  readonly removeDictionary: (
    baseUrl: string,
    name: string,
    options?: RequestOptions,
  ) => Promise<void>;
}
