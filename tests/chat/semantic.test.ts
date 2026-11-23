import { describe, expect, it } from 'vitest';

import {
  baselineOf,
  pickSemanticHits,
  SEMANTIC_LIMIT,
  semanticQuery,
  semanticTargets,
  similarity,
} from '@/chat/semantic';

import { chatMessage, loreEntry as entry } from '../helpers/llm';

const vector = (...values: number[]) => Float32Array.from(values);

describe('対象と比べる発言', () => {
  it('RAG で、有効・本文があり・常時でない項目だけ。同じ id の出どころは最初だけ', () => {
    const entries = [
      entry({ logic: 'rag', content: 'A.' }),
      entry({ content: 'Keys only.' }),
      entry({ logic: 'rag', enabled: false, content: 'Off.' }),
      entry({ logic: 'rag', constant: true, content: 'Always.' }),
      entry({ logic: 'rag', content: '  ' }),
    ];
    const targets = semanticTargets([
      { id: 'book', entries },
      { id: 'book', entries },
    ]);
    expect(targets).toEqual([{ sourceId: 'book', index: 0, text: 'A.', kind: 'passage' }]);
  });

  it('追加条件の文があれば、追加内容の代わりに問いとして比べる', () => {
    const entries = [entry({ logic: 'rag', secondaryKeys: ['宝の話のとき'], content: 'A.' })];
    expect(semanticTargets([{ id: 'b', entries }])[0]).toMatchObject({
      text: '宝の話のとき',
      kind: 'query',
    });
  });

  it('今の発言と、末尾 2 件をつないだ文（空の発言は数えない。打ちかけは最後の発言）', () => {
    const messages = [
      chatMessage('a', 'user', ['first']),
      chatMessage('b', 'assistant', ['second']),
      chatMessage('c', 'assistant', ['']),
      chatMessage('d', 'user', ['third']),
    ];
    expect(semanticQuery(messages)).toEqual({ latest: 'third', context: 'second\nthird' });
    expect(semanticQuery(messages, 'draft')).toEqual({ latest: 'draft', context: 'third\ndraft' });
    expect(semanticQuery([chatMessage('a', 'user', ['only'])])).toEqual({
      latest: 'only',
      context: '',
    });
  });
});

describe('点と当たり', () => {
  it('近さはベクトルの内積。ふだんの近さはありふれた発言との近さの平均', () => {
    expect(similarity(vector(0.6, 0.8), vector(1, 0))).toBeCloseTo(0.6);
    expect(baselineOf(vector(1, 0), [vector(0.5, 0), vector(0.1, 0)])).toBeCloseTo(0.3);
    expect(baselineOf(vector(1, 0), [])).toBe(0);
  });

  it('下限以上で、最高点から幅の中だけを当てる', () => {
    const hits = pickSemanticHits(
      [
        { sourceId: 'a', index: 0, score: 0.1 },
        { sourceId: 'a', index: 1, score: 0.085 },
        { sourceId: 'b', index: 0, score: 0.07 },
      ],
      0.04,
    );
    expect([...(hits.get('a') ?? [])]).toEqual([0, 1]);
    expect(hits.has('b')).toBe(false);
  });

  it('最高点が下限に届かなければ何も当てない', () => {
    expect(pickSemanticHits([{ sourceId: 'a', index: 0, score: 0.03 }], 0.04).size).toBe(0);
    expect(pickSemanticHits([], 0.04).size).toBe(0);
  });

  it('当てる数は出どころをまたいで上限まで', () => {
    const scores = Array.from({ length: 5 }, (_, index) => ({
      sourceId: `s${index}`,
      index: 0,
      score: 0.1 - index * 0.001,
    }));
    const hits = pickSemanticHits(scores, 0.04);
    expect(hits.size).toBe(SEMANTIC_LIMIT);
    expect(hits.has('s4')).toBe(false);
  });
});
