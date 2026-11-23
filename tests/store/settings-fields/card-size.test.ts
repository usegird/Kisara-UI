import { describe, expect, it } from 'vitest';

import {
  CARD_HEIGHT_DEFAULT,
  CARD_HEIGHT_MAX,
  CARD_HEIGHT_MIN,
  cardMinWidth,
  normalizeCardHeight,
  parseCardHeight,
} from '@/store/settings-fields/card-size';

describe('保存値の読み直し', () => {
  it('数値でなければ既定に落とす', () => {
    expect(normalizeCardHeight(undefined)).toBe(CARD_HEIGHT_DEFAULT);
    expect(normalizeCardHeight('240')).toBe(CARD_HEIGHT_DEFAULT);
    expect(normalizeCardHeight(Number.NaN)).toBe(CARD_HEIGHT_DEFAULT);
  });

  it('範囲外は端に寄せる', () => {
    expect(normalizeCardHeight(10)).toBe(CARD_HEIGHT_MIN);
    expect(normalizeCardHeight(9999)).toBe(CARD_HEIGHT_MAX);
  });
});

describe('列の幅', () => {
  it('高さから決まる（画面が広いほど枚数が増える）', () => {
    expect(cardMinWidth(240)).toBe(168);
    expect(cardMinWidth(600)).toBe(420);
  });
});

describe('parseCardHeight', () => {
  it('整数で範囲に入ったときだけ値にする', () => {
    expect(parseCardHeight('300')).toBe(300);
    expect(parseCardHeight(' 120 ')).toBe(120);
    for (const text of ['', '-', '1', '12.5', '12e1', '0', '601', 'abc']) {
      expect(parseCardHeight(text), JSON.stringify(text)).toBeNull();
    }
  });
});
