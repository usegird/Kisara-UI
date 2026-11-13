// ─────────────────────────────
// 予約の辞書の名前の見分け。予約の印で始まる名前はアプリが使い、利用者は付けられない。
// ─────────────────────────────

/** 予約の辞書の名前の印 */
export const RESERVED_BOOK_PREFIX = '##';

/** 予約の辞書の名前か（前後の空白は問わない） */
export function isReservedBookName(name: string): boolean {
  return name.trim().startsWith(RESERVED_BOOK_PREFIX);
}

/** 取り込んだ辞書の名前。予約の印で始まれば、先頭の `#` を外す */
export function importedBookName(name: string): string {
  const trimmed = name.trim();
  return isReservedBookName(trimmed) ? trimmed.replace(/^#+\s*/u, '') : trimmed;
}
