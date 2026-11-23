import { IMAGE_FILE_MAX_BYTES, isTooLarge } from '@/lib/file-size';

export const ATTACH_MAX_EDGE = 1024;

const JPEG_QUALITY = 0.85;

const ATTACH_MAX_FILE_BYTES = IMAGE_FILE_MAX_BYTES;

export function isImageFile(file: { readonly type: string }): boolean {
  return file.type.startsWith('image/');
}

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

export async function toPngImage(image: Blob): Promise<Blob | null> {
  if (image.type === 'image/png') return image;
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(image).catch(() => null);
  if (bitmap === null) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (context === null) return null;
    context.drawImage(bitmap, 0, 0);
    return await toBlob(canvas, 'image/png');
  } finally {
    bitmap.close();
  }
}

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
