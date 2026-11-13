import { IMAGE_FILE_MAX_BYTES, isTooLarge } from '@/lib/file-size';

// ─────────────────────────────
// 会話に添える画像とアバターの画像の読み込み。履歴として毎回送り直すので、大きいままでは送る中身と
// 置き場の両方が膨らむ。長辺が上限を超える画像は縮める。
// ─────────────────────────────

/** 長辺の上限（px）。Gemma 3 の入力の 896px を下回らない */
export const ATTACH_MAX_EDGE = 1024;

/** 縮めたときの JPEG の品質 */
const JPEG_QUALITY = 0.85;

/** 添える画像のファイルの大きさの上限（縮める前。巨大な画像を絵にして画面を止めない） */
const ATTACH_MAX_FILE_BYTES = IMAGE_FILE_MAX_BYTES;

/** 画像のファイルか（`accept` をすり抜けた物を弾く） */
export function isImageFile(file: { readonly type: string }): boolean {
  return file.type.startsWith('image/');
}

/** 長辺を上限に収める縮尺（1 以下。収まっていれば 1） */
export function fitScale(width: number, height: number, maxEdge = ATTACH_MAX_EDGE): number {
  const edge = Math.max(width, height);
  return edge <= maxEdge || edge <= 0 ? 1 : maxEdge / edge;
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, JPEG_QUALITY));
}

/**
 * 長辺が上限を超える画像を縮めた Blob にする（アバター）。透明を残すため WebP にする
 * （書けないブラウザは PNG になる）。収まっている・縮められない（絵にできない環境を含む）ときは元のまま
 */
export async function shrinkImage(image: Blob, maxEdge = ATTACH_MAX_EDGE): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return image;
  const bitmap = await createImageBitmap(image).catch(() => null);
  if (bitmap === null) return image;
  try {
    const scale = fitScale(bitmap.width, bitmap.height, maxEdge);
    if (scale >= 1) return image;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (context === null) return image;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return (await toBlob(canvas, 'image/webp')) ?? image;
  } finally {
    bitmap.close();
  }
}

/**
 * 会話に添える画像のファイルをデータ URL にする。長辺が上限を超えれば縮めて JPEG にする。
 * 画像でない・読めない・大きすぎるファイルは null
 */
export async function readAttachedImage(file: File): Promise<string | null> {
  if (!isImageFile(file) || isTooLarge(file, ATTACH_MAX_FILE_BYTES)) return null;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (bitmap === null) return null;
  try {
    const scale = fitScale(bitmap.width, bitmap.height);
    if (scale >= 1) return await toDataUrl(file);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (context === null) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}
