import {
  closestCenter,
  defaultKeyboardCoordinateGetter,
  pointerWithin,
  type Collision,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';

import type { SortLists } from '@/components/comfy/flow/card-outline';
import { isInputDrop } from '@/components/comfy/flow/link-dnd';
import { splitInnerGroupKey } from '@/graph/subgraph-display';
import { levelOfId } from '@/graph/subgraph-level';
import type { NodeId } from '@/graph/types';
import { isRecord } from '@/lib/guards';

const MAX_FRAME_DEPTH = 64;

function sortableContainerOf(data: unknown): unknown {
  if (!isRecord(data) || !isRecord(data.sortable)) return null;
  return data.sortable.containerId ?? null;
}

export function groupSortId(key: string): string {
  return `group:${key}`;
}

export function groupKeyOfSortId(id: unknown): string | null {
  return typeof id === 'string' && id.startsWith('group:') ? id.slice('group:'.length) : null;
}

export function groupContainerId(key: string): string {
  return `members:${key}`;
}

export function subgraphContainerId(instanceId: NodeId): string {
  return `subgraph:${String(instanceId)}`;
}

export function sortLevelOf(id: unknown): NodeId | null {
  if (typeof id === 'number') return levelOfId(id);
  const group = groupKeyOfSortId(id);
  return group === null ? null : (splitInnerGroupKey(group)?.instanceId ?? null);
}

export const GROUP_TAB_HEIGHT = 22;

export function groupKeyOfContainer(container: unknown): string | null {
  return typeof container === 'string' && container.startsWith('members:')
    ? container.slice('members:'.length)
    : null;
}

export function sortableSlot(
  data: unknown,
): { readonly container: unknown; readonly index: number } | null {
  if (!isRecord(data) || !isRecord(data.sortable)) return null;
  const { containerId, index } = data.sortable;
  return typeof index === 'number' ? { container: containerId, index } : null;
}

type KeyboardArgs = Parameters<KeyboardCoordinateGetter>[1];

function sortableItems(data: unknown): readonly unknown[] {
  if (!isRecord(data) || !isRecord(data.sortable)) return [];
  const { items } = data.sortable;
  return Array.isArray(items) ? items : [];
}

export function sortListsOf(context: KeyboardArgs['context']): SortLists {
  const level = sortLevelOf(context.active?.id);
  const entries = context.droppableContainers
    .getEnabled()
    .filter((entry) => sortLevelOf(entry.id) === level);
  const keys = (data: unknown): SortLists['outer'] =>
    sortableItems(data).flatMap((item): SortLists['outer'][number][] => {
      if (typeof item === 'number') return [item];
      const group = groupKeyOfSortId(item);
      return group === null ? [] : [{ group }];
    });
  const outerOf = entries.find((entry) => {
    const container = sortableContainerOf(entry.data.current);
    return container !== null && groupKeyOfContainer(container) === null;
  });
  const members = new Map<string, SortLists['outer']>();
  for (const entry of entries) {
    const key = groupKeyOfContainer(sortableContainerOf(entry.data.current));
    if (key === null || members.has(key)) continue;
    members.set(key, keys(entry.data.current));
  }
  return { outer: keys(outerOf?.data.current), members };
}

export const coordinateGetter: KeyboardCoordinateGetter = defaultKeyboardCoordinateGetter;

type CollisionArgs = Parameters<CollisionDetection>[0];
type Entry = CollisionArgs['droppableContainers'][number];

export type Homes = ReadonlyMap<UniqueIdentifier, unknown>;

export function homesOf(containers: CollisionArgs['droppableContainers']): Homes {
  const homes = new Map<UniqueIdentifier, unknown>();
  for (const entry of containers) {
    const container = sortableContainerOf(entry.data.current);
    if (container !== null) homes.set(entry.id, container);
  }
  return homes;
}

function hit(entry: Entry): Collision[] {
  return [{ id: entry.id, data: { droppableContainer: entry, value: 0 } }];
}

export const keepInPlace = (): null => null;

export const noLayoutAnimation = (): boolean => false;

function sortCollision(args: CollisionArgs, homes: Homes | null): Collision[] {
  const { active, droppableRects, droppableContainers } = args;
  const containerOf = (entry: Entry): unknown =>
    homes?.get(entry.id) ?? sortableContainerOf(entry.data.current);
  const own = homes?.get(active.id) ?? sortableContainerOf(active.data.current);
  const level = sortLevelOf(active.id);
  const sortables = droppableContainers.filter(
    (entry) => containerOf(entry) !== null && sortLevelOf(entry.id) === level,
  );
  const { x, y } = pointOf(args);
  const inside = (entry: Entry, band = 0): boolean => {
    const rect = droppableRects.get(entry.id);
    if (!rect) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top + band && y <= rect.bottom;
  };

  const self = sortables.find((entry) => entry.id === active.id);
  if (self && inside(self)) return hit(self);

  const frames = sortables.filter((entry) => groupKeyOfSortId(entry.id) !== null);
  const parentKey = (key: string): string | null => {
    const entry = frames.find((candidate) => candidate.id === groupSortId(key));
    return entry ? groupKeyOfContainer(containerOf(entry)) : null;
  };
  const activeKey = groupKeyOfSortId(active.id);
  const ownFrame = (key: string): boolean => {
    for (
      let at: string | null = key, steps = 0;
      at !== null && steps < MAX_FRAME_DEPTH;
      steps += 1
    ) {
      if (at === activeKey) return true;
      at = parentKey(at);
    }
    return false;
  };
  const area = (entry: Entry): number => {
    const rect = droppableRects.get(entry.id);
    return rect ? rect.width * rect.height : Number.POSITIVE_INFINITY;
  };
  const frame = frames
    .filter((entry) => !ownFrame(groupKeyOfSortId(entry.id) ?? ''))
    .filter((entry) => inside(entry, GROUP_TAB_HEIGHT))
    .reduce<Entry | undefined>(
      (best, entry) => (best && area(best) <= area(entry) ? best : entry),
      undefined,
    );
  const frameKey = frame ? groupKeyOfSortId(frame.id) : null;
  const outerEntry = sortables.find((entry) => groupKeyOfContainer(containerOf(entry)) === null);
  const outer = outerEntry ? containerOf(outerEntry) : own;
  const container = frameKey === null ? outer : groupContainerId(frameKey);
  const candidates = sortables.filter((entry) => containerOf(entry) === container);

  const pointed = candidates.find((entry) => entry.id !== active.id && inside(entry));
  if (pointed) return hit(pointed);
  const nearest = nearestEntry(candidates, droppableRects, y);
  if (nearest === undefined) return frame ? hit(frame) : [];
  return hit(nearest);
}

function pointOf({ pointerCoordinates, collisionRect }: CollisionArgs): {
  readonly x: number;
  readonly y: number;
} {
  return {
    x: pointerCoordinates?.x ?? collisionRect.left + collisionRect.width / 2,
    y: pointerCoordinates?.y ?? collisionRect.top + collisionRect.height / 2,
  };
}

function nearestEntry(
  candidates: readonly Entry[],
  rects: CollisionArgs['droppableRects'],
  y: number,
): Entry | undefined {
  let nearest: { readonly entry: Entry; readonly distance: number } | null = null;
  for (const entry of candidates) {
    const rect = rects.get(entry.id);
    if (!rect) continue;
    const distance = Math.abs(rect.top + rect.height / 2 - y);
    if (nearest === null || distance < nearest.distance) nearest = { entry, distance };
  }
  return nearest?.entry;
}

export function collisionDetection(args: CollisionArgs, homes: Homes | null = null): Collision[] {
  if (sortableContainerOf(args.active.data.current) !== null) return sortCollision(args, homes);

  const rows = args.droppableContainers.filter((container) => isInputDrop(container.data.current));
  const candidates = { ...args, droppableContainers: rows };

  return args.pointerCoordinates === null ? closestCenter(candidates) : pointerWithin(candidates);
}

export function pointerInView(
  pointer: { readonly x: number; readonly y: number } | null,
  view: { readonly top: number; readonly bottom: number } | null,
): { x: number; y: number } | null {
  if (!pointer || !view) return pointer;
  return { x: pointer.x, y: Math.min(view.bottom, Math.max(view.top, pointer.y)) };
}
