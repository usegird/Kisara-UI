import { normalizeInRange } from '@/lib/clamp';
import { isRecord } from '@/lib/guards';

export const VIEWER_GRID_MAX = 6;

export interface ViewerGrid {
  readonly rows: number;
  readonly cols: number;
}

export const DEFAULT_VIEWER_GRID: ViewerGrid = { rows: 1, cols: 1 };

function clampGridCount(value: unknown): number {
  return normalizeInRange(value, { initial: 1, min: 1, max: VIEWER_GRID_MAX }, { round: true });
}

export function normalizeViewerGrid(value: unknown): ViewerGrid {
  if (!isRecord(value)) return DEFAULT_VIEWER_GRID;

  return { rows: clampGridCount(value.rows), cols: clampGridCount(value.cols) };
}
