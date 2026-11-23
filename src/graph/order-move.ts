import {
  groupMembership,
  groupNodeIds,
  groupParents,
  groupSubtree,
  type GroupParents,
  type Membership,
} from '@/graph/groups';
import { orderedNodeIds } from '@/graph/layout-read';
import { shiftMove } from '@/graph/layout-shift';
import { DEFAULT_ORDER_LAYOUT, type OrderLayout } from '@/graph/node-box';
import { dropGroups, emptied, spotAt } from '@/graph/order';
import type { NodeId, Workflow } from '@/graph/types';

export type SortTarget =
  | { readonly kind: 'node'; readonly id: NodeId }
  | { readonly kind: 'group'; readonly index: number };

export type DropSide = 'before' | 'after';

export interface SortDrop {
  readonly over: SortTarget;
  readonly side?: DropSide | undefined;
}

export function moveTarget(
  workflow: Workflow,
  active: SortTarget,
  { over, side }: SortDrop,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const membership = groupMembership(workflow, layout);
  const parents = groupParents(workflow);
  const into =
    over.kind === 'node' ? (membership.get(over.id) ?? null) : (parents.get(over.index) ?? null);
  const move: Move = {
    workflow,
    layout,
    membership,
    parents,
    order: orderedNodeIds(workflow),
    into,
  };
  if (active.kind === 'node') return moveNode(move, active.id, over, side);
  return moveGroup(move, active.index, over, side);
}

interface Move {
  readonly workflow: Workflow;
  readonly layout: OrderLayout;
  readonly membership: Membership;
  readonly parents: GroupParents;
  readonly order: readonly NodeId[];
  readonly into: number | null;
}

function blockOf(move: Move, target: SortTarget): NodeId[] {
  return target.kind === 'group'
    ? groupNodeIds(move.order, target.index, move.membership, move.parents)
    : [target.id];
}

function moveNode(
  move: Move,
  activeId: NodeId,
  over: SortTarget,
  side: DropSide | undefined,
): Workflow {
  const { workflow, membership, parents, order, into } = move;
  const from = membership.get(activeId) ?? null;
  let target: NodeId[];
  let direction = side;
  if (over.kind === 'node' && from === into && side === undefined) {
    const at = order.indexOf(activeId);
    const to = order.indexOf(over.id);
    if (at < 0 || to < 0 || at === to) return workflow;
    target = [over.id];
    direction = at < to ? 'after' : 'before';
  } else {
    target = over.kind === 'node' ? [over.id] : blockOf(move, over).filter((id) => id !== activeId);
  }
  const spot = placedWith(order, [activeId], target, direction);
  if (spot === null) return workflow;
  if (spot.unchanged && from === into) return workflow;
  const after = new Map(membership);
  if (into === null) after.delete(activeId);
  else after.set(activeId, into);
  const moved = shiftMove(
    workflow,
    { kind: 'node', id: activeId },
    spotAt(spot, after, parents, into),
    move.layout,
  );
  return dropGroups(moved, after, parents, emptied(membership, after, parents)).workflow;
}

function moveGroup(
  move: Move,
  activeIndex: number,
  over: SortTarget,
  side: DropSide | undefined,
): Workflow {
  const { workflow, membership, parents, order, into } = move;
  if (into !== null && groupSubtree(activeIndex, parents).has(into)) return workflow;
  const target = over.kind === 'node' ? [over.id] : blockOf(move, over);
  const where = placedWith(
    order,
    blockOf(move, { kind: 'group', index: activeIndex }),
    target,
    side,
  );
  const from = parents.get(activeIndex) ?? null;
  if (where === null || (where.unchanged && from === into)) return workflow;
  const nextParents = new Map(parents);
  if (into === null) nextParents.delete(activeIndex);
  else nextParents.set(activeIndex, into);
  const moved = shiftMove(
    workflow,
    { kind: 'group', index: activeIndex },
    spotAt(where, membership, nextParents, into),
    move.layout,
  );
  const gone = emptied(membership, membership, parents, nextParents);
  return dropGroups(moved, membership, nextParents, gone).workflow;
}

function placedWith(
  order: readonly NodeId[],
  moving: readonly NodeId[],
  target: readonly NodeId[],
  side: DropSide | undefined,
): { readonly rest: NodeId[]; readonly at: number; readonly unchanged: boolean } | null {
  if (moving.length === 0 || target.length === 0) return null;
  if (moving.some((id) => target.includes(id))) return null;
  const rest = order.filter((id) => !moving.includes(id));
  const downward = order.indexOf(moving[0] ?? -1) < order.indexOf(target[0] ?? -1);
  const after = side === undefined ? downward : side === 'after';
  const at = after ? rest.indexOf(target.at(-1) ?? -1) + 1 : rest.indexOf(target[0] ?? -1);
  if (at < 0) return null;
  const sequence = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  return { rest, at, unchanged: sequence.every((id, index) => order[index] === id) };
}

export function moveInX(
  workflow: Workflow,
  from: number,
  to: number,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const order = orderedNodeIds(workflow);
  const active = order[from];
  const over = order[to];
  if (from === to || active === undefined || over === undefined) return workflow;
  return moveTarget(
    workflow,
    { kind: 'node', id: active },
    { over: { kind: 'node', id: over }, side: from < to ? 'after' : 'before' },
    layout,
  );
}
