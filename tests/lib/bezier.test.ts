import { describe, expect, it } from 'vitest';

import { arcPath, bezierPath } from '@/lib/bezier';

function numbersIn(path: string): number[] {
  return [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

describe('接続線のパス', () => {
  it('右へ進む線は制御点を右へ張り出す', () => {
    const [, , c1x, , c2x] = numbersIn(bezierPath({ x: 0, y: 0 }, { x: 200, y: 100 }));

    expect(c1x).toBeGreaterThan(0);
    expect(c2x).toBeLessThan(200);
  });

  it('左へ戻る線は制御点も逆向きに張り出す（回り込ませない）', () => {
    const [, , c1x, , c2x] = numbersIn(bezierPath({ x: 200, y: 0 }, { x: 0, y: 100 }));

    expect(c1x).toBeLessThan(200);
    expect(c2x).toBeGreaterThan(0);
  });
});

describe('直結の弧', () => {
  it('両端の外側へ膨らませる（真下へ引いても重ならない）', () => {
    expect(arcPath({ x: 100, y: 0 }, { x: 100, y: 200 }, 40)).toBe(
      'M 100 0 C 140 0, 140 200, 100 200',
    );
  });

  it('制御点は始点・終点と同じ高さに置く（縦に膨らませない）', () => {
    const [, y, , c1y, , c2y] = numbersIn(arcPath({ x: 10, y: 5 }, { x: 20, y: 90 }));

    expect(y).toBe(5);
    expect(c1y).toBe(5);
    expect(c2y).toBe(90);
  });
});
