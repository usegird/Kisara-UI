import { isPngData } from '@/lib/png-text';

const SIGNATURE: readonly number[] = Array.from('\x89PNG\r\n\x1a\n', (char) => char.charCodeAt(0));
const HEADER_BYTES = 8;
const TYPE_OFFSET = 4;
const CRC_BYTES = 4;
const CRC_POLYNOMIAL = 0xedb88320;
const BYTE_VALUES = 256;
const BYTE_BITS = 8;
const ALL_ONES = 0xffffffff;
const BYTE_MASK = 0xff;
const ZTXT_METHOD = 0;
const MAX_KEYWORD_LENGTH = 79;

export interface PngChunk {
  readonly type: string;
  readonly data: Uint8Array;
}

const TEXT_TYPES: readonly string[] = ['tEXt', 'zTXt', 'iTXt'];

const latin1 = new TextDecoder('latin1');

export function readPngChunks(buffer: ArrayBuffer): PngChunk[] | null {
  if (!isPngData(buffer)) return null;
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const chunks: PngChunk[] = [];
  let offset = SIGNATURE.length;
  while (offset + HEADER_BYTES <= bytes.length) {
    const length = view.getUint32(offset);
    const start = offset + HEADER_BYTES;
    const end = start + length;
    if (end + CRC_BYTES > bytes.length) return null;
    const type = latin1.decode(bytes.subarray(offset + TYPE_OFFSET, start));
    chunks.push({ type, data: bytes.slice(start, end) });
    if (type === 'IEND') return chunks;
    offset = end + CRC_BYTES;
  }
  return null;
}

export function buildPng(chunks: readonly PngChunk[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce(
    (sum, chunk) => sum + HEADER_BYTES + chunk.data.length + CRC_BYTES,
    SIGNATURE.length,
  );
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set(SIGNATURE, 0);
  let offset = SIGNATURE.length;
  for (const chunk of chunks) {
    view.setUint32(offset, chunk.data.length);
    const typeBytes = Uint8Array.from(chunk.type, (char) => char.charCodeAt(0) & BYTE_MASK);
    out.set(typeBytes, offset + TYPE_OFFSET);
    out.set(chunk.data, offset + HEADER_BYTES);
    const crcEnd = offset + HEADER_BYTES + chunk.data.length;
    view.setUint32(crcEnd, crc32(out.subarray(offset + TYPE_OFFSET, crcEnd)));
    offset = crcEnd + CRC_BYTES;
  }
  return out;
}

export function textKeywordOf(chunk: PngChunk): string | null {
  if (!TEXT_TYPES.includes(chunk.type)) return null;
  const separator = chunk.data.indexOf(0);
  return separator <= 0 ? null : latin1.decode(chunk.data.subarray(0, separator));
}

export async function createZtxtChunk(keyword: string, text: string): Promise<PngChunk> {
  if (keyword.length === 0 || keyword.length > MAX_KEYWORD_LENGTH) {
    throw new RangeError(`keyword length ${String(keyword.length)}`);
  }
  const head = Uint8Array.from(`${keyword}\0`, (char) => char.charCodeAt(0) & BYTE_MASK);
  const body = await deflate(Uint8Array.from(text, (char) => char.charCodeAt(0) & BYTE_MASK));
  const data = new Uint8Array(head.length + 1 + body.length);
  data.set(head, 0);
  data[head.length] = ZTXT_METHOD;
  data.set(body, head.length + 1);
  return { type: 'zTXt', data };
}

export async function readZtxtText(chunk: PngChunk): Promise<string | null> {
  if (chunk.type !== 'zTXt') return null;
  const separator = chunk.data.indexOf(0);
  if (separator <= 0 || chunk.data[separator + 1] !== ZTXT_METHOD) return null;
  const body = await inflate(chunk.data.subarray(separator + 2)).catch(() => null);
  return body === null ? null : latin1.decode(body);
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

let crcTable: Uint32Array | null = null;

function crcTableOf(): Uint32Array {
  if (crcTable !== null) return crcTable;
  const table = new Uint32Array(BYTE_VALUES);
  for (let n = 0; n < BYTE_VALUES; n += 1) {
    let c = n;
    for (let k = 0; k < BYTE_BITS; k += 1) c = c & 1 ? CRC_POLYNOMIAL ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(bytes: Uint8Array): number {
  const table = crcTableOf();
  let c = ALL_ONES;
  for (const byte of bytes) c = (table[(c ^ byte) & BYTE_MASK] ?? 0) ^ (c >>> BYTE_BITS);
  return (c ^ ALL_ONES) >>> 0;
}
