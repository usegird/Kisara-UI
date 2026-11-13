// ─────────────────────────────
// Blob の中身の SHA-256（16 進）。同じ画像を同じ名前にするのに使う。
// 同期で求める文字列のハッシュは `hash.ts`（暗号用ではない）。
// ─────────────────────────────

const HEX_RADIX = 16;

/** Blob の中身。`arrayBuffer` を持たない実装（古い jsdom）では FileReader で読む */
function bytesOf(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error('read failed'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(blob);
  });
}

/** Blob の中身の SHA-256 を 16 進 64 字で返す */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await bytesOf(blob));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(HEX_RADIX).padStart(2, '0'))
    .join('');
}
