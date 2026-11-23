import { describe, expect, it } from 'vitest';

import {
  inputDropData,
  inputDropId,
  isOutputDrag,
  linkChipDragData,
  linkChipDragId,
  linkFromDrag,
  outputDragData,
  outputDragId,
  outputDragSource,
} from '@/components/comfy/flow/link-dnd';

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

  it('行のチップは結線の出力を落としたのと同じに繋ぎ、掴んだ行へ戻した落としは繋がない', () => {
    const chip = linkChipDragData({ nodeId: 3, slot: 1, type: 'IMAGE' }, 'a.png', {
      nodeId: 7,
      slot: 2,
      inputName: 'image',
    });

    expect(linkFromDrag(chip, inputDropData(8, 0))).toMatchObject({
      originId: 3,
      originSlot: 1,
      targetId: 8,
      targetSlot: 0,
    });
    expect(linkFromDrag(chip, inputDropData(7, 0))?.targetSlot).toBe(0);
    expect(linkFromDrag(chip, inputDropData(7, 2))).toBeNull();
    expect(isOutputDrag(chip)).toBe(true);
  });

  it('行のチップの id は結線で引き、どこから掴んだかを見分けられる', () => {
    expect(linkChipDragId(9)).toBe('link:9');
    expect(outputDragSource(linkChipDragId(9))).toBe('row');
    expect(outputDragSource(outputDragId(5, 2, 'card'))).toBe('card');
    expect(outputDragSource(outputDragId(5, 2, 'panel'))).toBe('panel');
    expect(outputDragSource(12)).toBeNull();
  });

  it('同じ出力でも、出力チップと変数ボックスで id を分ける', () => {
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
