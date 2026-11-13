// ─────────────────────────────
// Blob を画面で見せる URL。同じ Blob には同じ URL を返す（描くたびに作らない）。
// 手放さない: URL が生きている間は Blob も残るが、見せる Blob（プリセットの画像）は
// 一覧が持ち続けるので、増える量は変わらない
// ─────────────────────────────

const urls = new WeakMap<Blob, string>();

/** Blob を見せる URL を返す。同じ Blob には前に作った URL を返す */
export function blobUrl(blob: Blob): string {
  const known = urls.get(blob);
  if (known !== undefined) return known;
  const url = URL.createObjectURL(blob);
  urls.set(blob, url);
  return url;
}
