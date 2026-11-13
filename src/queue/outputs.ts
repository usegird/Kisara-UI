import type { OutputFileRef } from '@/port/files';

// ─────────────────────────────
// 実行結果ファイルの選び方（画像だけを新しい順に・代表の 1 枚）。純関数。
// ─────────────────────────────

const IMAGE_FILE = /\.(png|jpe?g|webp|gif|bmp)$/i;

/**
 * 画像のファイルか。`type` は `output`（保存されたもの）と `temp`（プレビュー用）があり、
 * `temp` は ComfyUI の再起動で消えるが、どちらも同じ結果なので種別で優先順位を付けない。
 * 1 件のタスクが複数の画像を出すこともあり、そのすべてを対等に扱う
 */
export function isImageFile(file: OutputFileRef): boolean {
  return IMAGE_FILE.test(file.filename);
}

/** そのタスクの画像を**新しい順**に並べる。最後に出たものが先頭 */
export function imagesOf(outputs: readonly OutputFileRef[]): OutputFileRef[] {
  return outputs.filter(isImageFile).reverse();
}

/** 代表として出す 1 枚（縮小画像・埋め込みの読み先）。最後に出たもの。無ければ null */
export function pickImage(outputs: readonly OutputFileRef[]): OutputFileRef | null {
  return imagesOf(outputs)[0] ?? null;
}
