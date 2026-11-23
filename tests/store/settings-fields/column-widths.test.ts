import { describe, expect, it } from 'vitest';

import {
  COLUMN_LIMITS,
  DEFAULT_COLUMN_WIDTHS,
  normalizeColumnWidths,
  resizeColumn,
  widenFromShown,
} from '@/store/settings-fields/column-widths';

describe('列幅の変更', () => {
  it('ドラッグ量を足す', () => {
    expect(resizeColumn('cards', 400, 40)).toBe(440);
    expect(resizeColumn('cards', 400, -40)).toBe(360);
  });

  it('下限・上限で止める', () => {
    expect(resizeColumn('cards', 400, -9999)).toBe(COLUMN_LIMITS.cards.min);
    expect(resizeColumn('cards', 400, 9999)).toBe(COLUMN_LIMITS.cards.max);
    expect(resizeColumn('app', 100, -9999)).toBe(0);
  });

  it('小数は丸める（px 単位で持つ）', () => {
    expect(resizeColumn('variables', 200, 0.4)).toBe(200);
    expect(Number.isInteger(resizeColumn('variables', 200.6, 0))).toBe(true);
  });
});

describe('保存値の読み戻し', () => {
  it('壊れていれば既定に落とす', () => {
    expect(normalizeColumnWidths(null)).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(normalizeColumnWidths({ cards: 'wide' })).toEqual(DEFAULT_COLUMN_WIDTHS);
  });

  it('範囲外の保存値は収める', () => {
    expect(normalizeColumnWidths({ cards: 99999 }).cards).toBe(COLUMN_LIMITS.cards.max);
  });

  it('会話の右の列はタスクの列と別に持つ', () => {
    const widths = normalizeColumnWidths({ queue: 420 });
    expect(widths.queue).toBe(420);
    expect(widths.chatSide).toBe(DEFAULT_COLUMN_WIDTHS.chatSide);
    expect(resizeColumn('chatSide', 200, 9999)).toBe(COLUMN_LIMITS.chatSide.max);
  });

  it('欠けている列は既定で埋める', () => {
    expect(normalizeColumnWidths({ app: 300 })).toEqual({
      ...DEFAULT_COLUMN_WIDTHS,
      app: 300,
    });
  });
});

describe('アプリ入力とカードの間', () => {
  it('他の列と同じく下限・上限に収め、壊れた保存値は既定に落とす', () => {
    expect(resizeColumn('appGap', 10, -50)).toBe(COLUMN_LIMITS.appGap.min);
    expect(resizeColumn('appGap', 10, 40)).toBe(50);
    expect(normalizeColumnWidths({ appGap: 'x' }).appGap).toBe(DEFAULT_COLUMN_WIDTHS.appGap);
  });
});

describe('カードと変数の間', () => {
  it('下限を持ち、保存値に無ければ既定で埋める', () => {
    expect(resizeColumn('variablesGap', 120, -9999)).toBe(COLUMN_LIMITS.variablesGap.min);
    expect(normalizeColumnWidths({ cards: 400 }).variablesGap).toBe(
      DEFAULT_COLUMN_WIDTHS.variablesGap,
    );
  });
});

describe('widenFromShown', () => {
  it('見た目の下限より縮めてあれば、広げるときは見えている幅から広げる', () => {
    expect(150 + widenFromShown(150, 199, 10)).toBe(209);
  });

  it('縮めるとき・下限より広いときはそのまま', () => {
    expect(widenFromShown(150, 199, -10)).toBe(-10);
    expect(widenFromShown(250, 250, 10)).toBe(10);
  });
});
