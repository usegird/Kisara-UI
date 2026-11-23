import { groupSortId } from '@/components/comfy/flow/flow-dnd';
import type { GroupLabel } from '@/graph/groups';
import type { DropSide } from '@/graph/order-move';
import type { NodeId } from '@/graph/types';

export type OutlineEntry =
  | { readonly kind: 'card'; readonly id: NodeId }
  | {
      readonly kind: 'group';
      readonly label: GroupLabel;
      readonly entries: readonly OutlineEntry[];
    };

export function entryKey(entry: OutlineEntry): string {
  return entry.kind === 'card' ? String(entry.id) : groupSortId(entry.label.key);
}

export function entrySortId(entry: OutlineEntry): NodeId | string {
  return entry.kind === 'card' ? entry.id : entryKey(entry);
}

export function entryCardIds(entry: OutlineEntry): NodeId[] {
  return entry.kind === 'card' ? [entry.id] : entry.entries.flatMap(entryCardIds);
}

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

function insertAt<T>(items: readonly T[], at: number, item: T): T[] {
  return [...items.slice(0, at), item, ...items.slice(at)];
}

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

interface Placement {
  readonly beside: SortKey;
  readonly offset: number;
  readonly item: OutlineEntry;
}

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

export function withPreview(
  outline: readonly OutlineEntry[],
  preview: DragPreview | null,
): readonly OutlineEntry[] {
  if (preview === null) return outline;
  const { id, group, beside, side } = preview;
  const removed = without(outline, id);
  if (removed.taken === null) return outline;
  const offset = side === 'after' ? 1 : 0;
  return inserted(removed.entries, group, { beside, offset, item: removed.taken }) ?? outline;
}

export interface SortLists {
  readonly outer: readonly SortKey[];
  readonly members: ReadonlyMap<string, readonly SortKey[]>;
}

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
