import { describe, expect, it } from 'vitest';

import {
  normalizeSlideshowSeconds,
  SLIDESHOW_SECONDS_DEFAULT,
  SLIDESHOW_SECONDS_MAX,
  SLIDESHOW_SECONDS_MIN,
} from '@/store/settings-fields/slideshow';

describe('スライドショーの送りの間隔', () => {
  it('秒の整数にして範囲に収める', () => {
    expect(normalizeSlideshowSeconds(2.6)).toBe(3);
    expect(normalizeSlideshowSeconds(0)).toBe(SLIDESHOW_SECONDS_MIN);
    expect(normalizeSlideshowSeconds(999)).toBe(SLIDESHOW_SECONDS_MAX);
  });

  it('数でなければ既定', () => {
    expect(normalizeSlideshowSeconds('5')).toBe(SLIDESHOW_SECONDS_DEFAULT);
    expect(normalizeSlideshowSeconds(Number.NaN)).toBe(SLIDESHOW_SECONDS_DEFAULT);
  });
});
