const DATA_URL_LIMIT = 200;

function replaced(value: unknown): unknown {
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return `<Blob ${value.type || '?'} ${value.size} B>`;
  }
  if (value instanceof ArrayBuffer) return `<binary ${value.byteLength} B>`;
  if (ArrayBuffer.isView(value)) return `<binary ${value.byteLength} B>`;
  if (typeof value === 'string' && value.startsWith('data:') && value.length > DATA_URL_LIMIT) {
    return `<${value.slice(0, value.indexOf(',') + 1)}… ${value.length} chars>`;
  }
  return value;
}

export interface RawText {
  readonly text: string;
  readonly truncated: boolean;
}

export function rawText(value: unknown, limit: number): RawText {
  const full =
    typeof value === 'string'
      ? value
      : (JSON.stringify(value, (_key, item: unknown) => replaced(item), 2) ?? String(value));
  return full.length > limit
    ? { text: full.slice(0, limit), truncated: true }
    : { text: full, truncated: false };
}
