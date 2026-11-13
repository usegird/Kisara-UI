import { fixedLayoutOf } from '@/graph/fixed-layout';
import { DEFAULT_ORDER_LAYOUT, rectOf, type OrderLayout } from '@/graph/node-box';
import type { NodeId, Workflow } from '@/graph/types';
import { lastGroupIdOf } from '@/graph/workflow-ids';
import { isRecord, isUnknownArray } from '@/lib/guards';

// ─────────────────────────────
// グループの顔ぶれ・親子（枠を求め直すのは group-bounds.ts）。本体の `groups[]` をそのまま使い、所属も親子も位置から読む
// （並べ直すたびに枠をメンバーの箱から求め直すので、位置を通して顔ぶれを持ち越せる）。
// ─────────────────────────────

/**
 * ノード → 属するグループ（`groups[]` の添字。いちばん内側）。添字で指すのは、`id` を持たない
 * 古い形があるため
 */
export type Membership = ReadonlyMap<NodeId, number>;

/** グループ → 親のグループ（`groups[]` の添字）。外の階層のグループは載らない */
export type GroupParents = ReadonlyMap<number, number>;

/** 親の無いとき（毎回同じものを使う） */
export const NO_PARENTS: GroupParents = new Map();

const DEFAULT_TITLE = 'Group';
/** `groups[]`。無い・配列でなければ空 */
export function workflowGroups(workflow: Workflow): readonly unknown[] {
  return isUnknownArray(workflow.groups) ? workflow.groups : [];
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** グループの枠。形が合わなければ null */
export function boundingOf(group: unknown): Rect | null {
  if (!isRecord(group) || !isUnknownArray(group.bounding)) return null;
  const [x, y, width, height] = group.bounding;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return null;
  }
  return { x, y, width, height };
}

function contains(rect: Rect, px: number, py: number): boolean {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}

/**
 * 位置から読む所属（本体と同じく、見出しを含む箱の中央が枠の中）。中央が複数の枠に入るときは
 * 面積の小さい枠（内側）にだけ属する。
 * @param exclude - 数えないノード（足したばかりで、まだ置いていないノード）
 */
export function groupMembership(
  workflow: Workflow,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
  exclude: ReadonlySet<NodeId> = new Set(),
): Map<NodeId, number> {
  // 表示用のワークフローは、作ったときに求めた所属を使う（位置の座標が混ざっている）
  const fixed = fixedLayoutOf(workflow);
  if (fixed && exclude.size === 0) return new Map(fixed.membership);

  const rects = workflowGroups(workflow).flatMap((group, index) => {
    const rect = boundingOf(group);
    return rect ? [{ index, rect, area: rect.width * rect.height }] : [];
  });
  const membership = new Map<NodeId, number>();
  if (rects.length === 0) return membership;

  for (const node of workflow.nodes) {
    if (exclude.has(node.id)) continue;
    const box = rectOf(node, layout);
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    let best: { readonly index: number; readonly area: number } | null = null;
    for (const entry of rects) {
      if (!contains(entry.rect, cx, cy)) continue;
      if (best === null || entry.area < best.area) best = entry;
    }
    if (best !== null) membership.set(node.id, best.index);
  }
  return membership;
}

function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * 位置から読む親子。枠を丸ごと含む枠のうち、面積のいちばん小さいものが親。
 * 同じ大きさの枠どうしは添字の小さい方が親（輪にならない）
 */
export function groupParents(workflow: Workflow): Map<number, number> {
  const fixed = fixedLayoutOf(workflow);
  if (fixed) return new Map(fixed.parents);

  const rects = workflowGroups(workflow).flatMap((group, index) => {
    const rect = boundingOf(group);
    return rect ? [{ index, rect, area: rect.width * rect.height }] : [];
  });
  /** `a` が `b` より外側の順位か（大きい・同じ大きさなら添字が小さい） */
  const outer = (a: (typeof rects)[number], b: (typeof rects)[number]): boolean =>
    a.area > b.area || (a.area === b.area && a.index < b.index);
  const parents = new Map<number, number>();
  for (const child of rects) {
    let best: (typeof rects)[number] | null = null;
    for (const candidate of rects) {
      if (candidate === child || !outer(candidate, child)) continue;
      if (!containsRect(candidate.rect, child.rect)) continue;
      // 含む枠のうちいちばん内側
      if (best === null || outer(best, candidate)) best = candidate;
    }
    if (best !== null) parents.set(child.index, best.index);
  }
  return parents;
}

/** 自分から外へたどったグループの並び（自分を含む）。グループでなければ空 */
export function lineage(group: number | undefined, parents: GroupParents): number[] {
  const chain: number[] = [];
  for (let at = group; at !== undefined && !chain.includes(at); at = parents.get(at)) {
    chain.push(at);
  }
  return chain;
}

/** 1 つの階層に並ぶもの。ノードか、子のグループの箱 */
export type LevelItem =
  | { readonly kind: 'node'; readonly id: NodeId }
  | { readonly kind: 'group'; readonly index: number };

/**
 * `container`（外は null）の直下で見たときの、ノード `id` の居場所。直下のメンバーならノード、
 * 子のグループの中ならその子のグループ。`container` の中に居なければ null
 */
export function itemAt(
  id: NodeId,
  container: number | null,
  membership: Membership,
  parents: GroupParents,
): LevelItem | null {
  const chain = lineage(membership.get(id), parents);
  const at = container === null ? chain.length : chain.indexOf(container);
  if (at < 0) return null;
  const child = chain[at - 1];
  return child === undefined ? { kind: 'node', id } : { kind: 'group', index: child };
}

/** 居場所を比べる鍵 */
export function levelItemKey(item: LevelItem): string {
  return item.kind === 'node' ? `n${String(item.id)}` : `g${String(item.index)}`;
}

/** 中にノードが居るグループ（子のグループを通して入っているものも） */
export function occupiedGroups(membership: Membership, parents: GroupParents): Set<number> {
  const occupied = new Set<number>();
  for (const group of new Set(membership.values())) {
    for (const at of lineage(group, parents)) occupied.add(at);
  }
  return occupied;
}

/** グループとその子孫のグループ */
export function groupSubtree(group: number, parents: GroupParents): Set<number> {
  const result = new Set([group]);
  for (const [child, parent] of parents) {
    if (parent === group && child !== group) {
      for (const inner of groupSubtree(child, parents)) result.add(inner);
    }
  }
  return result;
}

/** グループの中のノード（子のグループの中も）。`order` の順 */
export function groupNodeIds(
  order: readonly NodeId[],
  group: number,
  membership: Membership,
  parents: GroupParents,
): NodeId[] {
  return order.filter((id) => lineage(membership.get(id), parents).includes(group));
}

/**
 * 同じグループのノードを、先頭のメンバーの位置へ寄せる（並びの中で離さない）。
 * 入れ子なら、グループの中でも子のグループごとに同じく寄せる
 */
export function contiguous(
  sequence: readonly NodeId[],
  membership: Membership,
  parents: GroupParents = NO_PARENTS,
): NodeId[] {
  const level = (ids: readonly NodeId[], container: number | null): NodeId[] => {
    const buckets = new Map<string, { readonly item: LevelItem; readonly ids: NodeId[] }>();
    for (const id of ids) {
      const item = itemAt(id, container, membership, parents) ?? { kind: 'node', id };
      const key = levelItemKey(item);
      const bucket = buckets.get(key);
      if (bucket) bucket.ids.push(id);
      else buckets.set(key, { item, ids: [id] });
    }
    return [...buckets.values()].flatMap(({ item, ids: inside }) =>
      item.kind === 'node' ? inside : level(inside, item.index),
    );
  };
  return level(sequence, null);
}

// ─────────────────────────────
// 画面に出すための読み取り。
// ─────────────────────────────

/** グループを指す鍵。`id` があればそれ、無ければ添字（`i<添字>`） */
export function groupKeyAt(workflow: Workflow, index: number): string {
  const group = workflowGroups(workflow)[index];
  return isRecord(group) && typeof group.id === 'number' ? String(group.id) : `i${String(index)}`;
}

/** 鍵から添字。見つからなければ -1 */
export function groupIndexOf(workflow: Workflow, key: string): number {
  return workflowGroups(workflow).findIndex((_, index) => groupKeyAt(workflow, index) === key);
}

/** グループの鍵・名前・色（画面に出す分） */
export interface GroupLabel {
  readonly key: string;
  readonly title: string;
  /** 本体の `color`。無ければ未設定 */
  readonly color?: string | undefined;
}

/** 添字のグループの鍵・名前・色。名前が無ければ本体の既定の名前 */
export function groupLabelAt(workflow: Workflow, index: number): GroupLabel {
  const group = workflowGroups(workflow)[index];
  const title = isRecord(group) && typeof group.title === 'string' ? group.title : DEFAULT_TITLE;
  const color = isRecord(group) && typeof group.color === 'string' ? group.color : undefined;
  return { key: groupKeyAt(workflow, index), title, color };
}

/** 名前・色の並びから添字のもの。並びに無ければ（起きないはずだが）添字の鍵だけの名無し */
export function groupLabelOf(labels: readonly GroupLabel[], index: number): GroupLabel {
  return labels[index] ?? { key: `i${String(index)}`, title: '' };
}

// ─────────────────────────────
// 位置を変えない編集（名前・枠を消す）。顔ぶれを変える編集は order.ts（並べ直しが要る）。
// ─────────────────────────────

/** 名前を書き換える。同じ名前なら同じものを返す */
export function renameGroup(workflow: Workflow, index: number, title: string): Workflow {
  const groups = workflowGroups(workflow);
  const group = groups[index];
  if (!isRecord(group) || group.title === title) return workflow;
  return { ...workflow, groups: groups.map((g, at) => (at === index ? { ...group, title } : g)) };
}

/** 色を書き換える。null で `color` のキーごと消す（本体の既定の色に戻る）。変わらなければ同じもの */
export function setGroupColor(workflow: Workflow, index: number, color: string | null): Workflow {
  const groups = workflowGroups(workflow);
  const group = groups[index];
  if (!isRecord(group)) return workflow;
  if (color === null ? !('color' in group) : group.color === color) return workflow;
  const next: Record<string, unknown> = { ...group };
  if (color === null) delete next.color;
  else next.color = color;
  return { ...workflow, groups: groups.map((g, at) => (at === index ? next : g)) };
}

/**
 * 新しいグループ（本体の保存の形）。枠は並べ直しで求める。番号は外と全部の定義で共有する数えの次
 * （本体と同じ）。足した後は呼ぶ側が `withGroupCounter` で数えを進める
 */
export function newGroup(workflow: Workflow): Record<string, unknown> {
  return {
    id: lastGroupIdOf(workflow) + 1,
    title: DEFAULT_TITLE,
    bounding: [0, 0, 0, 0],
    flags: {},
  };
}

/** 添字の並びから外す。外した後ろの添字は 1 つずつ詰まる */
export function withoutGroups(
  workflow: Workflow,
  indexes: ReadonlySet<number>,
): { readonly workflow: Workflow; readonly shift: (index: number) => number } {
  const groups = workflowGroups(workflow);
  const kept = groups.filter((_, index) => !indexes.has(index));
  const shift = (index: number): number =>
    index - [...indexes].filter((removed) => removed < index).length;
  return {
    workflow: kept.length === groups.length ? workflow : { ...workflow, groups: kept },
    shift,
  };
}

// ─────────────────────────────
// カードの並びをグループごとの塊に分ける。
// ─────────────────────────────

/** カードの並びの 1 区切り。グループに入らない 1 つか、グループの塊 */
export type CardSegment<T> =
  | { readonly kind: 'single'; readonly item: T }
  | {
      readonly kind: 'group';
      readonly index: number;
      /** 中のもの全部（子のグループの中も）。並びの順 */
      readonly items: readonly T[];
      /** 直下の並び（子のグループは塊のまま） */
      readonly children: readonly CardSegment<T>[];
    };

/**
 * 続いている同じグループのものを 1 つの塊にする（入れ子なら塊の中も同じく分ける）。
 * 並びが崩れて同じグループが離れて現れたら、2 つ目からは塊にせず 1 つずつ出す
 * （枠と並べ替えの受け口を 1 つに保つ）
 */
export function segmentByGroup<T extends { readonly id: NodeId }>(
  items: readonly T[],
  membership: Membership,
  parents: GroupParents = NO_PARENTS,
): CardSegment<T>[] {
  const closed = new Set<number>();
  const level = (inside: readonly T[], container: number | null): CardSegment<T>[] => {
    const segments: CardSegment<T>[] = [];
    let open: { readonly index: number; readonly items: T[] } | null = null;
    const flush = (): void => {
      if (open === null) return;
      const { index, items: members } = open;
      open = null;
      closed.add(index);
      segments.push({ kind: 'group', index, items: members, children: level(members, index) });
    };
    for (const item of inside) {
      const at = itemAt(item.id, container, membership, parents);
      const group = at?.kind === 'group' ? at.index : undefined;
      if (open !== null && group === open.index) {
        open.items.push(item);
        continue;
      }
      flush();
      if (group === undefined || closed.has(group)) segments.push({ kind: 'single', item });
      else open = { index: group, items: [item] };
    }
    flush();
    return segments;
  };
  return level(items, null);
}
