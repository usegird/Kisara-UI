// ─────────────────────────────
// 画面に写して見せる短い識別子を作る。
// ─────────────────────────────

/** 短い識別子の文字。英小文字と数字 */
const SHORT_ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** 短い識別子の文字数 */
const SHORT_ID_LENGTH = 8;

/** 短い識別子（英小文字と数字の 8 文字。36^8 ≈ 2.8 兆通り）。画面に写して見せる id に使う */
export function newShortId(): string {
  const bytes = new Uint8Array(SHORT_ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => SHORT_ID_CHARS[byte % SHORT_ID_CHARS.length]).join('');
}
