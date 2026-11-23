import { hash53 } from '@/lib/hash';

const UNSAFE_MARKS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*', '~']);

const CONTROL_CHAR_END = 0x20;
const DELETE_CHAR = 0x7f;
const HEX_RADIX = 16;

function isUnsafe(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code < CONTROL_CHAR_END || code === DELETE_CHAR || UNSAFE_MARKS.has(char);
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const EXTENSION = /\.[^./\\]+$/u;

const MAX_BYTES = 200;
const KEEP_BYTES = 180;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function escapeChar(char: string): string {
  return [...encoder.encode(char)]
    .map((byte) => `~${byte.toString(HEX_RADIX).toUpperCase().padStart(2, '0')}`)
    .join('');
}

function escapedPieces(segment: string): string[] {
  const chars = [...segment];
  const pieces = chars.map((char) => (isUnsafe(char) ? escapeChar(char) : char));

  const last = chars.length - 1;
  if (last >= 0 && (chars[last] === '.' || chars[last] === ' ')) {
    pieces[last] = escapeChar(chars[last] ?? '');
  }
  const stem = segment.split('.')[0] ?? '';
  if (RESERVED.test(stem) && chars.length > 0) pieces[0] = escapeChar(chars[0] ?? '');
  return pieces;
}

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

export function escapeFileName(segment: string): string {
  const pieces = escapedPieces(segment);
  const escaped = pieces.join('');
  if (byteLength(escaped) <= MAX_BYTES) return escaped;

  let kept = '';
  for (const piece of pieces) {
    if (byteLength(kept + piece) > KEEP_BYTES) break;
    kept += piece;
  }
  return `${kept}~~${hash53(segment)}`;
}

export function unescapeFileName(segment: string): string {
  return segment.replace(/(?:~[0-9A-F]{2})+/g, (run) => {
    const bytes = run
      .slice(1)
      .split('~')
      .map((hex) => Number.parseInt(hex, HEX_RADIX));
    return decoder.decode(new Uint8Array(bytes));
  });
}

const PLAIN_NAME_MAX = 120;

export function plainFileName(name: string, extension: string, fallback: string): string {
  // eslint-disable-next-line no-control-regex -- 制御文字を置き換えるための範囲
  const replaced = name.trim().replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_');
  const suffix = `.${extension}`;
  const stem = replaced.toLowerCase().endsWith(suffix)
    ? replaced.slice(0, -suffix.length)
    : replaced;
  const base = [...stem]
    .slice(0, PLAIN_NAME_MAX)
    .join('')
    .replace(/[. ]+$/, '');
  const safe = RESERVED.test(base.split('.')[0] ?? '') ? `_${base}` : base;
  return `${safe.length > 0 ? safe : fallback}${suffix}`;
}

export function withoutExtension(name: string): string {
  return name.replace(EXTENSION, '');
}

export function toSlashPath(path: string): string {
  return path.replaceAll('\\', '/');
}
