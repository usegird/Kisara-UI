import { finiteNumber } from '@/lib/guards';

export interface NumberSpec {
  readonly integer: boolean;
  readonly step: number;
  readonly min: number | null;
  readonly max: number | null;
  readonly round: number | null;
}

const DEFAULT_FLOAT_STEP = 0.5;
const DEFAULT_INT_STEP = 1;
const DECIMAL_BASE = 10;

function decimalsOf(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step)));
}

function positive(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

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

export function snapNumber(value: number, spec: NumberSpec): number {
  let next = value;
  if (spec.integer) {
    const offset = spec.min === null ? 0 : spec.min % spec.step;
    next = Math.round((next - offset) / spec.step) * spec.step + offset;
  } else if (spec.round !== null) {
    const unit = spec.round;
    next = Number((Math.round(next / unit) * unit).toFixed(decimalsOf(unit)));
  }
  if (spec.min !== null) next = Math.max(spec.min, next);
  if (spec.max !== null) next = Math.min(spec.max, next);
  return next;
}
