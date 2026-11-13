// ─────────────────────────────
// 端末へのファイル保存。**保存先はブラウザに委ねる**（このアプリからは選べない）。
// ─────────────────────────────

/** テキストを1つのファイルとしてダウンロードさせる */
export function downloadText(text: string, filename: string, mimeType: string): void {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}

/** Blob を1つのファイルとしてダウンロードさせる */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}
