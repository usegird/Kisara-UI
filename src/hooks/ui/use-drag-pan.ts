import { useDragFrom, type DragHandlers } from '@/hooks/ui/use-drag-from';

interface PanOrigin {
  readonly left: number;
  readonly column: HTMLElement | null;
  readonly top: number;
}

export function useDragPan(
  horizontal: () => HTMLElement | null,
  column: (target: Element, event: React.PointerEvent<HTMLElement>) => HTMLElement | null,
  canStart: (target: Element) => boolean,
): DragHandlers {
  return useDragFrom(
    (event: React.PointerEvent<HTMLElement>): PanOrigin | null => {
      if (event.pointerType === 'touch') return null;
      const target = event.target;
      if (!(target instanceof Element)) return null;
      if (!event.currentTarget.contains(target) || !canStart(target)) return null;

      const focused = document.activeElement;
      if (focused instanceof HTMLElement) focused.blur();

      const vertical = column(target, event);
      return {
        left: horizontal()?.scrollLeft ?? 0,
        column: vertical,
        top: vertical?.scrollTop ?? 0,
      };
    },
    (from: PanOrigin, dx: number, dy: number) => {
      const scroller = horizontal();
      if (scroller) scroller.scrollLeft = from.left - dx;
      if (from.column) from.column.scrollTop = from.top - dy;
    },
  );
}
