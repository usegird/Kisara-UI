import { describe, expect, it } from 'vitest';

import { ATTACH_MAX_EDGE, fitScale, isImageFile } from '@/lib/image-attach';

describe('添える画像', () => {
  it('長辺が上限を超えるときだけ縮め、上限に収まるものは 1', () => {
    expect(fitScale(800, 600)).toBe(1);
    expect(fitScale(ATTACH_MAX_EDGE, 10)).toBe(1);
    expect(fitScale(2048, 1024)).toBe(0.5);
    expect(fitScale(100, 4096)).toBe(0.25);
    expect(fitScale(0, 0)).toBe(1);
  });

  it('画像のファイルだけを受ける', () => {
    expect(isImageFile({ type: 'image/png' })).toBe(true);
    expect(isImageFile({ type: 'image/webp' })).toBe(true);
    expect(isImageFile({ type: 'application/pdf' })).toBe(false);
    expect(isImageFile({ type: '' })).toBe(false);
  });
});
