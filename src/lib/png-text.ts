// ─────────────────────────────
// PNG のテキストチャンク読み取り（汎用。ComfyUI の知識は持たない）。
// **圧縮されているものは読まない**（zlib を積まない）。
// ─────────────────────────────

// PNG は 8 バイトの署名のあと `[長さ4][種別4][データ][CRC4]` の並び。
// `tEXt` は `キーワード\0テキスト`、`iTXt` は `キーワード\0圧縮フラグ1 圧縮方式1
// 言語\0翻訳キーワード\0テキスト`

/** PNG の署名（8 バイト）。1 文字が 1 バイト */
const SIGNATURE = '\x89PNG\r\n\x1a\n';

/** チャンクの長さの欄のバイト数 */
const LENGTH_BYTES = 4;
/** チャンクの長さと種別の欄を合わせたバイト数 */
const HEADER_BYTES = 8;
/** チャンクの末尾の CRC のバイト数 */
const CRC_BYTES = 4;
/** iTXt のキーワードの区切りから言語の始まりまで（区切り・圧縮フラグ・圧縮方式） */
const ITXT_LANGUAGE_OFFSET = 3;

/** チャンクを読み進める上限。壊れたデータで無限に回らないようにする */
const MAX_CHUNKS = 200;

function isPng(bytes: Uint8Array): boolean {
  return [...SIGNATURE].every((char, index) => bytes[index] === char.charCodeAt(0));
}

/** PNG の署名で始まるか（中身のチャンクは見ない） */
export function isPngData(buffer: ArrayBuffer): boolean {
  return isPng(new Uint8Array(buffer));
}

function indexOfZero(bytes: Uint8Array, from: number, end: number): number {
  for (let index = from; index < end; index += 1) {
    if (bytes[index] === 0) return index;
  }
  return -1;
}

const decoder = new TextDecoder();

/** `offset` から始まるチャンクの種別とデータの範囲 */
function chunkAt(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
): { readonly type: string; readonly start: number; readonly end: number } {
  const length = view.getUint32(offset);
  const type = decoder.decode(bytes.subarray(offset + LENGTH_BYTES, offset + HEADER_BYTES));
  const start = offset + HEADER_BYTES;
  return { type, start, end: start + length };
}

/** `tEXt` / 非圧縮の `iTXt` のキーワードと本文。読めなければ null */
function readTextChunk(
  bytes: Uint8Array,
  type: string,
  start: number,
  end: number,
): readonly [string, string] | null {
  const separator = indexOfZero(bytes, start, end);
  if (separator <= 0) return null;
  const keyword = decoder.decode(bytes.subarray(start, separator));

  if (type === 'tEXt') return [keyword, decoder.decode(bytes.subarray(separator + 1, end))];

  // iTXt: 圧縮フラグが 0（非圧縮）のものだけ読む
  const compressed = bytes[separator + 1] === 1;
  const language = indexOfZero(bytes, separator + ITXT_LANGUAGE_OFFSET, end);
  const translated = language < 0 ? -1 : indexOfZero(bytes, language + 1, end);
  if (compressed || translated <= 0) return null;
  return [keyword, decoder.decode(bytes.subarray(translated + 1, end))];
}

/** `tEXt` / 非圧縮の `iTXt` を「キーワード → テキスト」で返す */
export function readPngTextChunks(buffer: ArrayBuffer): Map<string, string> {
  const bytes = new Uint8Array(buffer);
  const result = new Map<string, string>();
  if (!isPng(bytes)) return result;

  const view = new DataView(buffer);
  let offset = SIGNATURE.length;

  for (let count = 0; count < MAX_CHUNKS && offset + HEADER_BYTES <= bytes.length; count += 1) {
    const { type, start, end } = chunkAt(bytes, view, offset);
    if (end > bytes.length) break;

    if (type === 'tEXt' || type === 'iTXt') {
      const text = readTextChunk(bytes, type, start, end);
      if (text !== null) result.set(text[0], text[1]);
    }
    if (type === 'IEND') break;

    offset = end + CRC_BYTES;
  }

  return result;
}

/**
 * キーワードが一致する最初の `tEXt` の本文（大文字小文字を区別しない）。無ければ null。
 * 同じキーワードが複数あるとき、`readPngTextChunks` は後のものを返すが、こちらは最初のもの
 */
export function findPngText(buffer: ArrayBuffer, keyword: string): string | null {
  const bytes = new Uint8Array(buffer);
  if (!isPng(bytes)) return null;
  const view = new DataView(buffer);
  const wanted = keyword.toLowerCase();
  let offset = SIGNATURE.length;

  // カードは画像のデータ（IDAT が数百に分かれることがある）の後ろに置かれるので、数で打ち切らない。
  // 1 回ごとに必ず 12 バイト以上進むので、終わりは長さで決まる
  while (offset + HEADER_BYTES <= bytes.length) {
    const { type, start, end } = chunkAt(bytes, view, offset);
    if (end > bytes.length || type === 'IEND') break;
    if (type === 'tEXt') {
      const separator = indexOfZero(bytes, start, end);
      const name = separator > 0 ? decoder.decode(bytes.subarray(start, separator)) : '';
      if (name.toLowerCase() === wanted) return decoder.decode(bytes.subarray(separator + 1, end));
    }
    offset = end + CRC_BYTES;
  }
  return null;
}
