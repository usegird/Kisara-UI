export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function stringOr(value: unknown): string;
export function stringOr<F>(value: unknown, fallback: F): string | F;
export function stringOr(value: unknown, fallback: unknown = ''): unknown {
  return typeof value === 'string' ? value : fallback;
}

export function stringArray(value: unknown): string[] {
  return isUnknownArray(value) ? value.filter(isString) : [];
}

export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
