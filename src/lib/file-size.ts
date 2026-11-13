// ─────────────────────────────
// 取り込むファイルの大きさの上限。読む前に見て、大きすぎるファイルで画面を止めない（丸ごと読んでから
// 解析するので、巨大なファイルはタブが固まる）。上限の値は読む側の領域が持つ。
// ─────────────────────────────

/** 1 KB（バイト） */
const KILOBYTE = 1024;
/** 画像のファイルの上限（MB） */
const IMAGE_FILE_MAX_MEGABYTES = 20;

/** 1 MB（バイト） */
export const MEGABYTE = KILOBYTE * KILOBYTE;

/**
 * 画像のファイルの上限（アバター・ComfyUI へのアップロード・会話に添える画像）
 */
export const IMAGE_FILE_MAX_BYTES = IMAGE_FILE_MAX_MEGABYTES * MEGABYTE;

/** 上限を超えるか */
export function isTooLarge(file: { readonly size: number }, maxBytes: number): boolean {
  return file.size > maxBytes;
}

/** バイトを MB に丸める（上限・大きさを知らせの文に出す） */
export function wholeMegabytes(bytes: number): number {
  return Math.round(bytes / MEGABYTE);
}

/** バイトを MB で小数 1 桁の文字列にする */
export function formatMegabytes(bytes: number): string {
  return (bytes / MEGABYTE).toFixed(1);
}
