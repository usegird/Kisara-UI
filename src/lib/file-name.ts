import { hash53 } from '@/lib/hash';

// ─────────────────────────────
// 名前を、どの OS でもファイル名の 1 要素として置ける形に退避する。
// ─────────────────────────────

/** 退避する記号。Windows で使えない文字と、退避に使う `~`（制御文字は別に見る） */
const UNSAFE_MARKS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*', '~']);

/** 制御文字の範囲の終わり（これ未満）と DEL */
const CONTROL_CHAR_END = 0x20;
const DELETE_CHAR = 0x7f;
const HEX_RADIX = 16;

function isUnsafe(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code < CONTROL_CHAR_END || code === DELETE_CHAR || UNSAFE_MARKS.has(char);
}

/** Windows の予約名。拡張子の前の部分を大文字小文字を問わず比べる */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** 最後の要素の拡張子（ディレクトリの区切りをまたがない） */
const EXTENSION = /\.[^./\\]+$/u;

/** 退避した 1 要素の上限（UTF-8 のバイト数）。拡張子と OS の上限 255 の間に余裕を残す */
const MAX_BYTES = 200;
/** 上限を超えたときに残す長さ */
const KEEP_BYTES = 180;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function escapeChar(char: string): string {
  return [...encoder.encode(char)]
    .map((byte) => `~${byte.toString(HEX_RADIX).toUpperCase().padStart(2, '0')}`)
    .join('');
}

/** 1 文字ずつの退避後の断片。切るときに退避の途中で切らないよう、文字の単位で持つ */
function escapedPieces(segment: string): string[] {
  const chars = [...segment];
  const pieces = chars.map((char) => (isUnsafe(char) ? escapeChar(char) : char));

  // 末尾の `.` と空白は Windows が落とすので、最後の 1 文字を退避する
  const last = chars.length - 1;
  if (last >= 0 && (chars[last] === '.' || chars[last] === ' ')) {
    pieces[last] = escapeChar(chars[last] ?? '');
  }
  // 予約名は頭の 1 文字を退避して別の名前にする
  const stem = segment.split('.')[0] ?? '';
  if (RESERVED.test(stem) && chars.length > 0) pieces[0] = escapeChar(chars[0] ?? '');
  return pieces;
}

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** 名前の 1 要素を退避する。空なら空を返す（呼び出し側で外す） */
export function escapeFileName(segment: string): string {
  const pieces = escapedPieces(segment);
  const escaped = pieces.join('');
  if (byteLength(escaped) <= MAX_BYTES) return escaped;

  let kept = '';
  for (const piece of pieces) {
    if (byteLength(kept + piece) > KEEP_BYTES) break;
    kept += piece;
  }
  // `~~` は退避の結果には現れない（`~` の後は必ず 16 進）ので、切った印として使える
  return `${kept}~~${hash53(segment)}`;
}

/**
 * `escapeFileName` で退避した要素を元に戻す。長すぎて切った要素（`~~` とハッシュ）は戻せないので、
 * 退避を解いた残りをそのまま返す
 */
export function unescapeFileName(segment: string): string {
  return segment.replace(/(?:~[0-9A-F]{2})+/g, (run) => {
    const bytes = run
      .slice(1)
      .split('~')
      .map((hex) => Number.parseInt(hex, HEX_RADIX));
    return decoder.decode(new Uint8Array(bytes));
  });
}

/** 読める名前のまま整えるときの長さの上限（拡張子を除く文字数。OS の上限 255 バイトに余裕を残す） */
const PLAIN_NAME_MAX = 120;

/**
 * 読める名前のままファイル名に整える（ワークフローの保存名・端末に書き出すファイル。元には戻せない）。
 * OS が嫌う文字・制御文字は `_` にし、末尾の `.` と空白は落とし、予約名には `_` を前に付け、長すぎる名前は
 * 切る。同じ拡張子が付いていれば外してから付け直す。空になったら `fallback` を使う
 */
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

/** 最後の要素の拡張子を外した名前。ディレクトリは残す。拡張子が無ければそのまま */
export function withoutExtension(name: string): string {
  return name.replace(EXTENSION, '');
}

/** 経路の区切りを `/` に揃える（接続先の環境で `\` と `/` が揺れる） */
export function toSlashPath(path: string): string {
  return path.replaceAll('\\', '/');
}
