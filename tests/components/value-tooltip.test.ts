import { describe, expect, it } from 'vitest';

import { valueTooltip } from '@/components/comfy/flow/value-tooltip';
import type { ValuePart } from '@/graph/widgets';

function part(text: string, label = text, bypassed = false): ValuePart {
  return { text, label, bypassed };
}

describe('値のホバー説明', () => {
  it('先頭に通し番号、値は1行ずつ', () => {
    const values = [part('model.safetensors'), part('v_prediction')];

    expect(valueTooltip('3', 'Load Checkpoint / MODEL', values)).toBe(
      '3 Load Checkpoint / MODEL\nmodel.safetensors\nv_prediction',
    );
  });

  it('数値・真偽はパラメータ名つきの行になる', () => {
    const values = [part('0.6', 'multiplier: 0.6'), part('ON', 'zsnr: ON')];

    expect(valueTooltip('1', 'RescaleCFG / MODEL', values)).toBe(
      '1 RescaleCFG / MODEL\nmultiplier: 0.6\nzsnr: ON',
    );
  });

  it('番号が無いカードは名前だけ', () => {
    expect(valueTooltip(null, 'メモ / -', [])).toBe('メモ / -');
  });

  it('ミュートは行頭に理由を付ける', () => {
    expect(valueTooltip('1', 'A / MODEL', [part('x')], true)).toBe('1 A / MODEL\n(ミュート)x');
  });

  it('バイパス中の値は行頭に (バイパス) を付ける', () => {
    expect(valueTooltip('2', 'A / MODEL', [part('x'), part('yz', 'yz', true)])).toBe(
      '2 A / MODEL\nx\n(バイパス)yz',
    );
  });
});
