import { describe, expect, it } from 'vitest';

import { reuseEqualItems, sameContent, sameEntries } from '@/lib/reuse-equal';

describe('中身の比較', () => {
  it('配列と素のオブジェクトは入れ子まで中身で比べる', () => {
    expect(sameContent({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] })).toBe(true);
    expect(sameContent({ a: [1, { b: 'x' }] }, { a: [1, { b: 'y' }] })).toBe(false);
  });

  it('鍵の数が違えば別物。値が undefined の鍵も数える', () => {
    expect(sameContent({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameContent([1, 2], [1, 2, 3])).toBe(false);
  });

  it('素のオブジェクトでないものは参照で比べる', () => {
    expect(sameContent(new Map(), new Map())).toBe(false);
    expect(sameContent(Number.NaN, Number.NaN)).toBe(true);
  });

  it('Map は sameEntries で鍵ごとに中身を比べる', () => {
    expect(sameEntries(new Map([['a', [1]]]), new Map([['a', [1]]]))).toBe(true);
    expect(sameEntries(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false);
    expect(sameEntries(new Map([['a', 1]]), new Map([['b', 1]]))).toBe(false);
    expect(sameEntries(new Map([['a', 1]]), new Map([['a', 1], ['b', 1]]))).toBe(false);
  });
});

describe('前回のものの使い回し', () => {
  const keyOf = (item: { readonly id: number }): number => item.id;

  it('同じ鍵で同じ中身なら前回の参照を返し、変わったものは新しい方を返す', () => {
    const previous = [
      { id: 1, value: 'a' },
      { id: 2, value: 'b' },
    ];
    const next = [
      { id: 2, value: 'b' },
      { id: 1, value: 'changed' },
      { id: 3, value: 'c' },
    ];

    const result = reuseEqualItems(previous, next, keyOf);

    expect(result[0]).toBe(previous[1]);
    expect(result[1]).toBe(next[1]);
    expect(result[2]).toBe(next[2]);
  });

  it('前回が無ければ新しい配列をそのまま返す', () => {
    const next = [{ id: 1 }];
    expect(reuseEqualItems(undefined, next, keyOf)).toBe(next);
  });
});
