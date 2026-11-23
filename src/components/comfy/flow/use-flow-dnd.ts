import type {
  ClientRect,
  CollisionDetection,
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
  SensorDescriptor,
  SensorOptions,
  UniqueIdentifier,
} from '@dnd-kit/core';
import { useCallback, useRef, useState } from 'react';

import type { DragPreview } from '@/components/comfy/flow/card-outline';
import { groupKeyOfContainer, sortableSlot } from '@/components/comfy/flow/flow-dnd';
import { isOutputDrag, linkFromDrag } from '@/components/comfy/flow/link-dnd';
import { sortKeyOf, useFlowSensors } from '@/components/comfy/flow/use-flow-sensors';
import { useSortCollision, type RectOf } from '@/components/comfy/flow/use-sort-collision';
import type { SortKey } from '@/graph/level-edit';
import type { DropSide } from '@/graph/order-move';
import { useGraphStore } from '@/store/use-graph-store';

interface DraggingChip {
  readonly type: string;
  readonly value: string;
}

export interface FlowDnd {
  readonly sensors: SensorDescriptor<SensorOptions>[];
  readonly collisionDetection: CollisionDetection;
  readonly dragging: DraggingChip | null;
  readonly ghost: HTMLElement | null;
  readonly preview: DragPreview | null;
  readonly draggingRoot: (element: HTMLElement | null) => void;
  readonly onDragStart: (event: DragStartEvent) => void;
  readonly onDragMove: (event: DragMoveEvent) => void;
  readonly onDragEnd: (event: DragEndEvent) => void;
  readonly onDragCancel: () => void;
}

interface DropTarget {
  readonly id: UniqueIdentifier;
  readonly rect: ClientRect | null;
  readonly data: unknown;
}

function previewAt(
  activeId: UniqueIdentifier,
  over: DropTarget | null,
  y: number | undefined,
  rectOf: RectOf,
): DragPreview | null | undefined {
  const id = sortKeyOf(activeId);
  if (id === null || !over) return undefined;
  if (over.id === activeId) return null;
  const target = rectOf(over.id, over.rect);
  if (y === undefined || !target) return undefined;
  const side: DropSide = y < target.top + target.height / 2 ? 'before' : 'after';
  const group = groupKeyOfContainer(sortableSlot(over.data)?.container);
  const beside = sortKeyOf(over.id);
  return beside === null ? undefined : { id, group, beside, side };
}

function toKeyString(key: SortKey): string {
  return typeof key === 'number' ? String(key) : `group:${key.group}`;
}

function samePreview(a: DragPreview | null, b: DragPreview | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    toKeyString(a.id) === toKeyString(b.id) &&
    toKeyString(a.beside) === toKeyString(b.beside) &&
    a.group === b.group &&
    a.side === b.side
  );
}

function snapshotOf(source: Element | null | undefined): HTMLElement | null {
  if (!source) return null;
  const copy = source.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return null;
  for (const element of [copy, ...copy.querySelectorAll<HTMLElement>('[id],[data-sort-id]')]) {
    element.removeAttribute('id');
    element.removeAttribute('data-sort-id');
  }
  copy.style.transform = '';
  copy.style.transition = '';
  copy.style.opacity = '';
  copy.style.marginLeft = '';
  copy.style.marginRight = '';
  return copy;
}

function scrollerOf(element: Element | null | undefined): HTMLElement | null {
  for (let at = element?.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if (overflowY === 'auto' || overflowY === 'scroll') return at;
  }
  return null;
}

function markDragging(element: HTMLElement | null, on: boolean): void {
  element?.toggleAttribute('data-dragging', on);
}

function useDropPreview(
  rectOf: RectOf,
  pointerNow: () => { readonly y: number } | null,
): {
  readonly preview: DragPreview | null;
  readonly show: (next: DragPreview | null) => void;
  readonly shownNow: () => DragPreview | null;
  readonly previewOf: (event: DragMoveEvent | DragEndEvent) => DragPreview | null | undefined;
} {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const shown = useRef<DragPreview | null>(null);
  const show = useCallback((next: DragPreview | null): void => {
    if (samePreview(shown.current, next)) return;
    shown.current = next;
    setPreview(next);
  }, []);
  const shownNow = useCallback(() => shown.current, []);

  const previewOf = useCallback(
    (event: DragMoveEvent | DragEndEvent): DragPreview | null | undefined => {
      const { active, over, activatorEvent, delta } = event;
      if (!(activatorEvent instanceof MouseEvent)) return undefined;
      const y = pointerNow()?.y ?? activatorEvent.clientY + delta.y;
      const target = over ? { id: over.id, rect: over.rect, data: over.data.current } : null;
      return previewAt(active.id, target, y, rectOf);
    },
    [pointerNow, rectOf],
  );
  return { preview, show, shownNow, previewOf };
}

export function useFlowDnd(): FlowDnd {
  'use no memo';
  const connect = useGraphStore((state) => state.connect);
  const connectToWidget = useGraphStore((state) => state.connectToWidget);
  const moveSortable = useGraphStore((state) => state.moveSortable);
  const { collisionDetection, rectOf, isSorting, pointerNow, begin, end } = useSortCollision();
  const { preview, show, shownNow, previewOf } = useDropPreview(rectOf, pointerNow);
  const { sensors, isKeyboard, resetKeyboard } = useFlowSensors({ isSorting, show, rectOf });

  const [dragging, setDragging] = useState<DraggingChip | null>(null);
  const root = useRef<HTMLElement | null>(null);
  const draggingRoot = useCallback((element: HTMLElement | null) => {
    root.current = element;
  }, []);

  const [ghost, setGhost] = useState<HTMLElement | null>(null);

  const onDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (isKeyboard()) return;
      const next = previewOf(event);
      if (next !== undefined) show(next);
    },
    [isKeyboard, show, previewOf],
  );

  const finish = useCallback((): void => {
    setDragging(null);
    setGhost(null);
    show(null);
    markDragging(root.current, false);
    end();
    resetKeyboard(false);
  }, [show, end, resetKeyboard]);

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      markDragging(root.current, true);
      const data = event.active.data.current;
      const sort = sortableSlot(data) !== null;
      const source = root.current?.querySelector(
        `[data-sort-id="${CSS.escape(String(event.active.id))}"]`,
      );
      begin(sort, sort ? scrollerOf(source) : null);
      resetKeyboard(event.activatorEvent instanceof KeyboardEvent);
      setDragging(isOutputDrag(data) ? { type: data.type, value: data.value } : null);
      setGhost(sort ? snapshotOf(source) : null);
    },
    [begin, resetKeyboard],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const placed = shownNow();
      const final = isKeyboard() ? placed : (placed ?? previewOf(event) ?? null);
      finish();

      const request = linkFromDrag(event.active.data.current, event.over?.data.current);
      if (request) {
        if (request.widget === null) {
          connect(request.originId, request.originSlot, request.targetId, request.targetSlot);
        } else {
          connectToWidget(request.originId, request.originSlot, request.targetId, request.widget);
        }
        return;
      }

      if (final !== null) moveSortable(final.id, final.beside, final.side);
    },
    [connect, connectToWidget, moveSortable, finish, previewOf, shownNow, isKeyboard],
  );

  return {
    sensors,
    collisionDetection,
    dragging,
    ghost,
    preview,
    draggingRoot,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel: finish,
  };
}
