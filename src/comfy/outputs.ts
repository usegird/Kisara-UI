// ─────────────────────────────
// 実行結果ファイルを取り寄せるときの扱い。選び方は実行の状況の層（`queue/outputs.ts`）。
// ─────────────────────────────

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

/** 拡張子から画像の種類を引く。分からなければ空（ブラウザの判別に任せる） */
export function imageMimeType(filename: string): string {
  const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  return IMAGE_TYPES[extension] ?? '';
}
