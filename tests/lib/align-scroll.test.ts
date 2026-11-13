import { describe, expect, it } from 'vitest';

import { alignScroll } from '@/lib/align-scroll';

// ─────────────────────────────
// 2 つの列の端を同じ高さに揃える送り量。送れる余地を超えないこと。
// ─────────────────────────────

const room = (top: number, max: number): { top: number; max: number } => ({ top, max });

describe('両端を揃える送り量', () => {
  it('両方とも届くなら、押した高さで揃える', () => {
    expect(alignScroll({ from: 100, to: 500, at: 300 }, room(200, 1000), room(0, 1000))).toEqual({
      first: -200,
      second: 200,
    });
  });

  it('片方が送れないときは、その端の高さで揃える（押した高さより水平を優先）', () => {
    // 左の列は送れない（中身が短い）。右の列だけ動かして 100 に揃える
    expect(alignScroll({ from: 100, to: 500, at: 300 }, room(0, 0), room(0, 1000))).toEqual({
      first: 0,
      second: 400,
    });
  });

  it('どこでも揃えられないときは、それぞれ届くところまで寄せる', () => {
    // 右の端は上にあり、右の列は先頭にいるので下げられない
    expect(alignScroll({ from: 500, to: 100, at: 300 }, room(0, 0), room(0, 1000))).toEqual({
      first: 0,
      second: 0,
    });
  });
});
