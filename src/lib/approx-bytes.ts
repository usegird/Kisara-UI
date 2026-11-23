const ONE_BYTE_LIMIT = 0x80;
const TWO_BYTE_LIMIT = 0x800;
const HIGH_SURROGATE_START = 0xd800;
const LOW_SURROGATE_START = 0xdc00;
const LOW_SURROGATE_END = 0xe000;
const SURROGATE_PAIR_BYTES = 4;
const BMP_CHAR_BYTES = 3;
const NUMBER_BYTES = 8;
const BOOLEAN_BYTES = 4;

function utf8Length(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < ONE_BYTE_LIMIT) bytes += 1;
    else if (code < TWO_BYTE_LIMIT) bytes += 2;
    else if (code >= HIGH_SURROGATE_START && code < LOW_SURROGATE_START) {
      bytes += SURROGATE_PAIR_BYTES;
    } else if (code >= LOW_SURROGATE_START && code < LOW_SURROGATE_END) bytes += 0;
    else bytes += BMP_CHAR_BYTES;
  }
  return bytes;
}

export function approxBytes(value: unknown, seen = new WeakSet<object>()): number {
  if (typeof value === 'string') return utf8Length(value);
  if (typeof value === 'number' || typeof value === 'bigint') return NUMBER_BYTES;
  if (typeof value === 'boolean') return BOOLEAN_BYTES;
  if (typeof value !== 'object' || value === null) return 0;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (seen.has(value)) return 0;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.reduce((sum: number, item: unknown) => sum + approxBytes(item, seen), 0);
  }
  let bytes = 0;
  for (const [key, item] of Object.entries(value)) {
    bytes += utf8Length(key) + approxBytes(item, seen);
  }
  return bytes;
}
