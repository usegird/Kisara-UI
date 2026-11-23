import { useRef } from 'react';

import { useDragFrom, type DragHandlers } from '@/hooks/ui/use-drag-from';

interface ScrollOrigin {
  readonly element: HTMLElement;
  readonly left: number;
  readonly top: number;
}

const CLICK_SLOP = 4;

interface DragScroll {
  readonly handlers: DragHandlers;
  readonly wasDragged: () => boolean;
}

export function useDragScroll(enabled: boolean): DragScroll {
  const dragged = useRef(false);

  const handlers = useDragFrom(
    (event: React.PointerEvent<HTMLElement>): ScrollOrigin | null => {
      dragged.current = false;
      if (!enabled || event.pointerType === 'touch') return null;

      const element = event.currentTarget;
      return { element, left: element.scrollLeft, top: element.scrollTop };
    },
    (from: ScrollOrigin, dx: number, dy: number) => {
      if (Math.abs(dx) + Math.abs(dy) >= CLICK_SLOP) dragged.current = true;
      from.element.scrollLeft = from.left - dx;
      from.element.scrollTop = from.top - dy;
    },
  );

  const wasDragged = (): boolean => dragged.current;
  return { handlers, wasDragged };
}
