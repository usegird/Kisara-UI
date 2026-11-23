const BYTE_UNIT_STEP = 1024;
const WHOLE_NUMBER_FROM = 100;

interface TruncateOptions {
  readonly singleLine?: boolean;
}

export function truncate(text: string, max: number, options: TruncateOptions = {}): string {
  const source = (options.singleLine ?? true) ? text.replace(/\s+/g, ' ').trim() : text;
  return source.length > max ? `${source.slice(0, max)}…` : source;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
  return '';
}

export function formatEditValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return '';
  if (bytes < BYTE_UNIT_STEP) return `${String(bytes)} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / BYTE_UNIT_STEP;
  let unit = 0;
  while (value >= BYTE_UNIT_STEP && unit < units.length - 1) {
    value /= BYTE_UNIT_STEP;
    unit += 1;
  }
  return `${value.toFixed(value >= WHOLE_NUMBER_FROM ? 0 : 1)} ${units[unit] ?? 'KB'}`;
}
