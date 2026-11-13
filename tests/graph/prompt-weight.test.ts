import { describe, expect, it } from 'vitest';

import { adjustWeight } from '@/graph/prompt-weight';

// ─────────────────────────────
// 重みの増減。選んだ範囲か、キャレットを囲む括弧・語に 0.1 ずつ効かせ、1.0 で括弧を外す。
// ─────────────────────────────

/** 書き換えた後の文と、選んでいる文字 */
function apply(text: string, start: number, end: number, direction: 1 | -1) {
  const edit = adjustWeight(text, start, end, direction);
  if (edit === null) return null;
  const next = `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`;
  return { next, selected: next.slice(edit.selection.start, edit.selection.end), edit };
}

describe('選んだ範囲', () => {
  it('包んでいなければ 1.1・0.9 で包み、中身を選び直す', () => {
    expect(apply('1girl, cat, dog', 7, 10, 1)).toMatchObject({
      next: '1girl, (cat:1.1), dog',
      selected: 'cat',
    });
    expect(apply('cat', 0, 3, -1)?.next).toBe('(cat:0.9)');
  });

  it('前後の空白は包まない', () => {
    expect(apply('a, cat ', 2, 7, 1)?.next).toBe('a, (cat:1.1) ');
  });

  it('括弧の中身そのもの・括弧ごとなら、その括弧の重みを変える', () => {
    expect(apply('(cat:1.1)', 1, 4, 1)).toMatchObject({ next: '(cat:1.2)', selected: 'cat' });
    expect(apply('(cat:1.1)', 0, 9, -1)).toMatchObject({ next: 'cat', selected: 'cat' });
  });

  it('続けて押すと 0.1 ずつ進む', () => {
    let text = 'cat';
    let selection = { start: 0, end: 3 };
    for (let step = 0; step < 3; step += 1) {
      const result = apply(text, selection.start, selection.end, 1);
      text = result?.next ?? text;
      selection = result?.edit.selection ?? selection;
    }
    expect(text).toBe('(cat:1.3)');
  });

  it('空白だけを選んでいれば何もしない', () => {
    expect(adjustWeight('a,  b', 2, 4, 1)).toBeNull();
  });
});

describe('選んでいないとき', () => {
  it('キャレットを囲む括弧の重みを変え、キャレットは中身の同じ位置に残す', () => {
    const result = apply('x, (long hair:1.2), y', 8, 8, -1);
    expect(result?.next).toBe('x, (long hair:1.1), y');
    expect(result?.edit.selection).toEqual({ start: 8, end: 8 });
  });

  it('重みの無い括弧は 1.1 として扱い、1.0 で括弧を外す', () => {
    expect(apply('(cat)', 2, 2, 1)?.next).toBe('(cat:1.2)');
    expect(apply('(cat)', 2, 2, -1)?.next).toBe('cat');
  });

  it('一番内側の括弧に効かせる', () => {
    expect(apply('(a, (b:1.5))', 6, 6, 1)?.next).toBe('(a, (b:1.6))');
    expect(apply('(a, (b:1.5))', 1, 1, 1)?.next).toBe('(a, (b:1.5):1.2)');
  });

  it('括弧の外では語の前後が語でなければ何もしない（空白・, の間）', () => {
    expect(adjustWeight('cat,  dog', 5, 5, 1)).toBeNull();
    expect(adjustWeight('cat, dog', 4, 4, 1)).toBeNull();
    expect(adjustWeight('', 0, 0, 1)).toBeNull();
  });
});

describe('選んでいない・キャレットが語の上', () => {
  it('その語を 1.1・0.9 で包み、キャレットは語の中の同じ位置に残す', () => {
    const result = apply('1girl, cat, dog', 8, 8, 1);
    expect(result?.next).toBe('1girl, (cat:1.1), dog');
    expect(result?.edit.selection).toEqual({ start: 9, end: 9 });
    expect(apply('cat', 1, 1, -1)?.next).toBe('(cat:0.9)');
  });

  it('語の左右の端でも効き、空白を挟めば別の語として扱う', () => {
    expect(apply('long hair, cat', 0, 0, 1)?.next).toBe('(long:1.1) hair, cat');
    expect(apply('long hair, cat', 4, 4, 1)?.next).toBe('(long:1.1) hair, cat');
    expect(apply('long hair, cat', 9, 9, 1)?.next).toBe('long (hair:1.1), cat');
    expect(apply('a,cat', 2, 2, 1)?.next).toBe('a,(cat:1.1)');
  });

  it('\\( は語の文字として含める', () => {
    expect(apply('\\(cat\\)', 3, 3, 1)?.next).toBe('(\\(cat\\):1.1)');
  });

  it('包んだ後に続けて押すと、その括弧の重みを変える', () => {
    const first = apply('cat', 1, 1, 1);
    const caret = first?.edit.selection.start ?? 0;
    expect(apply(first?.next ?? '', caret, caret, 1)?.next).toBe('(cat:1.2)');
  });
});

describe('下限', () => {
  it('0.1 からは下げない', () => {
    expect(apply('(cat:0.2)', 2, 2, -1)?.next).toBe('(cat:0.1)');
    expect(adjustWeight('(cat:0.1)', 2, 2, -1)).toBeNull();
  });
});
