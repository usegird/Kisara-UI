import { useDndMonitor, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core';
import { useEffect } from 'react';

let tracked: { x: number; y: number } | null = null;

function onPointerMove(event: PointerEvent): void {
  tracked = { x: event.clientX, y: event.clientY };
}

export function useTrackedDragPointer(): void {
  const stop = (): void => {
    document.removeEventListener('pointermove', onPointerMove, true);
    tracked = null;
  };
  useDndMonitor({
    onDragStart: () => {
      tracked = null;
      document.addEventListener('pointermove', onPointerMove, true);
    },
    onDragEnd: stop,
    onDragCancel: stop,
  });
  useEffect(() => stop, []);
}

export function dragPointer(
  event: DragStartEvent | DragMoveEvent,
): { readonly x: number; readonly y: number } | null {
  const activator = event.activatorEvent;
  if (activator instanceof MouseEvent) {
    return tracked ?? { x: activator.clientX, y: activator.clientY };
  }

  const rect = event.active.rect.current.translated ?? event.active.rect.current.initial;
  return rect ? { x: rect.left, y: rect.top + rect.height / 2 } : null;
}
