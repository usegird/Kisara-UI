import { frameAround, withGroupBounds } from '@/graph/group-bounds';
import {
  groupMembership,
  groupParents,
  itemAt,
  lineage,
  type GroupParents,
  type Membership,
} from '@/graph/groups';
import { COLUMN_TOLERANCE } from '@/graph/layout-read';
import { positionOf, rectOf, type NodeRect, type OrderLayout } from '@/graph/node-box';
import { routeLongLinks } from '@/graph/reroutes';
import type { NodeId, Workflow, WorkflowNode } from '@/graph/types';

const SAME_POSITION_TOLERANCE = 0.5;

type Positions = Map<NodeId, [number, number]>;

export interface Work {
  readonly workflow: Workflow;
  readonly layout: OrderLayout;
  readonly byId: Map<NodeId, WorkflowNode>;
  readonly pos: Positions;
  readonly membership: Map<NodeId, number>;
  readonly parents: Map<number, number>;
  readonly moved: Set<NodeId>;
}

export interface Item {
  readonly ids: readonly NodeId[];
  readonly group: number | null;
  readonly readLeft: number;
  readonly readTop: number;
  readonly rect: NodeRect;
}

export type Container = number | null;

export function nodeRect(work: Work, id: NodeId): NodeRect | null {
  const node = work.byId.get(id);
  if (!node) return null;
  const at = work.pos.get(id) ?? positionOf(node);
  return rectOf({ ...node, pos: at }, work.layout);
}

export function union(rects: readonly NodeRect[]): NodeRect {
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

export function subtreeIds(work: Work, group: number, skip: ReadonlySet<NodeId>): NodeId[] {
  return work.workflow.nodes.flatMap((node) =>
    !skip.has(node.id) && lineage(work.membership.get(node.id), work.parents).includes(group)
      ? [node.id]
      : [],
  );
}

export function itemsOf(work: Work, container: Container, skip: ReadonlySet<NodeId>): Item[] {
  const items: Item[] = [];
  const children = new Map<number, NodeId[]>();
  for (const node of work.workflow.nodes) {
    if (skip.has(node.id)) continue;
    const at = itemAt(node.id, container, work.membership, work.parents);
    if (at === null) continue;
    if (at.kind === 'group') {
      children.set(at.index, [...(children.get(at.index) ?? []), node.id]);
      continue;
    }
    const rect = nodeRect(work, node.id);
    if (rect)
      items.push({ ids: [node.id], group: null, readLeft: rect.left, readTop: rect.top, rect });
  }
  for (const [group, ids] of children) {
    const rects = ids.flatMap((id) => nodeRect(work, id) ?? []);
    const frame = groupFrame(work, group, skip);
    if (rects.length === 0 || !frame) continue;
    const box = union(rects);
    items.push({ ids, group, readLeft: box.left, readTop: box.top, rect: frame });
  }
  return items;
}

export function columnsOf(items: readonly Item[]): Item[][] {
  const byLeft = [...items].sort(
    (a, b) => a.readLeft - b.readLeft || a.readTop - b.readTop || (a.ids[0] ?? 0) - (b.ids[0] ?? 0),
  );
  const columns: Item[][] = [];
  for (const item of byLeft) {
    const column = columns.at(-1);
    const start = column?.[0]?.readLeft;
    if (column && start !== undefined && item.readLeft - start <= COLUMN_TOLERANCE) {
      column.push(item);
    } else columns.push([item]);
  }
  return columns.map((column) =>
    [...column].sort(
      (a, b) =>
        a.readTop - b.readTop || a.readLeft - b.readLeft || (a.ids[0] ?? 0) - (b.ids[0] ?? 0),
    ),
  );
}

export function translate(work: Work, ids: readonly NodeId[], dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  for (const id of ids) {
    const node = work.byId.get(id);
    if (!node) continue;
    const [x, y] = work.pos.get(id) ?? positionOf(node);
    work.pos.set(id, [x + dx, y + dy]);
    work.moved.add(id);
  }
}

export function idsOf(items: readonly Item[]): NodeId[] {
  return items.flatMap((item) => item.ids);
}

export function columnLeft(column: readonly Item[]): number {
  return Math.min(...column.map((item) => item.readLeft));
}

export function columnRight(column: readonly Item[]): number {
  return Math.max(...column.map((item) => item.rect.right));
}

export function overlapsVertically(a: NodeRect, b: NodeRect): boolean {
  return a.top < b.bottom && b.top < a.bottom;
}

export function containsItem(item: Item, id: NodeId): boolean {
  return item.ids.includes(id);
}

export function groupFrame(work: Work, group: number, skip: ReadonlySet<NodeId>): NodeRect | null {
  const rects: NodeRect[] = [];
  for (const [id, member] of work.membership) {
    if (member !== group || skip.has(id)) continue;
    const rect = nodeRect(work, id);
    if (rect) rects.push(rect);
  }
  for (const [child, parent] of work.parents) {
    if (parent !== group) continue;
    const frame = groupFrame(work, child, skip);
    if (frame) rects.push(frame);
  }
  return rects.length === 0 ? null : frameAround(rects);
}

export function parentOf(work: Work, group: number): Container {
  return work.parents.get(group) ?? null;
}

export function framesUp(
  work: Work,
  container: Container,
  skip: ReadonlySet<NodeId>,
): Map<number, NodeRect | null> {
  const frames = new Map<number, NodeRect | null>();
  for (const group of lineage(container ?? undefined, work.parents)) {
    frames.set(group, groupFrame(work, group, skip));
  }
  return frames;
}

export function startWork(
  workflow: Workflow,
  layout: OrderLayout,
  membership?: Membership,
  parents?: GroupParents,
): Work {
  return {
    workflow,
    layout,
    byId: new Map(workflow.nodes.map((node) => [node.id, node])),
    pos: new Map(),
    membership: new Map(membership ?? groupMembership(workflow, layout)),
    parents: new Map(parents ?? groupParents(workflow)),
    moved: new Set(),
  };
}

export function finish(work: Work): Workflow {
  let changed = false;
  const nodes = work.workflow.nodes.map((node) => {
    const next = work.pos.get(node.id);
    if (!next) return node;
    const [x, y] = positionOf(node);
    const still =
      Math.abs(next[0] - x) < SAME_POSITION_TOLERANCE &&
      Math.abs(next[1] - y) < SAME_POSITION_TOLERANCE;
    if (still) return node;
    changed = true;
    return { ...node, pos: next };
  });
  const placed = changed ? { ...work.workflow, nodes } : work.workflow;
  const framed = withGroupBounds(placed, work.membership, work.layout, work.parents);
  const moved = new Set(
    framed.nodes.filter((node, at) => node !== work.workflow.nodes[at]).map((node) => node.id),
  );
  return moved.size === 0 ? framed : routeLongLinks(framed, work.layout, moved);
}
