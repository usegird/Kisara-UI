import { useDndContext, useDndMonitor, type DragMoveEvent } from '@dnd-kit/core';
import { useEffect, useRef } from 'react';

import { dragPointer, useTrackedDragPointer } from '@/components/comfy/flow/drag-pointer';
import { isOutputDrag } from '@/components/comfy/flow/link-dnd';
import { edgeScrollStep } from '@/lib/edge-scroll';

export interface DragEdgeScrollProps {
  readonly columns: () => readonly (HTMLElement | null)[];
}

export function DragEdgeScroll({ columns }: DragEdgeScrollProps): null {
  const context = useDndContext();
  useTrackedDragPointer();
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<number | null>(null);
  const measure = useRef(() => {});
  useEffect(() => {
    measure.current = () =>
      context.measureDroppableContainers(
        context.droppableContainers.getEnabled().map((entry) => entry.id),
      );
  }, [context]);

  const stop = (): void => {
    pointer.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  const tick = (): void => {
    frame.current = null;
    const at = pointer.current;
    if (at === null) return;

    const column = columns().find((element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return at.x >= rect.left && at.x <= rect.right;
    });
    const step = column ? edgeScrollStep(column.getBoundingClientRect(), at.y) : 0;
    if (column && step !== 0) {
      const before = column.scrollTop;
      column.scrollBy({ top: step, behavior: 'instant' });
      if (column.scrollTop !== before) measure.current();
    }

    frame.current = requestAnimationFrame(tick);
  };

  const follow = (event: DragMoveEvent): void => {
    if (!isOutputDrag(event.active.data.current)) return;

    pointer.current = dragPointer(event);
    frame.current ??= requestAnimationFrame(tick);
  };

  useDndMonitor({ onDragMove: follow, onDragEnd: stop, onDragCancel: stop });
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return null;
}
