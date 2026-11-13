import type { NodeDefinition, NodeDefinitionMap } from '@/graph/types';

// ─────────────────────────────
// ノード検索の索引。ノード定義だけで決まる下ごしらえを、定義の入れ物ごとに 1 回だけ作って覚える。
// ─────────────────────────────

/** ノードの出どころ（本体・カスタムノード・パートナーノード） */
type Section = 'core' | 'custom' | 'partner';

/** 1 つのノード定義の下ごしらえ */
export interface IndexedDefinition {
  readonly name: string;
  readonly displayName: string;
  readonly category: string;
  /** 小文字にした名前・表示名・分類（検索で比べる） */
  readonly lowerName: string;
  readonly lowerDisplay: string;
  readonly lowerCategory: string;
  /** 分類の木での道のり（出どころ＋分類の段）。`[core, image, upscaling]` */
  readonly path: readonly string[];
  /** 道のりの段ごとの鍵（`core` / `core/image` / `core/image/upscaling`） */
  readonly keys: readonly string[];
  /** 入力・出力の口の型（カンマで並べた型は 1 つずつに分けたもの） */
  readonly inputTypes: ReadonlySet<string>;
  readonly outputTypes: ReadonlySet<string>;
  /** 口の数。`*` での絞り込みは口が 1 つでもあれば合う */
  readonly inputCount: number;
  readonly outputCount: number;
  /** 表示名の並び（`localeCompare` の順）。同じ順位の並べ替えに使う */
  readonly alphabetical: number;
}

/** 絞り込みの無い分類の木の材料（件数・段の名前・子の鍵） */
interface TreeTally {
  readonly counts: ReadonlyMap<string, number>;
  readonly labels: ReadonlyMap<string, string>;
  readonly byParent: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * 定義の入れ物 1 つの索引。下ごしらえは 2,000 件超の定義ごとに文字列を分けて鍵を組み立てるので、
 * 開くたびに作ると数 ms かかる。開いているワークフローと利用頻度の表は引くたびに変わるので入れない。
 * 定義そのものは持たない（名前だけ）ので、選択肢を取り直した入れ物へも引き継げる。
 */
export interface SearchIndex {
  /** 定義の並び（入れ物の順） */
  readonly entries: readonly IndexedDefinition[];
  readonly byName: ReadonlyMap<string, IndexedDefinition>;
  /** 分類の鍵ごとの、その項目とその下位にある定義 */
  readonly byKey: ReadonlyMap<string, readonly IndexedDefinition[]>;
  /** 選べるスロット型（重複なし・名前順。選択肢 COMBO は除く） */
  readonly slotTypes: readonly string[];
  /** 名前も絞り込みも無いときの分類の木 */
  readonly tally: TreeTally;
}

/**
 * 型をカンマで並べた口（`MESH,FILE_3D` など）の、1 つずつの型。
 * 本体はこの口を「どれかに合えば繋がる」として扱う
 */
export function typeMembers(type: string): string[] {
  return type
    .split(',')
    .map((member) => member.trim())
    .filter((member) => member.length > 0);
}

/** ノード定義の出どころを、定義の `module` の先頭の段から決める */
function sectionOf(definition: NodeDefinition): Section {
  const head = definition.module.split('.')[0] ?? '';
  if (head === 'nodes' || head === 'comfy_extras') return 'core';
  if (head === 'comfy_api_nodes') return 'partner';
  return 'custom';
}

function membersOf(slots: readonly { readonly type: string }[]): Set<string> {
  const found = new Set<string>();
  for (const slot of slots) for (const member of typeMembers(slot.type)) found.add(member);
  return found;
}

/** 道のりの段ごとの鍵を数え、段の名前と子の鍵を覚える */
export function addToTally(
  path: readonly string[],
  counts: Map<string, number>,
  labels: Map<string, string>,
  byParent: Map<string, Set<string>>,
): void {
  let parent = '';
  for (const part of path) {
    const key = parent === '' ? part : `${parent}/${part}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    labels.set(key, part);
    byParent.set(parent, (byParent.get(parent) ?? new Set()).add(key));
    parent = key;
  }
}

function buildIndex(definitions: NodeDefinitionMap): SearchIndex {
  const drafts: Omit<IndexedDefinition, 'alphabetical'>[] = [];
  const slotTypes = new Set<string>();

  for (const definition of definitions.values()) {
    const path = [
      sectionOf(definition),
      ...definition.category.split('/').filter((part) => part.length > 0),
    ];
    const keys = path.map((_, index) => path.slice(0, index + 1).join('/'));
    const inputTypes = membersOf(definition.inputs);
    const outputTypes = membersOf(definition.outputs);
    for (const type of inputTypes) slotTypes.add(type);
    for (const type of outputTypes) slotTypes.add(type);

    drafts.push({
      name: definition.name,
      displayName: definition.displayName,
      category: definition.category,
      lowerName: definition.name.toLowerCase(),
      lowerDisplay: definition.displayName.toLowerCase(),
      lowerCategory: definition.category.toLowerCase(),
      path,
      keys,
      inputTypes,
      outputTypes,
      inputCount: definition.inputs.length,
      outputCount: definition.outputs.length,
    });
  }

  const order = drafts
    .map((draft, position) => ({ draft, position }))
    .sort((a, b) => a.draft.displayName.localeCompare(b.draft.displayName));
  const rankOf = new Map(order.map((item, rank) => [item.position, rank]));
  const entries = drafts.map((draft, position): IndexedDefinition => ({
    ...draft,
    alphabetical: rankOf.get(position) ?? 0,
  }));

  const byKey = new Map<string, IndexedDefinition[]>();
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  const byParent = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const key of entry.keys) {
      const list = byKey.get(key);
      if (list) list.push(entry);
      else byKey.set(key, [entry]);
    }
    addToTally(entry.path, counts, labels, byParent);
  }

  slotTypes.delete('COMBO');
  slotTypes.delete('');

  return {
    entries,
    byName: new Map(entries.map((entry) => [entry.name, entry])),
    byKey,
    slotTypes: [...slotTypes].sort((a, b) => a.localeCompare(b)),
    tally: { counts, labels, byParent },
  };
}

const indexes = new WeakMap<NodeDefinitionMap, SearchIndex>();

/** 定義の入れ物の索引。無ければ作って覚える（ノード定義を取得したときに一度呼んでおく） */
export function searchIndexOf(definitions: NodeDefinitionMap): SearchIndex {
  const found = indexes.get(definitions);
  if (found) return found;
  const index = buildIndex(definitions);
  indexes.set(definitions, index);
  return index;
}

/**
 * 選択肢だけを取り直して作り直した入れ物へ、索引を引き継ぐ（名前・分類・型は変わらない）。
 * 前の入れ物の索引がまだ無ければ何もしない（次に引いたときに作る）
 */
export function carrySearchIndex(from: NodeDefinitionMap, to: NodeDefinitionMap): void {
  const index = indexes.get(from);
  if (index && !indexes.has(to)) indexes.set(to, index);
}
