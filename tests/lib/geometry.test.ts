import { describe, expect, it } from 'vitest';

import { bezierPath } from '@/lib/bezier';
import { packList } from '@/lib/stack-layout';
import { slotColor } from '@/styles/slot-color';

describe('接続線のパス', () => {
  it('左右に制御点を張り出した3次ベジェを返す', () => {
    expect(bezierPath({ x: 0, y: 0 }, { x: 100, y: 40 })).toBe('M 0 0 C 50 0, 50 40, 100 40');
  });

  it('右から左へ戻る線は制御点も逆向きに張り出す（回り込ませない）', () => {
    expect(bezierPath({ x: 300, y: 0 }, { x: 100, y: 50 })).toBe('M 300 0 C 200 0, 200 50, 100 50');
  });

  it('近すぎても遠すぎても制御点の長さを丸める', () => {
    expect(bezierPath({ x: 0, y: 0 }, { x: 10, y: 0 })).toContain('C 24 0, -14 0');
    expect(bezierPath({ x: 0, y: 0 }, { x: 1000, y: 0 })).toContain('C 120 0, 880 0');
  });
});

describe('変数ボックスの整列', () => {
  const items = (...heights: number[]) =>
    heights.map((height, index) => ({ key: String.fromCharCode(97 + index), height }));

  it('順序を保ったまま隙間なく詰める', () => {
    const positions = packList(items(67, 43, 43), { gap: 6 });

    expect(positions.get('a')).toBe(0);
    expect(positions.get('b')).toBe(73);
    expect(positions.get('c')).toBe(122);
  });

  it('空なら何も返さない', () => {
    expect(packList([], { gap: 6 }).size).toBe(0);
  });
});

describe('スロット型の配色', () => {
  it('既知の型はトークンを、未知の型は既定色を返す', () => {
    expect(slotColor('IMAGE')).toBe('var(--color-slot-image)');
    expect(slotColor('LATENT')).toBe('var(--color-slot-latent)');
    expect(slotColor('WANVIDEO_MODEL')).toBe('var(--color-slot-default)');
  });
});
