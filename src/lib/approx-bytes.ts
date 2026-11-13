// ─────────────────────────────
// 値を保存領域に書いたときの大きさの見積もり。文字は UTF-8 の長さ、Blob・バイト列はそのまま、
// 数は 8 バイトとして数え、物と配列は中身と鍵を足す（ブラウザの実際の持ち方とは一致しない）。
// ─────────────────────────────

/** UTF-8 で 1 バイトになる符号の上限（これ未満） */
const ONE_BYTE_LIMIT = 0x80;
/** UTF-8 で 2 バイトになる符号の上限（これ未満） */
const TWO_BYTE_LIMIT = 0x800;
const HIGH_SURROGATE_START = 0xd800;
const LOW_SURROGATE_START = 0xdc00;
const LOW_SURROGATE_END = 0xe000;
/** サロゲートの組 1 つ（4 バイト） */
const SURROGATE_PAIR_BYTES = 4;
/** 残りの BMP の文字（3 バイト） */
const BMP_CHAR_BYTES = 3;
const NUMBER_BYTES = 8;
const BOOLEAN_BYTES = 4;

/** 文字列を UTF-8 で書いたときの長さ（符号化せずに数える） */
function utf8Length(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < ONE_BYTE_LIMIT) bytes += 1;
    else if (code < TWO_BYTE_LIMIT) bytes += 2;
    // サロゲートの組は 4 バイト。上位で 4 を数え、下位では数えない
    else if (code >= HIGH_SURROGATE_START && code < LOW_SURROGATE_START) {
      bytes += SURROGATE_PAIR_BYTES;
    } else if (code >= LOW_SURROGATE_START && code < LOW_SURROGATE_END) bytes += 0;
    else bytes += BMP_CHAR_BYTES;
  }
  return bytes;
}

/** 値を保存領域に書いたときの大きさ（バイト）を見積もる。同じ物を 2 度数えない */
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
