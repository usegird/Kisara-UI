const SIGNATURE = '\x89PNG\r\n\x1a\n';

const LENGTH_BYTES = 4;
const HEADER_BYTES = 8;
const CRC_BYTES = 4;
const ITXT_LANGUAGE_OFFSET = 3;

const MAX_CHUNKS = 200;

function isPng(bytes: Uint8Array): boolean {
  return [...SIGNATURE].every((char, index) => bytes[index] === char.charCodeAt(0));
}

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

  const compressed = bytes[separator + 1] === 1;
  const language = indexOfZero(bytes, separator + ITXT_LANGUAGE_OFFSET, end);
  const translated = language < 0 ? -1 : indexOfZero(bytes, language + 1, end);
  if (compressed || translated <= 0) return null;
  return [keyword, decoder.decode(bytes.subarray(translated + 1, end))];
}

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

export function findPngText(buffer: ArrayBuffer, keyword: string): string | null {
  const bytes = new Uint8Array(buffer);
  if (!isPng(bytes)) return null;
  const view = new DataView(buffer);
  const wanted = keyword.toLowerCase();
  let offset = SIGNATURE.length;

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
