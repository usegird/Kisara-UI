const KILOBYTE = 1024;
const IMAGE_FILE_MAX_MEGABYTES = 20;

export const MEGABYTE = KILOBYTE * KILOBYTE;

export const IMAGE_FILE_MAX_BYTES = IMAGE_FILE_MAX_MEGABYTES * MEGABYTE;

export function isTooLarge(file: { readonly size: number }, maxBytes: number): boolean {
  return file.size > maxBytes;
}

export function wholeMegabytes(bytes: number): number {
  return Math.round(bytes / MEGABYTE);
}

export function formatMegabytes(bytes: number): string {
  return (bytes / MEGABYTE).toFixed(1);
}
