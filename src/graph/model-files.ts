import type { NodeDefinition } from '@/graph/types';
import { toSlashPath, withoutExtension } from '@/lib/file-name';
import { isRecord } from '@/lib/guards';
import { directoryTree, type PathDirectory } from '@/lib/path-tree';
import { matchesAnyTerm, rankBySearch, searchTerms } from '@/lib/search-terms';

// ─────────────────────────────
// モデルファイル一覧（`/experiment/models/{folder}` の射影）の加工と、Lora の写し取りの書式。
// 純関数だけを置く。
// ─────────────────────────────

/** モデルファイル一覧の 1 件 */
export interface ModelFile {
  /** 種別の根からの相対経路。区切りは接続先が返したまま */
  readonly name: string;
  /** 種別が持つ経路の何番目か。プレビュー画像の URL に要る */
  readonly pathIndex: number;
  /** ミリ秒。取れないことがある */
  readonly modified: number | null;
  readonly created: number | null;
  readonly size: number | null;
}

/** カード1枚ぶん。`value` は**選択肢の文字列そのもの**（書き込みに使う） */
export interface ModelItem {
  readonly value: string;
  /** 正規化した相対経路 */
  readonly path: string;
  /** 親ディレクトリ。根なら空文字 */
  readonly directory: string;
  /** 拡張子とディレクトリを除いた名前 */
  readonly label: string;
  /** 一覧に無ければ null（プレビューも日時も出せない） */
  readonly file: ModelFile | null;
}

/** 左の一覧の 1 段（階層の組み立ては `lib/path-tree`） */
type ModelDirectory = PathDirectory;

/** 並び替えの鍵 */
export type ModelSortKey = 'name' | 'modified' | 'created' | 'size';

const MODEL_SORT_KEYS: readonly ModelSortKey[] = ['name', 'modified', 'created', 'size'];

/**
 * 並び替えの条件。端末に残す
 */
export interface ModelSort {
  readonly key: ModelSortKey;
  readonly ascending: boolean;
}

/** 並び替えの既定（名前の昇順） */
export const DEFAULT_MODEL_SORT: ModelSort = { key: 'name', ascending: true };

/** 残しておいた値を読み直す。知らない並び・壊れた値は既定（名前の昇順）に落とす */
export function normalizeModelSort(value: unknown): ModelSort {
  if (!isRecord(value)) return DEFAULT_MODEL_SORT;

  const known = MODEL_SORT_KEYS.find((candidate) => candidate === value.key);
  return {
    key: known ?? DEFAULT_MODEL_SORT.key,
    ascending:
      typeof value.ascending === 'boolean' ? value.ascending : DEFAULT_MODEL_SORT.ascending,
  };
}

/**
 * 区切りを `/` に揃え、先頭の `./` と余分な区切りを落とす。区切り文字は接続先の環境で揺れる
 * （`\` と `/`）ので、突き合わせと木の組み立ての前に必ず通す
 */
export function normalizeModelName(name: string): string {
  return toSlashPath(name).replace(/^\.\//, '').replace(/\/+/g, '/').replace(/^\/+/, '');
}

/** 拡張子を持つ値だけを突き合わせの対象にする（無効を表す項目を外すため） */
function hasExtension(value: string): boolean {
  const base = normalizeModelName(value).split('/').pop() ?? '';
  return /\.[^.]+$/.test(base);
}

function baseLabel(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.[^.]+$/, '');
}

function directoryOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
}

/** 正規化した名前で引ける索引。同じ名前が重なったら先に来たものを残す */
export function modelFileIndex(files: readonly ModelFile[]): ReadonlyMap<string, ModelFile> {
  const index = new Map<string, ModelFile>();

  for (const file of files) {
    const key = normalizeModelName(file.name);
    if (!index.has(key)) index.set(key, file);
  }
  return index;
}

/**
 * その選択肢が種別のディレクトリを参照しているか。ノード名ではなく、選択肢の値と一覧を
 * 突き合わせて決める（接続先のノード構成に依存しないため）。
 * **拡張子を持つ選択肢がすべて一覧にある**ときだけ true。一覧が空なら false
 * （経路を持たない接続先では通常の選択肢のまま出す）。
 */
export function isModelFolderOptions(
  options: readonly unknown[] | null,
  index: ReadonlyMap<string, ModelFile>,
): boolean {
  if (options === null || index.size === 0) return false;

  let candidates = 0;
  for (const option of options) {
    if (typeof option !== 'string' || !hasExtension(option)) continue;

    candidates += 1;
    if (!index.has(normalizeModelName(option))) return false;
  }
  return candidates > 0;
}

/** 選択肢を並びの元にし、一覧の情報を付ける。一覧に無い選択肢も落とさない */
export function buildModelItems(
  options: readonly unknown[],
  index: ReadonlyMap<string, ModelFile>,
): ModelItem[] {
  const items: ModelItem[] = [];

  for (const option of options) {
    if (typeof option !== 'string' || option.length === 0) continue;

    const path = normalizeModelName(option);
    items.push({
      value: option,
      path,
      directory: directoryOf(path),
      label: baseLabel(path),
      file: index.get(path) ?? null,
    });
  }
  return items;
}

/** ディレクトリの木。親が先に並び、件数はその下すべてを合わせたもの */
export function modelDirectories(items: readonly ModelItem[]): ModelDirectory[] {
  return directoryTree(items.map((item) => item.directory));
}

/** モデルの一覧の絞り込みの条件 */
interface ModelFilter {
  /** 空文字なら全部。指定するとその下（入れ子を含む）だけ */
  readonly directory: string;
  /** 経路を含む名前の部分一致。大文字小文字は無視する。空白で区切った語は OR */
  readonly query: string;
}

/** 選んだディレクトリの下にあり、入力の語に合うモデル */
export function filterModelItems(
  items: readonly ModelItem[],
  filter: ModelFilter,
): readonly ModelItem[] {
  const terms = searchTerms(filter.query);
  const prefix = filter.directory.length === 0 ? null : `${filter.directory}/`;

  return items.filter((item) => {
    if (prefix !== null && !item.path.startsWith(prefix)) return false;
    return matchesAnyTerm(item.path, terms);
  });
}

/**
 * 絞り込みの入力で並べ直す。前方一致はディレクトリを除いた名前か経路、
 * 語は経路から探す。同じ順位は並び替えの指定のまま
 */
export function rankModelItems(items: readonly ModelItem[], query: string): ModelItem[] {
  return rankBySearch(items, query, (item) => ({
    names: [item.label, item.path],
    texts: [item.path],
  }));
}

function sortValue(item: ModelItem, key: ModelSortKey): number | null {
  if (key === 'modified') return item.file?.modified ?? null;
  if (key === 'created') return item.file?.created ?? null;
  return item.file?.size ?? null;
}

/**
 * 並べ替え。日時と大きさは一覧に無いことがあるので、**取れないものは名前の順**に落とす
 * （常に後ろへ送ると、一覧を持たない接続先で並びが崩れて見える）。
 */
export function sortModelItems(
  items: readonly ModelItem[],
  key: ModelSortKey,
  ascending: boolean,
): readonly ModelItem[] {
  const byName = (left: ModelItem, right: ModelItem): number => left.path.localeCompare(right.path);
  const direction = ascending ? 1 : -1;

  return [...items].sort((left, right) => {
    if (key === 'name') return byName(left, right) * direction;

    const leftValue = sortValue(left, key);
    const rightValue = sortValue(right, key);
    if (leftValue === null || rightValue === null) return byName(left, right);

    return leftValue === rightValue ? byName(left, right) : (leftValue - rightValue) * direction;
  });
}

/**
 * モデルを選ぶ選択肢の入力名。置いたときに空にしておく（先頭のファイルを勝手に選ばない）。
 * 選択肢が未取得なら判定できないので含めない
 */
export function modelInputNames(
  definition: NodeDefinition,
  indexes: ReadonlyMap<string, ReadonlyMap<string, ModelFile>>,
): Set<string> {
  return new Set(
    definition.inputs
      .filter(
        (input) => input.type === 'COMBO' && matchModelFolder(input.options, indexes) !== null,
      )
      .map((input) => input.name),
  );
}

/**
 * その選択肢がどの種別を参照しているか。**先に合った種別**を返し、どれとも合わなければ null。
 * 種別ごとの一覧は互いに重ならないので、全部が入っている側を 1 つだけ選べる。
 */
export function matchModelFolder(
  options: readonly unknown[] | null,
  indexes: ReadonlyMap<string, ReadonlyMap<string, ModelFile>>,
): string | null {
  for (const [folder, index] of indexes) {
    if (isModelFolderOptions(options, index)) return folder;
  }
  return null;
}

// ─────────────────────────────
// Lora の写し取り。書式は利用者が決める 1 行の文字で、`[loraname]`・`[learntext]`・`[memo]` を置き換える。
// ─────────────────────────────

/** 写し取りの既定の書式 */
export const DEFAULT_LORA_COPY_FORMAT = '<lora:[loraname]:1> [learntext]';

const LORA_NAME = '[loraname]';
const LEARN_TEXT = '[learntext]';
const MEMO = '[memo]';

/** 保存値を書式に直す。文字でない・空白だけなら既定 */
function normalizeLoraCopyFormat(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : DEFAULT_LORA_COPY_FORMAT;
}

/** 学習で多かった語を使う書式か（使うときだけ metadata を取りに行く） */
export function usesLearnText(format: string): boolean {
  return normalizeLoraCopyFormat(format).includes(LEARN_TEXT);
}

/** メモ（同名の `.txt`）を使う書式か（使うときだけメモを取りに行く） */
export function usesMemo(format: string): boolean {
  return normalizeLoraCopyFormat(format).includes(MEMO);
}

/** 接続先から取りに行くものを含む書式か（含まなければその場で作れる） */
export function usesFetchedParts(format: string): boolean {
  return usesLearnText(format) || usesMemo(format);
}

/**
 * プロンプトに書く Lora の名前。**選択肢の値から拡張子を除いたもの**で、ディレクトリは残す
 * （Impact Pack の `<lora:…>` と同じ読み方）
 */
function loraName(value: string): string {
  return withoutExtension(value);
}

/**
 * 書式に当てはめる。空になった置き換えの前後の空白は詰める。
 * メモは前後の空白・改行を落として入れる（中の改行は残す）
 */
export function formatLoraCopy(
  format: string,
  value: string,
  learned: readonly string[],
  memo = '',
): string {
  const learnText = learned.join(', ');
  const memoText = memo.trim();
  const text = normalizeLoraCopyFormat(format)
    .split(LORA_NAME)
    .join(loraName(value))
    .split(LEARN_TEXT)
    .join(learnText)
    .split(MEMO)
    .join(memoText);
  const emptied = learnText.length === 0 || memoText.length === 0;
  return emptied ? text.replace(/ {2,}/gu, ' ').trim() : text;
}

// 種別名は ComfyUI の `folder_paths` が持つ名前。ノード名ではないので分岐に使ってよい。
// カードで選ばせる種別を増やすときは**この並びだけ**を足す。

/** Lora の種別名 */
export const LORA_FOLDER = 'loras';
/** チェックポイントの種別名 */
export const CHECKPOINT_FOLDER = 'checkpoints';

/**
 * 履歴でモデルの区分を見分けるためだけに読む種別。カードで選ばせる
 * 種別には入れない（入れるとモデルを選ぶ画面の動きが変わる）
 */
export const DIFFUSION_MODEL_FOLDER = 'diffusion_models';

/** カードで選ばせる種別。並びは突き合わせを試す順 */
export const MODEL_FOLDERS: readonly string[] = [LORA_FOLDER, CHECKPOINT_FOLDER];
