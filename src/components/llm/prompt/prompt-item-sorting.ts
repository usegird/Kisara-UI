import {
  closestCenter,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, type SortingStrategy } from '@dnd-kit/sortable';

import type { DropSlot } from '@/chat/prompt';
import type { BandJoin } from '@/components/llm/prompt/prompt-card-style';

const ROW_GAP = 4;

function insertionIndex(
  kinds: readonly DropSlot[],
  activeIndex: number,
  overIndex: number,
): number {
  return kinds[overIndex] === 'input' || activeIndex < overIndex ? overIndex + 1 : overIndex;
}

function insertableBetween(prev: DropSlot, next: DropSlot): boolean {
  return prev !== 'fixed' || next === 'before' || next === 'after';
}

interface BandRow {
  readonly kind: DropSlot;
  readonly locked: boolean;
}

export function bandJoins(rows: readonly BandRow[]): BandJoin[] {
  const joined = (at: number): boolean => {
    const prev = rows[at - 1];
    const next = rows[at];
    if (prev === undefined || next === undefined) return false;
    return prev.locked && next.locked && !insertableBetween(prev.kind, next.kind);
  };
  return rows.map((_, at) => ({ joinUp: joined(at), joinDown: joined(at + 1) }));
}

export function droppedOrder<T>(
  ids: readonly T[],
  kinds: readonly DropSlot[],
  activeIndex: number,
  overIndex: number,
): T[] {
  const at = insertionIndex(kinds, activeIndex, overIndex);
  const active = ids[activeIndex];
  if (active === undefined) return [...ids];
  const rest = ids.filter((_, index) => index !== activeIndex);
  const target = at > activeIndex ? at - 1 : at;
  return [...rest.slice(0, target), active, ...rest.slice(target)];
}

export function droppedOrderStrategy(kinds: readonly DropSlot[]): SortingStrategy {
  return ({ activeIndex, overIndex, index, rects }) => {
    const first = rects[0];
    const current = rects[index];
    if (first === undefined || current === undefined || overIndex < 0) return null;
    if (activeIndex === overIndex) return null;
    const measured = rects.map((rect, at) => {
      const prev = rects[at - 1];
      return prev === undefined ? 0 : rect.top - (prev.top + prev.height);
    });
    const rowGap = Math.max(ROW_GAP, ...measured);
    const gaps = measured.map((gap, at) => (at === 0 ? rowGap : gap));
    const indices = rects.map((_, at) => at);
    let top = first.top;
    let placed = false;
    for (const at of droppedOrder(indices, kinds, activeIndex, overIndex)) {
      if (placed) top += gaps[at] ?? 0;
      placed = true;
      if (at === index) {
        const y = top - current.top;
        return y === 0 ? null : { x: 0, y, scaleX: 1, scaleY: 1 };
      }
      top += rects[at]?.height ?? 0;
    }
    return null;
  };
}

export function slotCollision(allowed: (id: UniqueIdentifier) => boolean): CollisionDetection {
  return (args) =>
    closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) => allowed(container.id)),
    });
}

export function slotKeyboardCoordinates(
  allowed: (id: UniqueIdentifier) => boolean,
): KeyboardCoordinateGetter {
  return (event, args) => {
    const down = event.code === 'ArrowDown';
    if (!down && event.code !== 'ArrowUp') return sortableKeyboardCoordinates(event, args);
    event.preventDefault();
    const { active, collisionRect, droppableRects, droppableContainers, over } = args.context;
    if (active === null || collisionRect === null) return undefined;
    const candidates = droppableContainers.getEnabled().flatMap((entry) => {
      const rect = droppableRects.get(entry.id);
      if (entry.disabled || !allowed(entry.id) || rect === undefined) return [];
      const ahead = down ? rect.top > collisionRect.top : rect.top < collisionRect.top;
      return ahead ? [{ id: entry.id, rect }] : [];
    });
    candidates.sort((a, b) => (down ? a.rect.top - b.rect.top : b.rect.top - a.rect.top));
    const target = candidates[0]?.id === over?.id ? candidates[1] : candidates[0];
    if (target === undefined) return undefined;
    const origin = droppableRects.get(active.id);
    const after = origin !== undefined && target.rect.top > origin.top;
    return {
      x: target.rect.left,
      y: after ? target.rect.top + target.rect.height - collisionRect.height : target.rect.top,
    };
  };
}
