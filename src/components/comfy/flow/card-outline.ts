import { groupSortId } from '@/components/comfy/flow/flow-dnd';
import type { GroupLabel } from '@/graph/groups';
import type { DropSide } from '@/graph/order-move';
import type { NodeId } from '@/graph/types';

// ─────────────────────────────
// カードの列の組み立てと、ドラッグ中の置き直し（見た目だけで、ワークフローは落としたときに変わる）。
// ─────────────────────────────

/** カードの列の 1 つ。カード 1 枚か、グループ 1 つ（中は直下の並び。子のグループも入る） */
export type OutlineEntry =
  | { readonly kind: 'card'; readonly id: NodeId }
  | {
      readonly kind: 'group';
      readonly label: GroupLabel;
      readonly entries: readonly OutlineEntry[];
    };

/** 列の 1 つの鍵（カードはノード id の文字列、グループは `groupSortId`） */
export function entryKey(entry: OutlineEntry): string {
  return entry.kind === 'card' ? String(entry.id) : groupSortId(entry.label.key);
}

/** 並べ替えの id（カードはノード id、グループは `groupSortId`） */
export function entrySortId(entry: OutlineEntry): NodeId | string {
  return entry.kind === 'card' ? entry.id : entryKey(entry);
}

/** 中のカードの id 全部（子のグループの中も）。並びの順 */
export function entryCardIds(entry: OutlineEntry): NodeId[] {
  return entry.kind === 'card' ? [entry.id] : entry.entries.flatMap(entryCardIds);
}

/**
 * ドラッグ中に、掴んだもの（カードの id か、グループの鍵）を落とす先へ置き直して見せる指定。
 * `group` は入る枠の鍵（null なら外の列）。`beside` は隣に置く相手（カードの id か、
 * グループの鍵）、`side` はその前か後ろ
 */
export interface DragPreview {
  readonly id: NodeId | { readonly group: string };
  readonly group: string | null;
  readonly beside: NodeId | { readonly group: string };
  readonly side: DropSide;
}

type SortKey = DragPreview['id'];

function sameKey(entry: OutlineEntry, key: SortKey): boolean {
  return typeof key === 'number'
    ? entry.kind === 'card' && entry.id === key
    : entry.kind === 'group' && entry.label.key === key.group;
}

/** `at` の位置へ入れた並び */
function insertAt<T>(items: readonly T[], at: number, item: T): T[] {
  return [...items.slice(0, at), item, ...items.slice(at)];
}

/** 掴んだものを抜いた並び（入れ子の中も）と、抜いたもの。抜けた枠は空でも残す */
function without(
  entries: readonly OutlineEntry[],
  key: SortKey,
): { readonly entries: readonly OutlineEntry[]; readonly taken: OutlineEntry | null } {
  let taken: OutlineEntry | null = null;
  let changed = false;
  const kept = entries.flatMap((entry): OutlineEntry[] => {
    if (taken === null && sameKey(entry, key)) {
      taken = entry;
      changed = true;
      return [];
    }
    if (entry.kind === 'card' || taken !== null) return [entry];
    const inner = without(entry.entries, key);
    if (inner.taken === null) return [entry];
    taken = inner.taken;
    changed = true;
    return [{ ...entry, entries: inner.entries }];
  });
  return { entries: changed ? kept : entries, taken };
}

/** 入れる物と入れる所（`beside` の前なら offset 0、後ろなら 1） */
interface Placement {
  readonly beside: SortKey;
  readonly offset: number;
  readonly item: OutlineEntry;
}

/** `group`（null なら外の列）の中で、`beside` の前か後ろへ入れた並び。相手が無ければ null */
function inserted(
  entries: readonly OutlineEntry[],
  group: string | null,
  placement: Placement,
): readonly OutlineEntry[] | null {
  if (group === null) {
    const at = entries.findIndex((entry) => sameKey(entry, placement.beside));
    return at < 0 ? null : insertAt(entries, at + placement.offset, placement.item);
  }
  for (const [index, entry] of entries.entries()) {
    if (entry.kind === 'card') continue;
    const inner =
      entry.label.key === group
        ? inserted(entry.entries, null, placement)
        : inserted(entry.entries, group, placement);
    if (inner === null) continue;
    return entries.map((other, at) => (at === index ? { ...entry, entries: inner } : other));
  }
  return null;
}

/**
 * 掴んだものを置き直した並び。相手が見つからなければ置き直さない。
 * 抜けた枠は空のまま残す（落とすまでグループは消えない）
 */
export function withPreview(
  outline: readonly OutlineEntry[],
  preview: DragPreview | null,
): readonly OutlineEntry[] {
  if (preview === null) return outline;
  const { id, group, beside, side } = preview;
  const removed = without(outline, id);
  if (removed.taken === null) return outline;
  const offset = side === 'after' ? 1 : 0;
  // グループを自分の中へは置けない（抜いた並びに入る先が無いので見つからない）
  return inserted(removed.entries, group, { beside, offset, item: removed.taken }) ?? outline;
}

// ─────────────────────────────
// キーボードでの落とす先。位置ではなく並びで数える（位置で次の相手を探すと、背の高いカードを
// 飛ばしたり、枠の先頭に止まれなかったりする）。
// ─────────────────────────────

/** 置き直す前の並び。外の列（カードとグループ）と、枠ごとの直下の並び（子のグループも入る） */
export interface SortLists {
  readonly outer: readonly SortKey[];
  readonly members: ReadonlyMap<string, readonly SortKey[]>;
}

/**
 * 上から順の落とす先と、元の場所の番号（`slots[home]` は null＝置き直さない）。
 * どの列も各段の前と末尾に止まり、枠の前に止まったあとは枠の中へ入って同じく止まる
 * （入れ子の枠も同じ。グループを掴んでいれば、自分の枠の中には入らない）
 */
export function keyboardSlots(
  lists: SortLists,
  id: SortKey,
): { readonly slots: readonly (DragPreview | null)[]; readonly home: number } {
  const isSelf = (key: SortKey): boolean =>
    typeof key === 'number' ? key === id : typeof id !== 'number' && key.group === id.group;
  const slots: (DragPreview | null)[] = [];
  let home = -1;
  const place = (preview: DragPreview | null, self: boolean): void => {
    if (self) home = slots.length;
    slots.push(self ? null : preview);
  };

  const walk = (group: string | null, all: readonly SortKey[]): void => {
    const items = all.filter((key) => !isSelf(key));
    const selfAt = all.findIndex(isSelf);
    // 掴んだものしか居ない枠は、元の場所としてだけ数える（空の枠へは置けない）
    if (items.length === 0) {
      if (selfAt >= 0) place(null, true);
      return;
    }
    for (let i = 0; i <= items.length; i++) {
      const entry = items[i];
      const beside = entry ?? items[items.length - 1];
      if (beside === undefined) continue;
      const side = entry === undefined ? 'after' : 'before';
      place({ id, group, beside, side }, i === selfAt);
      if (entry !== undefined && typeof entry !== 'number') {
        walk(entry.group, lists.members.get(entry.group) ?? []);
      }
    }
  };
  walk(null, lists.outer);
  return { slots, home };
}
