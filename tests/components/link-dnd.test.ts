import { describe, expect, it } from 'vitest';

import {
  inputDropData,
  inputDropId,
  isOutputDrag,
  linkFromDrag,
  outputDragData,
  outputDragId,
} from '@/components/comfy/flow/link-dnd';

// ─────────────────────────────
// ドラッグ&ドロップ接続の判定。dnd-kit の data は any 相当で降ってくるので、
// **形を検証してから**リンクにする（外から来た値は unknown で受ける）。
// ─────────────────────────────

describe('ドラッグ&ドロップでの接続', () => {
  it('出力をパラメータへ落とすとリンクになる', () => {
    expect(linkFromDrag(outputDragData(3, 1, 'IMAGE', 'a.png'), inputDropData(7, 2))).toEqual({
      originId: 3,
      originSlot: 1,
      targetId: 7,
      targetSlot: 2,
      widget: null,
    });
  });

  it('パラメータ行へ落とすと、入力に変える名前を添える', () => {
    const widget = { name: 'text', type: 'STRING' };
    const request = linkFromDrag(outputDragData(3, 0, 'STRING', 'a'), inputDropData(7, -1, widget));

    expect(request?.widget).toEqual(widget);
    expect(inputDropId(7, -1, 'text')).toBe('in:7:w:text');
  });

  it('自分自身へは接続しない', () => {
    expect(linkFromDrag(outputDragData(3, 0, 'IMAGE', 'a.png'), inputDropData(3, 0))).toBeNull();
  });

  it('出力どうし・パラメータどうしは接続しない', () => {
    expect(
      linkFromDrag(outputDragData(1, 0, 'IMAGE', 'a.png'), outputDragData(2, 0, 'IMAGE', 'b.png')),
    ).toBeNull();
    expect(linkFromDrag(inputDropData(1, 0), inputDropData(2, 0))).toBeNull();
  });

  it('形が違う data は無視する', () => {
    expect(linkFromDrag(undefined, inputDropData(1, 0))).toBeNull();
    expect(linkFromDrag(outputDragData(1, 0, 'IMAGE', 'a.png'), undefined)).toBeNull();
    expect(linkFromDrag({ kind: 'output' }, inputDropData(1, 0))).toBeNull();
    expect(linkFromDrag('output', 'input')).toBeNull();
  });

  it('同じ出力でも、出力チップと変数ボックスで id を分ける', () => {
    // dnd-kit は id で登録を引くので、重複すると別の要素を掴んだことになる
    expect(outputDragId(5, 2, 'card')).toBe('chip:5:2');
    expect(outputDragId(5, 2, 'panel')).toBe('var:5:2');
    expect(outputDragId(5, 2, 'card')).not.toBe(outputDragId(5, 2, 'panel'));
    expect(inputDropId(5, 2)).toBe('in:5:2');
  });
});

describe('ドラッグ中の表示', () => {
  it('型と値を分けて data に載せる（表示側で型だけ太字にする）', () => {
    const data = outputDragData(4, 1, 'MASK', 'a.png');

    expect(isOutputDrag(data)).toBe(true);
    expect(data.type).toBe('MASK');
    expect(data.value).toBe('a.png');
  });

  it('型・値が無い形は出力とみなさない', () => {
    expect(isOutputDrag({ kind: 'output', nodeId: 1, slot: 0 })).toBe(false);
    expect(isOutputDrag({ kind: 'output', nodeId: 1, slot: 0, type: 'IMAGE' })).toBe(false);
  });
});
