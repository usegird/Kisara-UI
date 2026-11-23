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

export type ShiftUnit =
  | { readonly kind: 'node'; readonly id: NodeId }
  | { readonly kind: 'group'; readonly index: number };

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

export interface InsertedNodes {
  readonly nodeIds: readonly NodeId[];
  readonly membership?: Membership | undefined;
}

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

interface InsertedTree {
  readonly membership: ReadonlyMap<NodeId, number>;
  readonly parents: ReadonlyMap<number, number>;
}

const NO_TREE: InsertedTree = { membership: new Map(), parents: new Map() };

export interface InsertedBox {
  readonly nodeIds: readonly NodeId[];
  readonly group: number;
  readonly inner?: InsertedTree | undefined;
}

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

export function shiftRemove(
  workflow: Workflow,
  unit: ShiftUnit,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const work = startWork(workflow, layout);
  removeUnit(work, toUnit(work, unit));
  return finish(work);
}

export function shiftMove(
  workflow: Workflow,
  unit: ShiftUnit,
  spot: ShiftSpot,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const work = startWork(workflow, layout);
  const moving = toUnit(work, unit);
  if (moving.group !== null && spot.container !== null) {
    if (groupSubtree(moving.group, work.parents).has(spot.container)) return workflow;
  }
  removeUnit(work, moving);
  insertUnits(work, [moving], toSpot(spot));
  return finish(work);
}

export interface GroupingUnits {
  readonly units: readonly ShiftUnit[];
  readonly group: number;
}

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
    const above = others.filter((item) => sideways(item.rect) && center(item.rect) < content.top);
    const ceiling = Math.max(frame.top, ...above.map((item) => item.rect.bottom));
    translate(work, ids, 0, ceiling - frame.top);
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

export function shiftGrown(
  before: Workflow,
  after: Workflow,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const old = new Map(before.nodes.map((node) => [node.id, node]));
  const grown = after.nodes.filter((node) => {
    const was = old.get(node.id);
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
