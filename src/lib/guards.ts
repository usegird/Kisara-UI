// ─────────────────────────────
// 外部入力（JSON レスポンス・読み込んだファイル）を unknown のまま絞り込むための型ガード。
// `Array.isArray` は unknown を any[] に広げてしまうため、ここを唯一の入口にする。
// ─────────────────────────────

/** 配列でない物か */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 配列か。中身を unknown のまま絞る */
export function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** 文字列か */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** 文字列ならそれを、でなければ空を返す */
export function stringOr(value: unknown): string;
/** 文字列ならそれを、でなければ `fallback` を返す */
export function stringOr<F>(value: unknown, fallback: F): string | F;
export function stringOr(value: unknown, fallback: unknown = ''): unknown {
  return typeof value === 'string' ? value : fallback;
}

/** 配列の中の文字列だけ。配列でなければ空 */
export function stringArray(value: unknown): string[] {
  return isUnknownArray(value) ? value.filter(isString) : [];
}

/** 有限の数値だけを通す。`NaN` / `Infinity` / 数値以外は null */
export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
