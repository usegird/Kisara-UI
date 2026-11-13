import { clamp } from '@/lib/clamp';
import { finiteNumber, isRecord } from '@/lib/guards';

// ─────────────────────────────
// 列の倍率の計算と読み戻し。保存は設定ストアが持つ。
// 値は**百分率の整数**で持つ（0.2 刻みの小数を足し引きすると誤差が積もるため）。
// ─────────────────────────────

/** 百分率の換算 */
const PERCENT = 100;

/** 倍率を持つ列 */
export type ZoomColumn = 'app' | 'cards' | 'variables';

/** 列ごとの倍率（百分率） */
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

/** 刻みに揃えて範囲に収める。刻みから外れた値は近い刻みへ寄せる */
function clampZoom(percent: number): number {
  const snapped = Math.round(percent / ZOOM_STEP) * ZOOM_STEP;
  return clamp(snapped, ZOOM_MIN, ZOOM_MAX);
}

/** 1 刻み動かす。`direction` が正なら広げ、負なら縮める */
export function stepZoom(percent: number, direction: number): number {
  if (direction === 0) return clampZoom(percent);
  return clampZoom(percent + Math.sign(direction) * ZOOM_STEP);
}

/** CSS の `zoom` に渡す倍率（1 が等倍） */
export function zoomFactor(percent: number): number {
  return percent / PERCENT;
}

/**
 * 1 つの倍率（狭い画面の倍率）の保存値の読み戻し。壊れていれば既定
 */
export function normalizeZoom(value: unknown): number {
  const percent = finiteNumber(value);
  return percent === null ? ZOOM_DEFAULT : clampZoom(percent);
}

/** 保存値の読み戻し。壊れていれば既定に落とす */
export function normalizeColumnZooms(value: unknown): ColumnZooms {
  if (!isRecord(value)) return DEFAULT_COLUMN_ZOOMS;

  const next: Record<ZoomColumn, number> = { ...DEFAULT_COLUMN_ZOOMS };
  for (const column of ZOOM_COLUMNS) {
    const percent = finiteNumber(value[column]);
    if (percent !== null) next[column] = clampZoom(percent);
  }
  return next;
}

/**
 * 倍率を変えたあと、指していた所を同じ位置に残すための送り量。
 * `offset` は列の上端から指した位置まで（画面の px）。送り量も画面の px
 */
export function anchoredScrollTop(
  scrollTop: number,
  offset: number,
  from: number,
  to: number,
): number {
  const content = (scrollTop + offset) / zoomFactor(from);
  return Math.max(0, content * zoomFactor(to) - offset);
}

/**
 * 倍率をかけた中で使う移動量。並べ替えのずらし量など、画面の px で求めた量を
 * 倍率のかかった要素に渡すと倍率の分だけ余計に動くので、倍率で割り戻す
 */
export function unzoom(amount: number, factor: number): number {
  return factor > 0 ? amount / factor : amount;
}

/** 並べ替えのずらし量（`x` / `y`）を倍率で割り戻す。大きさの比はそのまま */
export function zoomedTransform<T extends { readonly x: number; readonly y: number }>(
  transform: T | null,
  factor: number,
): T | null {
  if (transform === null || factor === 1) return transform;
  return { ...transform, x: unzoom(transform.x, factor), y: unzoom(transform.y, factor) };
}
