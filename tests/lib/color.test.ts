import { describe, expect, it } from 'vitest';

import { paintableColor, scaleHexColor, toHexColor } from '@/lib/color';

describe('色の整形', () => {
  it('3 桁は 6 桁に広げ、6 桁はそのまま小文字にする', () => {
    expect(toHexColor('#322')).toBe('#332222');
    expect(toHexColor('#2A363B')).toBe('#2a363b');
  });

  it('色の名前や rgb() など、色選びが受けない書き方は null', () => {
    expect(toHexColor('red')).toBeNull();
    expect(toHexColor('rgb(1,2,3)')).toBeNull();
    expect(toHexColor('')).toBeNull();
  });
});

describe('色の加工と確かめ', () => {
  it('各色を倍率で暗くする', () => {
    expect(scaleHexColor('#553333', 2 / 3)).toBe('#392222');
    expect(scaleHexColor('bad', 0.5)).toBeNull();
  });

  it('ワークフローから来た色は、塗れる形のものだけ通す', () => {
    expect(paintableColor('#533')).toBe('#533');
    expect(paintableColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(paintableColor('red;background:url(x)')).toBeNull();
    expect(paintableColor(42)).toBeNull();
  });
});
