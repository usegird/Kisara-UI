import { describe, expect, it } from 'vitest';

import { isRecord } from '@/lib/guards';
import { mergeChangedItems, mergeChangedKeys } from '@/lib/merge-changes';

describe('項目ごとに重ねる', () => {
  it('このタブで変えた項目だけを当て、ほかのタブが変えた項目は置き場のまま残す', () => {
    const previous = { prompt: 'old', width: 300 };
    const stored = { prompt: 'from other tab', width: 300 };
    const next = { prompt: 'old', width: 320 };
    expect(mergeChangedKeys(stored, previous, next)).toEqual({
      prompt: 'from other tab',
      width: 320,
    });
  });

  it('入れ物の項目は丸ごと比べ、このタブで消した項目は外す', () => {
    const previous = { widths: { a: 1 }, gone: true };
    const merged = mergeChangedKeys({ widths: { a: 1 }, gone: true }, previous, {
      widths: { a: 2 },
    });
    expect(merged).toEqual({ widths: { a: 2 } });
  });

  it('置き場が読めなければ、これから書く値をそのまま使う', () => {
    expect(mergeChangedKeys(null, null, { a: 1 })).toEqual({ a: 1 });
  });

  it('`__proto__` の鍵でも親を差し替えない', () => {
    const next: unknown = JSON.parse('{"__proto__": {"x": 1}}');
    if (!isRecord(next)) throw new Error('not a record');
    const merged = mergeChangedKeys({}, {}, next);
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(Object.hasOwn(merged, '__proto__')).toBe(true);
  });
});

describe('1 件ずつ重ねる', () => {
  const a = { id: 'a', url: 'x' };
  const b = { id: 'b', url: 'y' };

  it('このタブで直した 1 件だけを当て、ほかのタブで足した 1 件は残す', () => {
    const fromOther = { id: 'c', url: 'z' };
    const merged = mergeChangedItems([a, b, fromOther], [a, b], [{ ...a, url: 'x2' }, b]);
    expect(merged).toEqual([{ id: 'a', url: 'x2' }, b, fromOther]);
  });

  it('このタブで消した 1 件は外し、足した 1 件は後ろに付ける', () => {
    const added = { id: 'd', url: 'w' };
    expect(mergeChangedItems([a, b], [a, b], [b, added])).toEqual([b, added]);
  });

  it('ほかのタブで直した 1 件は、このタブで触っていなければ置き場のまま', () => {
    const edited = { ...b, url: 'other' };
    expect(mergeChangedItems([a, edited], [a, b], [{ ...a, url: 'x3' }, b])).toEqual([
      { id: 'a', url: 'x3' },
      edited,
    ]);
  });
});
