import { finiteNumber, isRecord } from '@/lib/guards';

// ─────────────────────────────
// 4 列（App Mode / カード / 変数 / キュー）と列の間の余白 2 つの幅。ドラッグ量を幅に変える計算だけを
// ここに置き、保存は設定ストアが持つ。
// ─────────────────────────────

/**
 * 幅を持つ列と余白の鍵。
 * `appGap` と `variablesGap` は列ではなく、線を通す余白の幅。
 * `appGap` はアプリ入力とカードの間、`variablesGap` はカードと変数の間。
 * `chatSide` は会話のタブの右の列（ComfyUI の右の列 `queue` と別に持つ）
 */
export type ColumnKey =
  'app' | 'appGap' | 'cards' | 'variablesGap' | 'variables' | 'queue' | 'chatSide';

/** 右の列（ComfyUI と会話のタブ）の幅の鍵 */
export type SideColumnKey = Extract<ColumnKey, 'queue' | 'chatSide'>;

/** 列と余白ごとの幅（px） */
export type ColumnWidths = Readonly<Record<ColumnKey, number>>;

/**
 * 上限は**画面に収まる範囲**が本当の限界なので、ここは安全網として広めに取る。
 * 実際に使える上限は呼び出し側から渡す（`resizeColumn` の `max`）。
 */
export const COLUMN_LIMITS: Readonly<Record<ColumnKey, { min: number; max: number }>> = {
  app: { min: 0, max: 1600 },
  appGap: { min: 0, max: 800 },
  cards: { min: 240, max: 900 },
  // 下限は線が詰まりすぎない程度
  variablesGap: { min: 48, max: 1600 },
  variables: { min: 120, max: 640 },
  queue: { min: 0, max: 960 },
  chatSide: { min: 0, max: 960 },
};

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  app: 240,
  appGap: 10,
  cards: 424,
  variablesGap: 120,
  variables: 228,
  queue: 200,
  chatSide: 200,
};

/**
 * ドラッグ量を足して、列ごとの下限・上限に収める。
 */
export function resizeColumn(key: ColumnKey, width: number, delta: number): number {
  const { min, max } = COLUMN_LIMITS[key];

  return Math.round(Math.min(max, Math.max(min, width + delta)));
}

/**
 * 見た目の下限（中身で決まる最小幅）を持つ列の、広げる量の補正。持っている幅が見えている幅より
 * 狭い（下限より縮めた）ときに広げるなら、**見えている幅から**広げる。でないと、持っている幅が
 * 下限に追い付くまで見た目が動かない。縮めるときはそのまま
 */
export function widenFromShown(width: number, shown: number, delta: number): number {
  return delta > 0 && shown > width ? shown - width + delta : delta;
}

/** 保存値の読み戻し。壊れていれば既定に落とす */
export function normalizeColumnWidths(value: unknown): ColumnWidths {
  if (!isRecord(value)) return DEFAULT_COLUMN_WIDTHS;

  const keys = Object.keys(DEFAULT_COLUMN_WIDTHS) as ColumnKey[];

  return keys.reduce<Record<ColumnKey, number>>(
    (acc, key) => {
      const width = finiteNumber(value[key]);
      acc[key] = width === null ? DEFAULT_COLUMN_WIDTHS[key] : resizeColumn(key, width, 0);
      return acc;
    },
    { ...DEFAULT_COLUMN_WIDTHS },
  );
}
