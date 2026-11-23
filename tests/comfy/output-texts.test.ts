import { describe, expect, it } from 'vitest';

import { parseOutputTexts } from '@/comfy/output-texts';

describe('出力の文字の読み', () => {
  it('text の文字を拾い、入れ子の並びは平らにし、文字でないものは外す', () => {
    const texts = parseOutputTexts({
      outputs: { '7': { text: ['a', ['b', 3], null] }, '8': { text: 'c' } },
    });

    expect(texts).toEqual([
      { nodeId: '7', texts: ['a', 'b'] },
      { nodeId: '8', texts: ['c'] },
    ]);
  });

  it('文字を返さないノードは外し、ノード id の数の順に並べる', () => {
    const texts = parseOutputTexts({
      outputs: {
        '10': { text: ['x'] },
        '9': { text: ['y'] },
        '3': { images: [{ filename: 'a.png' }] },
        '4': { text: [] },
      },
    });

    expect(texts.map((text) => text.nodeId)).toEqual(['9', '10']);
  });

  it('読めない形なら空', () => {
    expect(parseOutputTexts(null)).toEqual([]);
    expect(parseOutputTexts({ outputs: [] })).toEqual([]);
  });
});
