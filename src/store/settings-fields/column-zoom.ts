import { clamp } from '@/lib/clamp';
import { finiteNumber, isRecord } from '@/lib/guards';

const PERCENT = 100;

export type ZoomColumn = 'app' | 'cards' | 'variables';

export type ColumnZooms = Readonly<Record<ZoomColumn, number>>;

const ZOOM_MIN = 40;
const ZOOM_MAX = 200;
const ZOOM_STEP = 20;
export const ZOOM_DEFAULT = 100;

export const DEFAULT_COLUMN_ZOOMS: ColumnZooms = {
  app: ZOOM_DEFAULT,
  cards: ZOOM_DEFAULT,
  variables: ZOOM_DEFAULT,
};

const ZOOM_COLUMNS: readonly ZoomColumn[] = ['app', 'cards', 'variables'];

function clampZoom(percent: number): number {
  const snapped = Math.round(percent / ZOOM_STEP) * ZOOM_STEP;
  return clamp(snapped, ZOOM_MIN, ZOOM_MAX);
}

export function stepZoom(percent: number, direction: number): number {
  if (direction === 0) return clampZoom(percent);
  return clampZoom(percent + Math.sign(direction) * ZOOM_STEP);
}

export function zoomFactor(percent: number): number {
  return percent / PERCENT;
}

export function normalizeZoom(value: unknown): number {
  const percent = finiteNumber(value);
  return percent === null ? ZOOM_DEFAULT : clampZoom(percent);
}

export function normalizeColumnZooms(value: unknown): ColumnZooms {
  if (!isRecord(value)) return DEFAULT_COLUMN_ZOOMS;

  const next: Record<ZoomColumn, number> = { ...DEFAULT_COLUMN_ZOOMS };
  for (const column of ZOOM_COLUMNS) {
    const percent = finiteNumber(value[column]);
    if (percent !== null) next[column] = clampZoom(percent);
  }
  return next;
}

export function anchoredScrollTop(
  scrollTop: number,
  offset: number,
  from: number,
  to: number,
): number {
  const content = (scrollTop + offset) / zoomFactor(from);
  return Math.max(0, content * zoomFactor(to) - offset);
}

export function unzoom(amount: number, factor: number): number {
  return factor > 0 ? amount / factor : amount;
}

export function zoomedTransform<T extends { readonly x: number; readonly y: number }>(
  transform: T | null,
  factor: number,
): T | null {
  if (transform === null || factor === 1) return transform;
  return { ...transform, x: unzoom(transform.x, factor), y: unzoom(transform.y, factor) };
}
