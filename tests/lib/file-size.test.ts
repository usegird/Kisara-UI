// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { DICTIONARY_FILE_MAX_BYTES } from '@/chat/dictionary-file';
import { formatMegabytes, isTooLarge, MEGABYTE, wholeMegabytes } from '@/lib/file-size';
import { readAttachedImage } from '@/lib/image-attach';
import { importDictionaryFile } from '@/store/use-dictionaries-store';

function sizedFile(name: string, type: string, size: number): File {
  const file = new File(['{}'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('isTooLarge', () => {
  it('上限ちょうどは通し、超えたら断る', () => {
    expect(isTooLarge({ size: 32 * MEGABYTE }, 32 * MEGABYTE)).toBe(false);
    expect(isTooLarge({ size: 32 * MEGABYTE + 1 }, 32 * MEGABYTE)).toBe(true);
    expect(wholeMegabytes(DICTIONARY_FILE_MAX_BYTES)).toBe(32);
  });
});

describe('formatMegabytes', () => {
  it('MB を小数 1 桁で出す', () => {
    expect(formatMegabytes(1.25 * MEGABYTE)).toBe('1.3');
    expect(formatMegabytes(0)).toBe('0.0');
  });
});

describe('読む側の上限', () => {
  it('大きすぎる追加辞書は読まずに「大きすぎる」で断る', async () => {
    const file = sizedFile('big.json', 'application/json', DICTIONARY_FILE_MAX_BYTES + 1);
    expect(await importDictionaryFile(file)).toEqual({
      kind: 'error',
      fileName: 'big.json',
      problem: 'size',
    });
  });

  it('大きすぎる添付の画像は読まない', async () => {
    expect(await readAttachedImage(sizedFile('big.png', 'image/png', 65 * MEGABYTE))).toBeNull();
  });
});
