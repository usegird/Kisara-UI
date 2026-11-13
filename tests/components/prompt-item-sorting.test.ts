import { describe, expect, it } from 'vitest';

import type { DropSlot } from '@/chat/prompt';
import {
  bandJoins,
  droppedOrder,
  droppedOrderStrategy,
} from '@/components/llm/prompt/prompt-item-sorting';

// ─────────────────────────────
// プロンプトの項目の並べ替えの見せ方。運んでいる間も落としたときも、
// 同じ「落としたあとの並び」を使う
// ─────────────────────────────

// 履歴の前の段 2 行・追加辞書の印・セッション要約・会話履歴・メッセージ・履歴の後の段 1 行・プレフィル
const ids = ['a', 'b', 'info', 'summary', 'history', 'input', 'c', 'prefill'];
const kinds: DropSlot[] = [
  'before',
  'before',
  'before',
  'fixed',
  'fixed',
  'input',
  'after',
  'fixed',
];
// どの行も高さ 20px、行の間 4px
const rects = ids.map((_, index) => ({
  top: index * 24,
  left: 0,
  width: 100,
  height: 20,
  bottom: index * 24 + 20,
  right: 100,
}));

/** 運ぶ行と指す行で、行ごとの見せる上端（ずらしたあと） */
function tops(active: string, over: string): number[] {
  const strategy = droppedOrderStrategy(kinds);
  return ids.map(
    (_, index) =>
      (rects[index]?.top ?? 0) +
      (strategy({
        activeIndex: ids.indexOf(active),
        overIndex: ids.indexOf(over),
        index,
        rects,
        activeNodeRect: rects[ids.indexOf(active)] ?? null,
      })?.y ?? 0),
  );
}

const order = (active: string, over: string): string[] =>
  droppedOrder(ids, kinds, ids.indexOf(active), ids.indexOf(over));

/** 見せる上端の並びが、落としたあとの並びと一致するか（重ならず、元の位置は詰まる） */
function expectLaidOut(active: string, over: string): void {
  const shown = tops(active, over);
  const byTop = [...ids].sort(
    (x, y) => (shown[ids.indexOf(x)] ?? 0) - (shown[ids.indexOf(y)] ?? 0),
  );
  expect(byTop).toEqual(order(active, over));
  expect([...shown].sort((x, y) => x - y)).toEqual(rects.map((rect) => rect.top));
}

describe('並べ替えの見せ方', () => {
  it('メッセージを指すと、そのすぐ下に入り、元の位置は詰まり、後ろの行も重ならない', () => {
    expect(order('a', 'input')).toEqual([
      'b',
      'info',
      'summary',
      'history',
      'input',
      'a',
      'c',
      'prefill',
    ]);
    expectLaidOut('a', 'input');
    // 下の段から上へ運んでメッセージを指しても、メッセージの下に入る（履歴の中へは入らない）
    expect(order('c', 'input')).toEqual(ids);
  });

  it('地をつなげた行（間 0）は、運んでいる間もつながったまま動く', () => {
    // セッション要約・会話履歴・メッセージを間 0 でつなげた並び
    const joined = new Set(['history', 'input']);
    let top = 0;
    const tight = ids.map((id, index) => {
      if (index > 0) top += joined.has(id) ? 0 : 4;
      const rect = { top, left: 0, width: 100, height: 20, bottom: top + 20, right: 100 };
      top += 20;
      return rect;
    });
    const strategy = droppedOrderStrategy(kinds);
    const shown = ids.map(
      (_, index) =>
        (tight[index]?.top ?? 0) +
        (strategy({
          activeIndex: ids.indexOf('a'),
          overIndex: ids.indexOf('input'),
          index,
          rects: tight,
          activeNodeRect: tight[0] ?? null,
        })?.y ?? 0),
    );
    const at = (id: string): number => shown[ids.indexOf(id)] ?? 0;
    expect(at('history') - at('summary')).toBe(20);
    expect(at('input') - at('history')).toBe(20);
    // 運んだ行はメッセージの下に、行の間をあけて入る
    expect(at('a') - at('input')).toBe(24);
  });

  it('段をまたいで運んでも、見せる並びは落としたあとの並びと同じ', () => {
    expect(order('a', 'c')).toEqual([
      'b',
      'info',
      'summary',
      'history',
      'input',
      'c',
      'a',
      'prefill',
    ]);
    expectLaidOut('a', 'c');
    expectLaidOut('c', 'b');
  });

  it('同じ段の中でも同じ', () => {
    expect(order('b', 'a')).toEqual([
      'b',
      'a',
      'info',
      'summary',
      'history',
      'input',
      'c',
      'prefill',
    ]);
    expectLaidOut('b', 'a');
    expectLaidOut('a', 'info');
  });
});

describe('動かせない行の地のつなぎ方', () => {
  // 上と同じ並び。動かせない行は追加辞書の印・セッション要約・会話履歴・メッセージ・プレフィル
  const locked = new Set(['info', 'summary', 'history', 'input', 'prefill']);
  const joinsOf = (order: readonly string[]): Record<string, string> => {
    const joins = bandJoins(
      order.map((id) => ({ kind: kinds[ids.indexOf(id)]!, locked: locked.has(id) })),
    );
    const result: Record<string, string> = {};
    order.forEach((id, at) => {
      const join = joins[at]!;
      result[id] = `${join.joinUp ? 'up' : ''}${join.joinDown ? 'down' : ''}`;
    });
    return result;
  };

  it('セッション要約・会話履歴・メッセージは間に入れられないのでつなげ、追加辞書の印の後はあける', () => {
    expect(joinsOf(['a', 'info', 'summary', 'history', 'input', 'prefill'])).toEqual({
      a: '',
      info: '',
      summary: 'down',
      history: 'updown',
      input: 'up',
      // メッセージの下には入れられる
      prefill: '',
    });
  });

  it('動かせない行でも、間に入れられる行どうしはつなげない', () => {
    // 会話履歴の後ろに入れられる段がある（メッセージの無い構成）
    expect(joinsOf(['history', 'c', 'prefill'])).toEqual({ history: '', c: '', prefill: '' });
    // 会話履歴の帯のすぐ後ろのプレフィル（その間には入れられない）
    expect(joinsOf(['summary', 'history', 'prefill'])).toEqual({
      summary: 'down',
      history: 'updown',
      prefill: 'up',
    });
  });
});
