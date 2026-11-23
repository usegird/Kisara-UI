import type { OutputFileRef } from '@/port/files';

const IMAGE_FILE = /\.(png|jpe?g|webp|gif|bmp)$/i;

export function isImageFile(file: OutputFileRef): boolean {
  return IMAGE_FILE.test(file.filename);
}

export function imagesOf(outputs: readonly OutputFileRef[]): OutputFileRef[] {
  return outputs.filter(isImageFile).reverse();
}

export function pngOutputsOf(outputs: readonly OutputFileRef[]): OutputFileRef[] {
  return outputs.filter((file) => /\.png$/iu.test(file.filename));
}

export function pickImage(outputs: readonly OutputFileRef[]): OutputFileRef | null {
  return imagesOf(outputs)[0] ?? null;
}
