import { describe, expect, it } from 'vitest';

import {
  keyboardSlots,
  withPreview,
  type DragPreview,
  type OutlineEntry,
} from '@/components/comfy/flow/card-outline';

const card = (id: number): OutlineEntry => ({ kind: 'card', id });
const group = (key: string, items: (number | OutlineEntry)[]): OutlineEntry => ({
  kind: 'group',
  label: { key, title: key },
  entries: items.map((item) => (typeof item === 'number' ? card(item) : item)),
});

type Shape = number | Shape[];

function shape(outline: readonly OutlineEntry[]): Shape[] {
  return outline.map((entry) => (entry.kind === 'card' ? entry.id : shape(entry.entries)));
}

describe('ドラッグ中の置き直し', () => {
  const outline = [card(1), group('g', [2, 3]), card(4)];

  it('外のカードを枠の中のカードの前後へ置く', () => {
    const before = withPreview(outline, { id: 1, group: 'g', beside: 3, side: 'before' });
    expect(shape(before)).toEqual([[2, 1, 3], 4]);

    const after = withPreview(outline, { id: 4, group: 'g', beside: 3, side: 'after' });
    expect(shape(after)).toEqual([1, [2, 3, 4]]);
  });

  it('メンバーを枠の外のカードかグループの前後へ置く。抜けた枠は空でも残す', () => {
    const out = withPreview(outline, { id: 2, group: null, beside: 4, side: 'before' });
    expect(shape(out)).toEqual([1, [3], 2, 4]);

    const single = [group('h', [5]), card(6)];
    const left = withPreview(single, { id: 5, group: null, beside: { group: 'h' }, side: 'after' });
    expect(shape(left)).toEqual([[], 5, 6]);
  });

  it('グループを掴んだときは段ごと動かす', () => {
    const moved = withPreview(outline, {
      id: { group: 'g' },
      group: null,
      beside: 4,
      side: 'after',
    });
    expect(shape(moved)).toEqual([1, 4, [2, 3]]);
  });

  it('関わらない段は同じものを使う。相手が見つからなければ置き直さない', () => {
    const moved = withPreview(outline, { id: 1, group: 'g', beside: 3, side: 'before' });
    expect(moved.at(-1)).toBe(outline[2]);
    expect(withPreview(outline, { id: 1, group: 'g', beside: 9, side: 'before' })).toBe(outline);
    expect(withPreview(outline, null)).toBe(outline);
  });
});

describe('キーボードの落とす先', () => {
  const lists = { outer: [1, { group: 'g' }, 4], members: new Map([['g', [2, 3]]]) };
  const label = (slot: DragPreview | null): string => {
    if (slot === null) return 'home';
    const beside = typeof slot.beside === 'number' ? String(slot.beside) : slot.beside.group;
    return `${slot.side === 'before' ? '前' : '後'}:${beside}@${slot.group ?? '外'}`;
  };

  it('外のカードは、枠に入るところで枠の先頭にも止まり、1 つずつ進む', () => {
    const { slots, home } = keyboardSlots(lists, 1);
    expect(slots.map(label)).toEqual(['home', '前:2@g', '前:3@g', '後:3@g', '前:4@外', '後:4@外']);
    expect(home).toBe(0);
  });

  it('メンバーは、枠の前（外）と枠の末尾（中）の両方に止まる', () => {
    const { slots, home } = keyboardSlots(lists, 2);
    expect(slots.map(label)).toEqual([
      '前:1@外',
      '前:g@外',
      'home',
      '後:3@g',
      '前:4@外',
      '後:4@外',
    ]);
    expect(home).toBe(2);
  });

  it('グループは枠の外だけを進む', () => {
    const { slots, home } = keyboardSlots(lists, { group: 'g' });
    expect(slots.map(label)).toEqual(['前:1@外', 'home', '後:4@外']);
    expect(home).toBe(1);
  });
});

describe('入れ子の枠', () => {
  const outline = [card(1), group('outer', [group('inner', [2, 3]), 4]), card(5)];

  it('外のカードを内側の枠のカードの前後へ置く。関わらない段は同じものを使う', () => {
    const moved = withPreview(outline, { id: 5, group: 'inner', beside: 2, side: 'after' });
    expect(shape(moved)).toEqual([1, [[2, 5, 3], 4]]);
    expect(moved[0]).toBe(outline[0]);
  });

  it('グループを別の枠の中へ置き、内側のグループを外へ出す', () => {
    const into = withPreview(outline, {
      id: { group: 'inner' },
      group: null,
      beside: 5,
      side: 'after',
    });
    expect(shape(into)).toEqual([1, [4], 5, [2, 3]]);
  });

  it('グループを自分の枠の中へは置き直さない', () => {
    const self = withPreview(outline, {
      id: { group: 'outer' },
      group: 'inner',
      beside: 2,
      side: 'after',
    });
    expect(self).toBe(outline);
  });

  it('キーボードでは内側の枠の先頭と末尾にも止まり、グループは自分の中に入らない', () => {
    const lists = {
      outer: [1, { group: 'outer' }, 5],
      members: new Map<string, (number | { group: string })[]>([
        ['outer', [{ group: 'inner' }, 4]],
        ['inner', [2, 3]],
      ]),
    };
    const label = (slot: DragPreview | null): string => {
      if (slot === null) return 'home';
      const beside = typeof slot.beside === 'number' ? String(slot.beside) : slot.beside.group;
      return `${slot.side === 'before' ? '前' : '後'}:${beside}@${slot.group ?? '外'}`;
    };
    expect(keyboardSlots(lists, 5).slots.map(label)).toEqual([
      '前:1@外',
      '前:outer@外',
      '前:inner@outer',
      '前:2@inner',
      '前:3@inner',
      '後:3@inner',
      '前:4@outer',
      '後:4@outer',
      'home',
    ]);
    const own = keyboardSlots(lists, { group: 'outer' }).slots.map(label);
    expect(own).toEqual(['前:1@外', 'home', '後:5@外']);
  });
});
