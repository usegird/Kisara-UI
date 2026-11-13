import {
  addToTally,
  searchIndexOf,
  typeMembers,
  type IndexedDefinition,
  type SearchIndex,
} from '@/graph/search-index';
import type { NodeDefinition, NodeDefinitionMap } from '@/graph/types';
import { t, type MessageKey } from '@/i18n';
import {
  compareSearchRank,
  loweredSearchRank,
  searchQuery,
  type SearchRank,
} from '@/lib/search-terms';

// ─────────────────────────────
// ノード検索の絞り込み・並べ替えと左の分類の木。定義は 2,000 件超あるため、純関数に切り出して
// 上限件数だけ返す。
// ─────────────────────────────

/** 一度に出す候補の数。本体の Most relevant の上位件数と同じ */
const MAX_RESULTS = 64;

/** 何にでも繋がるスロット（ComfyUI のワイルドカード） */
const ANY_TYPE = '*';

/**
 * 名前の一致とは別に掛ける絞り込み（分類・受けられる型・出せる型）。入力・出力の型は、何にでも
 * 繋がるスロット（`*`）も合うものとして数える
 */
export interface SearchFilters {
  /** 左の分類の木で選んだ項目（`CategoryNode.key`）。下位も含む。空なら絞らない */
  readonly group: string;
  /** この型を受けられるノードだけ。空なら絞らない */
  readonly input: string;
  /** この型を出せるノードだけ。空なら絞らない */
  readonly output: string;
  /** 入力・出力の型の一致に、何にでも繋がるスロット（`*`）を含めるか。既定は含める */
  readonly anyType: boolean;
}

/** 何も絞らないとき */
export const NO_FILTERS: SearchFilters = {
  group: '',
  input: '',
  output: '',
  anyType: true,
};

/** 何か 1 つでも絞り込みを掛けているか */
export function hasFilters(filters: SearchFilters): boolean {
  return filters.group !== '' || filters.input !== '' || filters.output !== '' || !filters.anyType;
}

export { typeMembers };

/**
 * そのスロットの型が絞り込みの型に合うか。カンマで並べた型は、どれかが合えば合う。
 * `anyType` なら、何にでも繋がるスロット（`*`）と `*` での絞り込みもどれにでも合う
 */
export function slotTypeMatches(slotType: string, type: string, anyType: boolean): boolean {
  const slot = typeMembers(slotType);
  const wanted = typeMembers(type);
  if (slot.some((member) => wanted.includes(member))) return true;
  return anyType && (slot.includes(ANY_TYPE) || wanted.includes(ANY_TYPE));
}

/** 開いているワークフローにあるノードの種類（`class_type`）。「現在使用中」に使う */
type UsedTypes = ReadonlySet<string>;

/** 分類の木の、定義の外から決まる項目の材料 */
interface GroupContext {
  /** 現在使用中に入れる種類 */
  readonly used: UsedTypes;
  /** ノードの利用頻度の表（ノード名、多い順）。空ならよく使うものを出さない */
  readonly frequency: readonly string[];
}

/** 現在使用中もよく使うものも無いとき */
const NO_GROUP_CONTEXT: GroupContext = { used: new Set(), frequency: [] };

/**
 * 定義の外から決まる項目に入る種類。よく使うものは、名前も型も絞っていなければ頻度の上位、
 * 絞っていれば一致したもの全部（`all`。本体の Most relevant と同じ）
 */
interface GroupMembers {
  readonly used: UsedTypes;
  readonly frequent: ReadonlySet<string> | 'all';
}

const NO_MEMBERS: GroupMembers = { used: new Set(), frequent: new Set() };

/** よく使うものの上位の件数（本体の Most relevant と同じ） */
const FREQUENT_LIMIT = 64;

function groupMembers(
  definitions: NodeDefinitionMap,
  terms: readonly string[],
  filters: SearchFilters,
  { used, frequency }: GroupContext,
): GroupMembers {
  if (frequency.length === 0) return { used, frequent: NO_MEMBERS.frequent };
  if (terms.length > 0 || filters.input !== '' || filters.output !== '') {
    return { used, frequent: 'all' };
  }

  const top = new Set<string>();
  for (const name of frequency) {
    if (top.size >= FREQUENT_LIMIT) break;
    if (definitions.has(name)) top.add(name);
  }
  return { used, frequent: top };
}

/**
 * 選べるスロット型（重複なし・名前順）。
 * 選択肢そのもの（COMBO）は繋ぐ型ではないので外す。定義ごとに一度だけ集める（索引）
 */
export function slotTypesOf(definitions: NodeDefinitionMap): string[] {
  return [...searchIndexOf(definitions).slotTypes];
}

/** 検索の絞り込み・分類の材料・件数の上限 */
interface SearchOptions {
  readonly filters?: SearchFilters | undefined;
  /** 現在使用中・よく使うものの材料 */
  readonly context?: GroupContext | undefined;
  readonly limit?: number | undefined;
}

function termScore(entry: IndexedDefinition, term: string): number {
  if (entry.lowerDisplay.startsWith(term) || entry.lowerName.startsWith(term)) return 0;
  if (entry.lowerDisplay.includes(term) || entry.lowerName.includes(term)) return 1;
  if (entry.lowerCategory.includes(term)) return 2;
  return -1;
}

/** 語のどれかに一致すれば残す（OR）。度合いは最もよく一致した語で決める。-1 は不一致 */
function score(entry: IndexedDefinition, terms: readonly string[]): number {
  let best = -1;
  for (const term of terms) {
    const rank = termScore(entry, term);
    if (rank >= 0 && (best < 0 || rank < best)) best = rank;
  }
  return best;
}

/** 索引の型の集まりで、口のどれかが絞り込みの型に合うか（`slotTypeMatches` と同じ判定） */
function hasIndexedType(
  types: ReadonlySet<string>,
  slotCount: number,
  type: string,
  anyType: boolean,
): boolean {
  const wanted = typeMembers(type);
  if (wanted.some((member) => types.has(member))) return true;
  return anyType && (types.has(ANY_TYPE) || (slotCount > 0 && wanted.includes(ANY_TYPE)));
}

function matchesTypes(entry: IndexedDefinition, filters: SearchFilters): boolean {
  if (
    filters.input !== '' &&
    !hasIndexedType(entry.inputTypes, entry.inputCount, filters.input, filters.anyType)
  ) {
    return false;
  }
  return (
    filters.output === '' ||
    hasIndexedType(entry.outputTypes, entry.outputCount, filters.output, filters.anyType)
  );
}

/** 選んだ分類に入る定義。分類で選んでいなければ全部 */
function candidatesOf(
  index: SearchIndex,
  group: string,
  members: GroupMembers,
): readonly IndexedDefinition[] {
  const named = (names: Iterable<string>): IndexedDefinition[] =>
    [...names].flatMap((name) => index.byName.get(name) ?? []);

  if (group === '') return index.entries;
  if (group === FREQUENT) {
    return members.frequent === 'all' ? index.entries : named(members.frequent);
  }
  if (group === 'used') return named(members.used);
  return index.byKey.get(group) ?? [];
}

/** 口ごとの型を `, ` で並べる。1 つの口が受ける複数の型は `|` でつなぎ、口の区切りと分ける */
function uniqueTypes(slots: readonly { readonly type: string }[]): string {
  const types = slots.map((slot) => typeMembers(slot.type).join('|')).filter((type) => type !== '');
  return [...new Set(types)].join(', ');
}

/** 候補の行に出す分類。最上位の 1 つだけ（`model/sampling` → `model`） */
export function topCategory(definition: NodeDefinition): string {
  return definition.category.split('/')[0] ?? '';
}

/** 候補の行に出す型。入力は線を受ける口だけ（パラメータは除く）。無ければ空 */
export function slotSummary(definition: NodeDefinition): {
  readonly inputs: string;
  readonly outputs: string;
} {
  return {
    inputs: uniqueTypes(definition.inputs.filter((input) => !input.isWidget)),
    outputs: uniqueTypes(definition.outputs),
  };
}

/** 名前の一致と絞り込みで候補を選び、一致の度合いの順に上限件数まで返す */
export function searchDefinitions(
  definitions: NodeDefinitionMap,
  query: string,
  { filters = NO_FILTERS, context = NO_GROUP_CONTEXT, limit = MAX_RESULTS }: SearchOptions = {},
): NodeDefinition[] {
  const index = searchIndexOf(definitions);
  const wanted = searchQuery(query);
  const members = groupMembers(definitions, wanted.terms, filters, context);
  const scored: { entry: IndexedDefinition; rank: number; order: SearchRank }[] = [];

  for (const entry of candidatesOf(index, filters.group, members)) {
    if (!matchesTypes(entry, filters)) continue;

    const rank = wanted.terms.length === 0 ? 0 : score(entry, wanted.terms);
    if (rank < 0) continue;

    // 前方一致（入力全体）→ 当たった語の数を先に見る
    const order = loweredSearchRank(wanted, {
      names: [entry.lowerDisplay, entry.lowerName],
      texts: [entry.lowerDisplay, entry.lowerName, entry.lowerCategory],
    });
    scored.push({ entry, rank, order });
  }

  // よく使うものは一致の度合いの次に頻度の順（本体の Most relevant に倣う）
  const often = filters.group === FREQUENT ? frequencyRank(context.frequency) : null;
  const byFrequency = (entry: IndexedDefinition): number =>
    often?.get(entry.name) ?? Number.MAX_SAFE_INTEGER;

  return scored
    .sort(
      (a, b) =>
        compareSearchRank(a.order, b.order) ||
        a.rank - b.rank ||
        byFrequency(a.entry) - byFrequency(b.entry) ||
        a.entry.alphabetical - b.entry.alphabetical,
    )
    .slice(0, limit)
    .flatMap((item) => definitions.get(item.entry.name) ?? []);
}

// ─────────────────────────────
// 左の分類の木（本体のノード一覧に倣う。「すべて」は呼び出し側が置く）。項目の key は段を `/` で
// つないだもの（`custom/KJNodes/image`。本体は `core/model`）。
// ─────────────────────────────

/** よく使うものの key */
const FREQUENT = 'frequent';

/** 段の見出しの鍵の道筋。引くのは木を組むとき（読み込んだ時点では言語が決まっていない） */
const GROUP_LABELS = {
  [FREQUENT]: 'graph.search.groups.frequent',
  used: 'graph.search.groups.used',
  custom: 'graph.search.groups.custom',
  partner: 'graph.search.groups.partner',
} as const satisfies Record<string, MessageKey>;

function frequencyRank(frequency: readonly string[]): Map<string, number> {
  return new Map(frequency.map((name, index) => [name, index]));
}

/** そのノードが木のどこに入るか（段の並び）。よく使うもの・現在使用中の分だけ増える */
function groupPaths(
  path: readonly string[],
  name: string,
  members: GroupMembers,
): (readonly string[])[] {
  const paths: (readonly string[])[] = [path];
  if (members.frequent === 'all' || members.frequent.has(name)) paths.push([FREQUENT]);
  if (members.used.has(name)) paths.push(['used']);
  return paths;
}

/** 分類の木の項目 1 つ */
export interface CategoryNode {
  /** 段を `/` でつないだ道のり（`core/image/upscaling`） */
  readonly key: string;
  /** 最後の段の名前 */
  readonly label: string;
  /** この項目とその下位にある、絞り込みを掛けたあとのノードの数 */
  readonly count: number;
  readonly children: readonly CategoryNode[];
}

/** 左の分類の木全体（「すべて」の数と、その上と下に置く項目） */
interface GroupTree {
  /** 「すべて」の数 */
  readonly total: number;
  /** 「すべて」の上に置くもの（よく使うもの・現在使用中）。0 件のものは出さない */
  readonly leading: readonly CategoryNode[];
  /** 「すべて」の下に置くもの（本体の分類・カスタムノード・パートナーノード） */
  readonly nodes: readonly CategoryNode[];
}

/** よく使うものが出せるなら、開いたときにそれを選んでおく（本体の Most relevant と同じ） */
export function defaultGroup(context: GroupContext): string {
  return context.frequency.length > 0 ? FREQUENT : '';
}

/**
 * 左の分類の木。件数は**名前の一致と、分類以外の絞り込み**を掛けたあとの数
 * （分類で絞ると他の項目が 0 になり、選び直す手掛かりが無くなるため）。
 * 分類の下はノード数の多い順（同数は名前順）
 */
export function groupTree(
  definitions: NodeDefinitionMap,
  query: string,
  filters: SearchFilters = NO_FILTERS,
  context: GroupContext = NO_GROUP_CONTEXT,
): GroupTree {
  const index = searchIndexOf(definitions);
  const { terms } = searchQuery(query);
  const members = groupMembers(definitions, terms, filters, context);

  // 名前も型も絞っていなければ、本体・カスタム・パートナーの木は索引のまま使える。
  // よく使うもの・現在使用中だけを数える
  if (terms.length === 0 && filters.input === '' && filters.output === '') {
    const count = (names: ReadonlySet<string> | 'all'): number =>
      names === 'all'
        ? index.entries.length
        : [...names].filter((name) => index.byName.has(name)).length;
    const lead = (key: typeof FREQUENT | 'used', size: number): CategoryNode[] =>
      size > 0 ? [{ key, label: t(GROUP_LABELS[key]), count: size, children: [] }] : [];
    return {
      total: index.entries.length,
      leading: [...lead(FREQUENT, count(members.frequent)), ...lead('used', count(members.used))],
      nodes: plainNodes(index),
    };
  }

  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  const byParent = new Map<string, Set<string>>();
  let total = 0;

  for (const entry of index.entries) {
    if (!matchesTypes(entry, filters)) continue;
    if (terms.length > 0 && score(entry, terms) < 0) continue;

    total += 1;
    for (const path of groupPaths(entry.path, entry.name, members)) {
      addToTally(path, counts, labels, byParent);
    }
  }

  return treeOf({ counts, labels, byParent }, total);
}

interface Tally {
  readonly counts: ReadonlyMap<string, number>;
  readonly labels: ReadonlyMap<string, string>;
  readonly byParent: ReadonlyMap<string, ReadonlySet<string>>;
}

function treeOf({ counts, labels, byParent }: Tally, total: number): GroupTree {
  const label = (key: string): string => labels.get(key) ?? key;
  const node = (key: string): CategoryNode => ({
    key,
    label: label(key),
    count: counts.get(key) ?? 0,
    children: build(key),
  });
  const build = (parent: string): CategoryNode[] =>
    [...(byParent.get(parent) ?? [])]
      .sort(
        (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || label(a).localeCompare(label(b)),
      )
      .map(node);

  const section = (key: keyof typeof GROUP_LABELS): CategoryNode[] =>
    counts.has(key) ? [{ ...node(key), label: t(GROUP_LABELS[key]) }] : [];

  return {
    total,
    leading: [...section(FREQUENT), ...section('used')],
    nodes: [...build('core'), ...section('custom'), ...section('partner')],
  };
}

/** 絞り込みの無い本体・カスタム・パートナーの木。索引ごとに一度だけ組む */
const plainTrees = new WeakMap<SearchIndex, readonly CategoryNode[]>();

function plainNodes(index: SearchIndex): readonly CategoryNode[] {
  const found = plainTrees.get(index);
  if (found) return found;
  const { nodes } = treeOf(index.tally, index.entries.length);
  plainTrees.set(index, nodes);
  return nodes;
}
