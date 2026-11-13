import { normalizeInRange } from '@/lib/clamp';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// 画像ビューワーの行×列。端末に残すので、読み戻しの正規化もここに置く。
// ─────────────────────────────

/** 行と列に入れられる上限 */
export const VIEWER_GRID_MAX = 6;

/** 画像ビューワーの行と列の数 */
export interface ViewerGrid {
  readonly rows: number;
  readonly cols: number;
}

export const DEFAULT_VIEWER_GRID: ViewerGrid = { rows: 1, cols: 1 };

/** 1〜上限の整数に収める。数でなければ 1 */
function clampGridCount(value: unknown): number {
  // 上下限が整数なので、丸めてから収めても収めてから丸めても同じ値になる
  return normalizeInRange(value, { initial: 1, min: 1, max: VIEWER_GRID_MAX }, { round: true });
}

/** 保存値の読み戻し。壊れていれば既定に落とす */
export function normalizeViewerGrid(value: unknown): ViewerGrid {
  if (!isRecord(value)) return DEFAULT_VIEWER_GRID;

  return { rows: clampGridCount(value.rows), cols: clampGridCount(value.cols) };
}
