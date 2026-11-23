import { cva } from 'class-variance-authority';

import { edgeOverlayCovers, edgeOverlayOverlaps, type EdgeDock } from '@/lib/edge-overlay';
import type { Point } from '@/lib/point';

export const EDGE_OVERLAY_DELAY = 400;

export const edgeOverlay = cva(
  `bg-popover animate-in absolute z-20 flex max-h-full max-w-full overflow-hidden shadow-lg
    animation-duration-200 ease-out motion-reduce:animate-none`,
  {
    variants: {
      dock: {
        right: 'slide-in-from-right inset-y-0 right-0',
        bottom: 'slide-in-from-bottom inset-x-0 bottom-0 flex-col',
      },
    },
  },
);

export const edgeDockToggle = cva('', {
  variants: {
    dock: {
      right: 'bg-popover absolute right-3 bottom-3 border shadow-sm',
      bottom: '',
    },
  },
});

export function edgeOverlayCoversPoint(
  area: HTMLElement | null,
  dock: EdgeDock,
  size: number,
  point: Point,
): boolean {
  const rect = area?.getBoundingClientRect();
  return rect !== undefined && edgeOverlayCovers(rect, dock, size, point);
}

export function edgeOverlayOverlapsBox(
  area: HTMLElement | null,
  dock: EdgeDock,
  size: number,
  box: DOMRect,
): boolean {
  const rect = area?.getBoundingClientRect();
  return rect !== undefined && edgeOverlayOverlaps(rect, dock, size, box);
}
