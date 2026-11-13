import {
  groupMembership,
  groupNodeIds,
  groupParents,
  itemAt,
  levelItemKey,
  lineage,
  newGroup,
  occupiedGroups,
  withoutGroups,
  workflowGroups,
  type GroupParents,
  type LevelItem,
  type Membership,
} from '@/graph/groups';
import { relayout, type RelayoutOptions } from '@/graph/layout-place';
import { orderedNodeIds } from '@/graph/layout-read';
import {
  shiftGroup,
  shiftGrown,
  shiftInsert,
  shiftRemove,
  type ShiftSpot,
  type ShiftUnit,
} from '@/graph/layout-shift';
import { DEFAULT_ORDER_LAYOUT, type OrderLayout } from '@/graph/node-box';
import { topologicalOrder } from '@/graph/processing-order';
import { withGroupCounter } from '@/graph/subgraph-level';
import type { NodeId, Workflow } from '@/graph/types';

export { DEFAULT_ORDER_LAYOUT, TITLE_HEIGHT, type OrderLayout } from '@/graph/node-box';
export { orderedNodeIds } from '@/graph/layout-read';
export { relayout, type RelayoutOptions } from '@/graph/layout-place';
export { topologicalOrder } from '@/graph/processing-order';

// ─────────────────────────────
// 一本道の並び順と、並びを変える操作。独自キーを足さないので、順序は `pos` の横位置に写して保存する。
// 変更箇所だけを動かすのは `layout-shift.ts`、全部の位置を求めるのは処理順に並べるときだけ。
// ─────────────────────────────

/**
 * 指定順に位置を求め直す。orderedIds に載っていないノードは現在の順序を保ったまま
 * 末尾に送る（欠落で消さない）。size は書き換えない
 */
export function applyOrder(
  workflow: Workflow,
  orderedIds: readonly NodeId[],
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
  options: RelayoutOptions = {},
): Workflow {
  const known = new Set(orderedIds);
  const rest = orderedNodeIds(workflow).filter((id) => !known.has(id));
  const sequence = [...orderedIds, ...rest];
  return relayout(workflow, sequence, layout, {
    membership: groupMembership(workflow, layout),
    ...options,
  });
}

/**
 * **処理の順**（同じ順位は横位置の順）に位置を置き直す。
 * 処理順に並べるアイコンと、ComfyUI で作ったものを読み込んだときに使う。
 * `fromOrigin` なら**今の座標を捨てて**置き直す（アイコンの確かめで選べる）: 並びとグループの
 * 所属を今の位置から読んでから全ノードを原点に置き、そこから求める。縦位置は右に接続先の
 * 無い列を入力元の今の範囲に揃えるので、座標を残したままだと今の縦の差を引きずる
 */
export function arrangeByProcessing(
  workflow: Workflow,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
  options: RelayoutOptions = {},
): Workflow {
  const order = topologicalOrder(workflow);
  if (!options.fromOrigin) return applyOrder(workflow, order, layout, options);
  const membership = groupMembership(workflow, layout);
  const zeroed: Workflow = {
    ...workflow,
    nodes: workflow.nodes.map((node) => ({ ...node, pos: [0, 0] as [number, number] })),
  };
  return relayout(zeroed, order, layout, { membership, ...options });
}

// ─────────────────────────────
// 並びを変える操作。新しい並びと所属を決め、変わったものだけを動かす。
// ─────────────────────────────

function toShiftUnit(item: LevelItem): ShiftUnit {
  return item.kind === 'node' ? item : { kind: 'group', index: item.index };
}

/**
 * 並びの `at` の位置へ入れるときの入れる先。`container` の階層で見た前後のもの（直下のノードか、
 * 子のグループの箱）を基準にする。基準が無ければ階層の末尾
 */
export function spotAt(
  { rest, at }: { readonly rest: readonly NodeId[]; readonly at: number },
  membership: Membership,
  parents: GroupParents,
  container: number | null,
): ShiftSpot {
  const previous = rest[at - 1];
  const next = rest[at];
  const before = previous === undefined ? null : itemAt(previous, container, membership, parents);
  if (before) return { container, beside: toShiftUnit(before), side: 'after' };
  const after = next === undefined ? null : itemAt(next, container, membership, parents);
  if (after) return { container, beside: toShiftUnit(after), side: 'before' };
  return { container, beside: null, side: 'after' };
}

interface Tree {
  readonly workflow: Workflow;
  readonly membership: Membership;
  readonly parents: GroupParents;
}

/**
 * グループを外して、残りの所属と親の添字を詰める。外したグループの直下のものと子のグループは、
 * 残る外側のグループ（無ければ外）へ移る。外すものが無ければそのまま返す
 */
export function dropGroups(
  workflow: Workflow,
  membership: Membership,
  parents: GroupParents,
  indexes: ReadonlySet<number>,
): Tree {
  if (indexes.size === 0) return { workflow, membership, parents };
  const { workflow: next, shift } = withoutGroups(workflow, indexes);
  const survivor = (group: number | undefined): number | undefined =>
    lineage(group, parents).find((at) => !indexes.has(at));
  const kept = new Map<NodeId, number>();
  for (const [id, group] of membership) {
    const at = survivor(group);
    if (at !== undefined) kept.set(id, shift(at));
  }
  const keptParents = new Map<number, number>();
  for (const [child, parent] of parents) {
    const at = indexes.has(child) ? undefined : survivor(parent);
    if (at !== undefined) keptParents.set(shift(child), shift(at));
  }
  return { workflow: next, membership: kept, parents: keptParents };
}

/** `before` で中にノードが居て、`after` で 1 つも残らなかったグループ（子のグループを通しても） */
export function emptied(
  before: Membership,
  after: Membership,
  parentsBefore: GroupParents,
  parentsAfter: GroupParents = parentsBefore,
): Set<number> {
  const left = occupiedGroups(after, parentsAfter);
  return new Set([...occupiedGroups(before, parentsBefore)].filter((group) => !left.has(group)));
}

/**
 * ノードを抜いたところを詰める（削除の前）。抜いたノードの位置は変えない。
 * メンバーが居なくなったグループは消す
 */
export function removeFromX(
  workflow: Workflow,
  nodeId: NodeId,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const before = groupMembership(workflow, layout);
  const parents = groupParents(workflow);
  const after = new Map(before);
  after.delete(nodeId);
  const shifted = shiftRemove(workflow, { kind: 'node', id: nodeId }, layout);
  return dropGroups(shifted, after, parents, emptied(before, after, parents)).workflow;
}

/**
 * ノードを `previousId` の直後に入れる（並べ替えの移動先・追加）。`previousId` が null なら先頭
 */
export function insertAfterX(
  workflow: Workflow,
  nodeId: NodeId,
  previousId: NodeId | null,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  return insertNodesAfter(workflow, [nodeId], { previousId }, layout);
}

/** 足すノードを入れる場所 */
export interface InsertSpot {
  /** この直後に入れる。null なら先頭 */
  readonly previousId: NodeId | null;
  /**
   * 入るグループ（添字。null ならどこにも入らない）。省くと、
   * 前後のノードが共に入っているいちばん内側のグループに入る
   */
  readonly group?: number | null | undefined;
}

/**
 * 足したノードをまとめて `previousId` の直後に入れる（渡した順のまま）
 */
export function insertNodesAfter(
  workflow: Workflow,
  nodeIds: readonly NodeId[],
  { previousId, group }: InsertSpot,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const present = new Set(workflow.nodes.map((node) => node.id));
  const adding = [...new Set(nodeIds)].filter((id) => present.has(id));
  if (adding.length === 0) return workflow;

  // 足すノードの今の位置で他の並びと所属を読み違えないよう、外して読む
  const excluded = new Set(adding);
  const others = orderedNodeIds({
    ...workflow,
    nodes: workflow.nodes.filter((n) => !excluded.has(n.id)),
  });
  const membership = groupMembership(workflow, layout, excluded);
  const parents = groupParents(workflow);
  const at = previousId === null ? 0 : others.indexOf(previousId) + 1;
  const joined =
    group !== undefined ? group : sharedGroup(membership, parents, others[at - 1], others[at]);
  if (joined !== null) for (const id of adding) membership.set(id, joined);

  // 前後の間へ入れる（変わったところだけを動かす）
  const spot = spotAt({ rest: others, at }, membership, parents, joined);
  return shiftInsert(workflow, { nodeIds: adding, membership }, spot, layout);
}

/** 前後のノードが共に入っている、いちばん内側のグループ。どちらかが無い・共に無ければ null */
function sharedGroup(
  membership: Membership,
  parents: GroupParents,
  previous: NodeId | undefined,
  next: NodeId | undefined,
): number | null {
  if (previous === undefined || next === undefined) return null;
  const outer = lineage(membership.get(next), parents);
  return lineage(membership.get(previous), parents).find((group) => outer.includes(group)) ?? null;
}

// ─────────────────────────────
// グループの顔ぶれを変える操作。動かすものだけを動かし、枠を求め直す。
// ─────────────────────────────

/**
 * 選んだノードで新しいグループを作る。並びは抜いて詰め、先頭の位置へ並べて入れる。
 * 一部だけ選んだグループには選ばなかったノードが残るので、空になるグループは無い
 */
export function groupNodes(
  workflow: Workflow,
  nodeIds: readonly NodeId[],
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const chosen = new Set(nodeIds);
  const order = orderedNodeIds(workflow, layout);
  const membership = groupMembership(workflow, layout);
  const parents = groupParents(workflow);

  // 入れるもの（並びの順）。中を全部選んだグループは箱ごと
  const whole = (group: number): boolean =>
    groupNodeIds(order, group, membership, parents).every((id) => chosen.has(id));
  const units = new Map<string, LevelItem>();
  for (const id of order.filter((member) => chosen.has(member))) {
    const outermost = lineage(membership.get(id), parents).reverse().find(whole);
    const unit: LevelItem =
      outermost === undefined ? { kind: 'node', id } : { kind: 'group', index: outermost };
    units.set(levelItemKey(unit), unit);
  }
  if (units.size === 0) return workflow;

  // 新しいグループの親: 入れるものが共に入っている、いちばん内側のグループ
  const levelOf = (unit: LevelItem): number | undefined =>
    unit.kind === 'node' ? membership.get(unit.id) : parents.get(unit.index);
  const shared = [...units.values()]
    .map((unit) => lineage(levelOf(unit), parents))
    .reduce((common, chain) => common.filter((group) => chain.includes(group)));
  const container = shared[0] ?? null;

  // 入れる先: 選んだものを抜いた並びで、先頭が居た位置（箱ごと入るグループの中も全部選んである）
  const rest = order.filter((id) => !chosen.has(id));
  const at = order.findIndex((id) => chosen.has(id));

  const index = workflowGroups(workflow).length;
  const group = newGroup(workflow);
  const added: Workflow = withGroupCounter(
    { ...workflow, groups: [...workflowGroups(workflow), group] },
    typeof group.id === 'number' ? group.id : 0,
  );
  return shiftGroup(
    added,
    { units: [...units.values()].map(toShiftUnit), group: index },
    spotAt({ rest, at }, membership, parents, container),
    layout,
  );
}

/**
 * グループを解く。枠だけを消し、ノードの位置は変えない。直下のものと子のグループは
 * 親のグループ（無ければ外）に移る
 */
export function ungroup(
  workflow: Workflow,
  index: number,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  if (index < 0 || index >= workflowGroups(workflow).length) return workflow;
  const membership = groupMembership(workflow, layout);
  return dropGroups(workflow, membership, groupParents(workflow), new Set([index])).workflow;
}

/**
 * 編集のあとの置き直し。大きさ・折りたたみが伸びたノードの分だけ送る。
 * 線・値・ノードの顔ぶれの変化では動かさない（足したもの・消したものは操作の側で置いてある）
 */
export function settleLayout(
  before: Workflow,
  after: Workflow,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  return shiftGrown(before, after, layout);
}

// ─────────────────────────────
// 新しいノードの置き場所。基準ノードの隣に入れる（`insertAfterX` の直前を決める）。
// ─────────────────────────────

/** `after`=基準ノードの右隣に置く / `before`=基準ノードの位置に割り込む */
type PlacementSide = 'after' | 'before';

/** 足すノードを置く基準のノードと、その左右のどちらか */
export interface PlacementAnchor {
  readonly nodeId: NodeId;
  readonly side: PlacementSide;
}

/**
 * 基準ノードの隣に入れるときの「直前のノード」。`before` は基準の 1 つ前（先頭なら null）。
 * 基準が見つからなければ undefined（呼び出し側で末尾に足す）
 */
export function previousFor(
  workflow: Workflow,
  { nodeId, side }: PlacementAnchor,
): NodeId | null | undefined {
  const order = orderedNodeIds(workflow);
  const at = order.indexOf(nodeId);
  if (at < 0) return undefined;
  return side === 'after' ? nodeId : (order[at - 1] ?? null);
}
