import {
  groupMembership,
  groupParents,
  groupSubtree,
  workflowGroups,
  type Membership,
} from '@/graph/groups';
import { propagate, propagateUp, pushBelow } from '@/graph/layout-shift-columns';
import {
  insertUnits,
  removeUnit,
  unitRect,
  type Spot,
  type Unit,
} from '@/graph/layout-shift-units';
import {
  finish,
  framesUp,
  groupFrame,
  itemsOf,
  nodeRect,
  startWork,
  subtreeIds,
  translate,
  union,
  type Work,
} from '@/graph/layout-shift-work';
import {
  DEFAULT_ORDER_LAYOUT,
  positionOf,
  rectOf,
  type NodeRect,
  type OrderLayout,
} from '@/graph/node-box';
import { hasFlag } from '@/graph/node-flags';
import type { NodeId, Workflow } from '@/graph/types';

// ─────────────────────────────
// 変更箇所だけの置き直しの入口。全体を求め直す `layout-place.ts` と違い、変わったものと、それより後ろに
// 読むものだけを動かす。列は読み戻し（`layout-read.ts`）と同じく左端の差 `COLUMN_TOLERANCE` 以内のもの。
// ─────────────────────────────

/** 動かすもの: ノード（グループの外・中）か、グループの箱 */
export type ShiftUnit =
  | { readonly kind: 'node'; readonly id: NodeId }
  | { readonly kind: 'group'; readonly index: number };

/** 入れる先: そのノード・グループの箱の前か後ろ。`container` は入れる階層（外は null） */
export interface ShiftSpot {
  readonly container: number | null;
  readonly beside: ShiftUnit | null;
  readonly side: 'before' | 'after';
}

function toUnit(work: Work, unit: ShiftUnit): Unit {
  if (unit.kind === 'node') return { ids: [unit.id], group: null };
  return { ids: subtreeIds(work, unit.index, new Set()), group: unit.index };
}

function toSpot(spot: ShiftSpot): Spot {
  const beside =
    spot.beside === null
      ? null
      : spot.beside.kind === 'node'
        ? spot.beside.id
        : { group: spot.beside.index };
  return { container: spot.container, beside, side: spot.side };
}

/** 足したノード（まだどこにも置いていないもの）。入れた並びは渡した順 */
export interface InsertedNodes {
  readonly nodeIds: readonly NodeId[];
  /** ほかのノードの所属。省くと今の位置から読む */
  readonly membership?: Membership | undefined;
}

/**
 * 足したノードを `spot` へ入れる。所属は `spot.container`
 */
export function shiftInsert(
  workflow: Workflow,
  { nodeIds, membership }: InsertedNodes,
  spot: ShiftSpot,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const work = startWork(workflow, layout, membership);
  for (const id of nodeIds) work.membership.delete(id);
  insertUnits(
    work,
    nodeIds.map((id) => ({ ids: [id], group: null })),
    toSpot(spot),
  );
  return finish(work);
}

/**
 * 足したグループ（`added`。まだ置いていない）を伏せて始める。添字は保ち、所属と親は位置から読む。
 * `adding` のノードも所属を読まない（呼ぶ側で決める）
 */
function startWithout(
  workflow: Workflow,
  layout: OrderLayout,
  added: ReadonlySet<number>,
  adding: ReadonlySet<NodeId> = new Set(),
): Work {
  const others: Workflow = {
    ...workflow,
    groups: workflowGroups(workflow).map((g, index) => (added.has(index) ? null : g)),
  };
  return startWork(workflow, layout, groupMembership(others, layout, adding), groupParents(others));
}

/** 足したグループの中の所属と親（入れ子で持ち込むとき） */
interface InsertedTree {
  /** ノード → 所属（載っていないノードは `group` の直下） */
  readonly membership: ReadonlyMap<NodeId, number>;
  /** 中のグループ → 親（載っていないグループは `group` の子） */
  readonly parents: ReadonlyMap<number, number>;
}

const NO_TREE: InsertedTree = { membership: new Map(), parents: new Map() };

/** 1 つのグループの箱として足すノード */
export interface InsertedBox {
  readonly nodeIds: readonly NodeId[];
  /** そのノードたちの所属にする `groups[]` の添字（枠は置いた後に求める） */
  readonly group: number;
  /** 中にグループを持ち込むときの所属と親（`inner.parents` の鍵が持ち込むグループ） */
  readonly inner?: InsertedTree | undefined;
}

/**
 * 足したノードをまとめて 1 つのグループの箱として `spot` へ入れる（中の並べ方は保つ）
 */
export function shiftInsertGroup(
  workflow: Workflow,
  { nodeIds, group, inner = NO_TREE }: InsertedBox,
  spot: ShiftSpot,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const added = new Set([group, ...inner.parents.keys()]);
  const work = startWithout(workflow, layout, added, new Set(nodeIds));
  for (const id of nodeIds) work.membership.set(id, inner.membership.get(id) ?? group);
  for (const child of added) {
    if (child !== group) work.parents.set(child, inner.parents.get(child) ?? group);
  }
  insertUnits(work, [{ ids: nodeIds, group }], toSpot(spot));
  return finish(work);
}

/** 抜くものの元の場所を詰める（ノードはこのあと呼ぶ側で消す）。所属は変えない */
export function shiftRemove(
  workflow: Workflow,
  unit: ShiftUnit,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const work = startWork(workflow, layout);
  removeUnit(work, toUnit(work, unit));
  // 抜いたノードは枠に数えない（このあと呼ぶ側で消す）
  return finish(work);
}

/** 動かす（元の場所を詰め、`spot` へ入れる）。ノードの所属は `spot.container` に移る */
export function shiftMove(
  workflow: Workflow,
  unit: ShiftUnit,
  spot: ShiftSpot,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const work = startWork(workflow, layout);
  const moving = toUnit(work, unit);
  // 自分の中（子孫）へは入れない
  if (moving.group !== null && spot.container !== null) {
    if (groupSubtree(moving.group, work.parents).has(spot.container)) return workflow;
  }
  removeUnit(work, moving);
  insertUnits(work, [moving], toSpot(spot));
  return finish(work);
}

/** 囲むものと、囲む新しいグループ（まだ置いていない） */
export interface GroupingUnits {
  readonly units: readonly ShiftUnit[];
  readonly group: number;
}

/**
 * グループ化。`units` を元の場所から抜いて詰め、`spot` へ並べて入れ、
 * 新しいグループ `group`（親は `spot.container`）で囲む。
 * 枠が上の箱に重なるなら中身を下げ、下の箱に重なるなら下を送る（箱どうしを重ねない）。
 * 外側の枠が伸びた分は外へ順に伝える
 */
export function shiftGroup(
  workflow: Workflow,
  { units, group }: GroupingUnits,
  spot: ShiftSpot,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const work = startWithout(workflow, layout, new Set([group]));
  const moving = units.map((unit) => toUnit(work, unit));
  for (const unit of moving) removeUnit(work, unit);
  insertUnits(work, moving, toSpot(spot));

  // 囲む前の中身と外側の枠を測ってから、新しいグループに入れる
  const container = spot.container;
  const ids = moving.flatMap((unit) => unit.ids);
  const content = union(moving.flatMap((unit) => unitRect(work, unit) ?? []));
  const before = framesUp(work, container, new Set());
  for (const unit of moving) {
    if (unit.group === null) for (const id of unit.ids) work.membership.set(id, group);
    else work.parents.set(unit.group, group);
  }
  if (container !== null) work.parents.set(group, container);

  const frame = groupFrame(work, group, new Set());
  if (frame) {
    const others = itemsOf(work, container, new Set(ids));
    const sideways = (rect: NodeRect): boolean =>
      rect.left < frame.right && frame.left < rect.right;
    const center = (rect: NodeRect): number => (rect.top + rect.bottom) / 2;
    // 上: 中身より上の箱の下端まで、枠の上端を下げる
    const above = others.filter((item) => sideways(item.rect) && center(item.rect) < content.top);
    const ceiling = Math.max(frame.top, ...above.map((item) => item.rect.bottom));
    translate(work, ids, 0, ceiling - frame.top);
    // 下: 枠の下端が下の箱に重なる分だけ送る
    const bottom = frame.bottom + ceiling - frame.top;
    const below = others.filter(
      (item) => sideways(item.rect) && center(item.rect) > content.bottom,
    );
    const floor = Math.min(bottom, ...below.map((item) => item.rect.top));
    pushBelow(work, others, content, bottom - floor);
  }
  propagateUp(work, container, before);
  return finish(work);
}

/**
 * 大きさ・折りたたみが変わったあと、伸びたノードについて、
 * 幅は後ろに読むものを、高さは下で横の重なるものを、伸びた分だけ送る。縮んだときは動かさない
 */
export function shiftGrown(
  before: Workflow,
  after: Workflow,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const old = new Map(before.nodes.map((node) => [node.id, node]));
  const grown = after.nodes.filter((node) => {
    const was = old.get(node.id);
    // `flags` はピン留めなど大きさに関わらない印も持つので、折りたたみの変化だけを見る
    return (
      was !== undefined &&
      (was.size !== node.size || hasFlag(was, 'collapsed') !== hasFlag(node, 'collapsed'))
    );
  });
  if (grown.length === 0) return after;

  const work = startWork(after, layout, groupMembership(before, layout), groupParents(before));
  for (const node of grown) {
    const was = old.get(node.id);
    if (!was) continue;
    const from = rectOf({ ...was, pos: work.pos.get(node.id) ?? positionOf(was) }, layout);
    const to = nodeRect(work, node.id);
    if (!to || (to.right <= from.right && to.bottom <= from.bottom)) continue;
    const container = work.membership.get(node.id) ?? null;
    // 伸びる前の枠は、このノードだけ元の大きさで測る
    work.byId.set(node.id, was);
    const framesBefore = framesUp(work, container, new Set());
    work.byId.set(node.id, node);
    propagate(work, container, [node.id], {
      before: from,
      after: { ...to, right: Math.max(to.right, from.right) },
    });
    propagateUp(work, container, framesBefore);
  }
  return finish(work);
}
