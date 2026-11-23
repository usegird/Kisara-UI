import { fixedLayoutOf } from '@/graph/fixed-layout';
import { DEFAULT_ORDER_LAYOUT, rectOf, type OrderLayout } from '@/graph/node-box';
import type { NodeId, Workflow } from '@/graph/types';
import { lastGroupIdOf } from '@/graph/workflow-ids';
import { isRecord, isUnknownArray } from '@/lib/guards';

export type Membership = ReadonlyMap<NodeId, number>;

export type GroupParents = ReadonlyMap<number, number>;

export const NO_PARENTS: GroupParents = new Map();

const DEFAULT_TITLE = 'Group';
export function workflowGroups(workflow: Workflow): readonly unknown[] {
  return isUnknownArray(workflow.groups) ? workflow.groups : [];
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

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

export function groupMembership(
  workflow: Workflow,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
  exclude: ReadonlySet<NodeId> = new Set(),
): Map<NodeId, number> {
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

export function groupParents(workflow: Workflow): Map<number, number> {
  const fixed = fixedLayoutOf(workflow);
  if (fixed) return new Map(fixed.parents);

  const rects = workflowGroups(workflow).flatMap((group, index) => {
    const rect = boundingOf(group);
    return rect ? [{ index, rect, area: rect.width * rect.height }] : [];
  });
  const outer = (a: (typeof rects)[number], b: (typeof rects)[number]): boolean =>
    a.area > b.area || (a.area === b.area && a.index < b.index);
  const parents = new Map<number, number>();
  for (const child of rects) {
    let best: (typeof rects)[number] | null = null;
    for (const candidate of rects) {
      if (candidate === child || !outer(candidate, child)) continue;
      if (!containsRect(candidate.rect, child.rect)) continue;
      if (best === null || outer(best, candidate)) best = candidate;
    }
    if (best !== null) parents.set(child.index, best.index);
  }
  return parents;
}

export function lineage(group: number | undefined, parents: GroupParents): number[] {
  const chain: number[] = [];
  for (let at = group; at !== undefined && !chain.includes(at); at = parents.get(at)) {
    chain.push(at);
  }
  return chain;
}

export type LevelItem =
  | { readonly kind: 'node'; readonly id: NodeId }
  | { readonly kind: 'group'; readonly index: number };

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

export function levelItemKey(item: LevelItem): string {
  return item.kind === 'node' ? `n${String(item.id)}` : `g${String(item.index)}`;
}

export function occupiedGroups(membership: Membership, parents: GroupParents): Set<number> {
  const occupied = new Set<number>();
  for (const group of new Set(membership.values())) {
    for (const at of lineage(group, parents)) occupied.add(at);
  }
  return occupied;
}

export function groupSubtree(group: number, parents: GroupParents): Set<number> {
  const result = new Set([group]);
  for (const [child, parent] of parents) {
    if (parent === group && child !== group) {
      for (const inner of groupSubtree(child, parents)) result.add(inner);
    }
  }
  return result;
}

export function groupNodeIds(
  order: readonly NodeId[],
  group: number,
  membership: Membership,
  parents: GroupParents,
): NodeId[] {
  return order.filter((id) => lineage(membership.get(id), parents).includes(group));
}

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

export function groupKeyAt(workflow: Workflow, index: number): string {
  const group = workflowGroups(workflow)[index];
  return isRecord(group) && typeof group.id === 'number' ? String(group.id) : `i${String(index)}`;
}

export function groupIndexOf(workflow: Workflow, key: string): number {
  return workflowGroups(workflow).findIndex((_, index) => groupKeyAt(workflow, index) === key);
}

export interface GroupLabel {
  readonly key: string;
  readonly title: string;
  readonly color?: string | undefined;
}

export function groupLabelAt(workflow: Workflow, index: number): GroupLabel {
  const group = workflowGroups(workflow)[index];
  const title = isRecord(group) && typeof group.title === 'string' ? group.title : DEFAULT_TITLE;
  const color = isRecord(group) && typeof group.color === 'string' ? group.color : undefined;
  return { key: groupKeyAt(workflow, index), title, color };
}

export function groupLabelOf(labels: readonly GroupLabel[], index: number): GroupLabel {
  return labels[index] ?? { key: `i${String(index)}`, title: '' };
}

export function renameGroup(workflow: Workflow, index: number, title: string): Workflow {
  const groups = workflowGroups(workflow);
  const group = groups[index];
  if (!isRecord(group) || group.title === title) return workflow;
  return { ...workflow, groups: groups.map((g, at) => (at === index ? { ...group, title } : g)) };
}

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

export function newGroup(workflow: Workflow): Record<string, unknown> {
  return {
    id: lastGroupIdOf(workflow) + 1,
    title: DEFAULT_TITLE,
    bounding: [0, 0, 0, 0],
    flags: {},
  };
}

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

export type CardSegment<T> =
  | { readonly kind: 'single'; readonly item: T }
  | {
      readonly kind: 'group';
      readonly index: number;
      readonly items: readonly T[];
      readonly children: readonly CardSegment<T>[];
    };

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
