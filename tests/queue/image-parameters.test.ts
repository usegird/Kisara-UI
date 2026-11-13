import { describe, expect, it } from 'vitest';

import { parseImageParameters } from '@/queue/image-parameters';

// ─────────────────────────────
// 他のツール（A1111 / Forge）の `parameters` の読み分け。
// ─────────────────────────────

describe('parameters の読み分け', () => {
  it('プロンプト・ネガティブ・設定に分け、モデルと LoRA を拾う', () => {
    const parsed = parseImageParameters(
      [
        '1girl, solo,',
        '<lora:anima-turbo:0.9> smile',
        'Negative prompt: lowres, bad hands',
        'Steps: 8, Sampler: Euler a, Model: waiANIMA, Lora hashes: "a: 1b55, b: 6d5e"',
      ].join('\n'),
    );

    expect(parsed.positive).toBe('1girl, solo,\n<lora:anima-turbo:0.9> smile');
    expect(parsed.negative).toBe('lowres, bad hands');
    // 引用符の中のカンマでは分けない
    expect(parsed.settings.map((item) => item.name)).toEqual([
      'Steps',
      'Sampler',
      'Model',
      'Lora hashes',
    ]);
    expect(parsed.settings.at(-1)?.text).toBe('a: 1b55, b: 6d5e');
    expect(parsed.models).toEqual(['waiANIMA', 'anima-turbo']);
  });

  it('ネガティブも設定も無ければ、全体をプロンプトとする', () => {
    const parsed = parseImageParameters('a cat');
    expect(parsed).toMatchObject({ positive: 'a cat', negative: null, settings: [] });
  });
});
