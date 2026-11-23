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

function toShiftUnit(item: LevelItem): ShiftUnit {
  return item.kind === 'node' ? item : { kind: 'group', index: item.index };
}

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

export function emptied(
  before: Membership,
  after: Membership,
  parentsBefore: GroupParents,
  parentsAfter: GroupParents = parentsBefore,
): Set<number> {
  const left = occupiedGroups(after, parentsAfter);
  return new Set([...occupiedGroups(before, parentsBefore)].filter((group) => !left.has(group)));
}

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

export function insertAfterX(
  workflow: Workflow,
  nodeId: NodeId,
  previousId: NodeId | null,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  return insertNodesAfter(workflow, [nodeId], { previousId }, layout);
}

export interface InsertSpot {
  readonly previousId: NodeId | null;
  readonly group?: number | null | undefined;
}

export function insertNodesAfter(
  workflow: Workflow,
  nodeIds: readonly NodeId[],
  { previousId, group }: InsertSpot,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const present = new Set(workflow.nodes.map((node) => node.id));
  const adding = [...new Set(nodeIds)].filter((id) => present.has(id));
  if (adding.length === 0) return workflow;

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

  const spot = spotAt({ rest: others, at }, membership, parents, joined);
  return shiftInsert(workflow, { nodeIds: adding, membership }, spot, layout);
}

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

export function groupNodes(
  workflow: Workflow,
  nodeIds: readonly NodeId[],
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  const chosen = new Set(nodeIds);
  const order = orderedNodeIds(workflow, layout);
  const membership = groupMembership(workflow, layout);
  const parents = groupParents(workflow);

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

  const levelOf = (unit: LevelItem): number | undefined =>
    unit.kind === 'node' ? membership.get(unit.id) : parents.get(unit.index);
  const shared = [...units.values()]
    .map((unit) => lineage(levelOf(unit), parents))
    .reduce((common, chain) => common.filter((group) => chain.includes(group)));
  const container = shared[0] ?? null;

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

export function ungroup(
  workflow: Workflow,
  index: number,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  if (index < 0 || index >= workflowGroups(workflow).length) return workflow;
  const membership = groupMembership(workflow, layout);
  return dropGroups(workflow, membership, groupParents(workflow), new Set([index])).workflow;
}

export function settleLayout(
  before: Workflow,
  after: Workflow,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow {
  return shiftGrown(before, after, layout);
}

type PlacementSide = 'after' | 'before';

export interface PlacementAnchor {
  readonly nodeId: NodeId;
  readonly side: PlacementSide;
}

export function previousFor(
  workflow: Workflow,
  { nodeId, side }: PlacementAnchor,
): NodeId | null | undefined {
  const order = orderedNodeIds(workflow);
  const at = order.indexOf(nodeId);
  if (at < 0) return undefined;
  return side === 'after' ? nodeId : (order[at - 1] ?? null);
}
