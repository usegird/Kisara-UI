// ─────────────────────────────
// 送る中身・送った中身の JSON を画面に出すときの縮め方。画像の data URL は長いので頭と長さだけにする。
// 写す本文には使わない。
// ─────────────────────────────

/** これより長い data URL を縮める */
const SHORTEN_ABOVE = 64;

/** 縮めた data URL に残す頭の長さ */
const SHORTENED_HEAD = 48;

/** `JSON.stringify` の replacer。長い data URL を頭と長さに縮める */
export function shortenDataUrl(_key: string, value: unknown): unknown {
  return typeof value === 'string' && value.startsWith('data:') && value.length > SHORTEN_ABOVE
    ? `${value.slice(0, SHORTENED_HEAD)}… (${String(value.length)} chars)`
    : value;
}
