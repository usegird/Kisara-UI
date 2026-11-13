import { finiteNumber } from '@/lib/guards';

// ─────────────────────────────
// 数値の入力の刻み・下限・上限・丸めを、定義（`/object_info` の入力設定）から決める。本体のコードは
// 写さず、振る舞いだけ合わせる。
// ─────────────────────────────

/** 数値の入力 1 つの刻み・下限・上限・丸め */
export interface NumberSpec {
  readonly integer: boolean;
  readonly step: number;
  readonly min: number | null;
  readonly max: number | null;
  /** 小数の丸めの単位。整数は刻みで丸めるので null */
  readonly round: number | null;
}

const DEFAULT_FLOAT_STEP = 0.5;
const DEFAULT_INT_STEP = 1;
/** 小数の桁から丸めの刻みを作る基数 */
const DECIMAL_BASE = 10;

/** 刻みの小数の桁数（0.01 → 2、0.5 → 1、1 → 0） */
function decimalsOf(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step)));
}

function positive(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

/** INT / FLOAT の入力だけ。それ以外は null */
export function numberSpec(
  type: string,
  config: Readonly<Record<string, unknown>>,
): NumberSpec | null {
  if (type !== 'INT' && type !== 'FLOAT') return null;

  const integer = type === 'INT';
  const step = positive(config.step) ?? (integer ? DEFAULT_INT_STEP : DEFAULT_FLOAT_STEP);
  return {
    integer,
    step,
    min: finiteNumber(config.min),
    max: finiteNumber(config.max),
    round: integer ? null : (positive(config.round) ?? DECIMAL_BASE ** -decimalsOf(step)),
  };
}

/**
 * 打った文字を書く値にする。受け取れなければ null（読めない・下限と上限の外・整数の欄の小数・
 * 正しく持てない大きさの整数）。受け取れたら刻みか丸めの単位に揃える
 */
export function parseNumberText(text: string, spec: NumberSpec | null): number | null {
  const trimmed = text.trim();
  const value = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(value)) return null;
  if (spec === null) return value;
  if (spec.integer && !Number.isSafeInteger(value)) return null;
  if ((spec.min !== null && value < spec.min) || (spec.max !== null && value > spec.max)) {
    return null;
  }
  return snapNumber(value, spec);
}

/** 確定した値を下限・上限に収め、刻み（整数）か丸めの単位（小数）に揃える */
export function snapNumber(value: number, spec: NumberSpec): number {
  let next = value;
  if (spec.integer) {
    const offset = spec.min === null ? 0 : spec.min % spec.step;
    next = Math.round((next - offset) / spec.step) * spec.step + offset;
  } else if (spec.round !== null) {
    // 丸めの単位の桁で切りそろえる（0.1 + 0.2 のような誤差を残さない）
    const unit = spec.round;
    next = Number((Math.round(next / unit) * unit).toFixed(decimalsOf(unit)));
  }
  if (spec.min !== null) next = Math.max(spec.min, next);
  if (spec.max !== null) next = Math.min(spec.max, next);
  return next;
}
