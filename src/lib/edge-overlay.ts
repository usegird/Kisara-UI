import type { Point } from '@/lib/point';

export type EdgeDock = 'right' | 'bottom';

interface EdgeArea {
  readonly right: number;
  readonly bottom: number;
}

export function edgeOverlayCovers(
  area: EdgeArea,
  dock: EdgeDock,
  size: number,
  point: Point,
): boolean {
  return dock === 'right' ? point.x >= area.right - size : point.y >= area.bottom - size;
}

export function edgeOverlayOverlaps(
  area: EdgeArea,
  dock: EdgeDock,
  size: number,
  box: EdgeArea,
): boolean {
  return dock === 'right' ? box.right > area.right - size : box.bottom > area.bottom - size;
}
