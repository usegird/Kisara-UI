import { describe, expect, it } from 'vitest';

import { alignScroll } from '@/lib/align-scroll';

const room = (top: number, max: number): { top: number; max: number } => ({ top, max });

describe('両端を揃える送り量', () => {
  it('両方とも届くなら、押した高さで揃える', () => {
    expect(alignScroll({ from: 100, to: 500, at: 300 }, room(200, 1000), room(0, 1000))).toEqual({
      first: -200,
      second: 200,
    });
  });

  it('片方が送れないときは、その端の高さで揃える（押した高さより水平を優先）', () => {
    expect(alignScroll({ from: 100, to: 500, at: 300 }, room(0, 0), room(0, 1000))).toEqual({
      first: 0,
      second: 400,
    });
  });

  it('どこでも揃えられないときは、それぞれ届くところまで寄せる', () => {
    expect(alignScroll({ from: 500, to: 100, at: 300 }, room(0, 0), room(0, 1000))).toEqual({
      first: 0,
      second: 0,
    });
  });
});
