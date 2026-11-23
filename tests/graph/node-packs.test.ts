import { describe, expect, it } from 'vitest';

import { cnrIdOf, resolveNodePacks, type NodePackMapping } from '@/graph/node-packs';

import { bareNode } from '../helpers/workflow';

const MAPPINGS: NodePackMapping[] = [
  { key: 'comfyui-kjnodes', title: 'KJNodes', nodes: ['GetNode', 'SetNode'], pattern: null },
  { key: 'https://github.com/a/b', title: 'B', nodes: [], pattern: '^Bee' },
  { key: 'broken', title: 'X', nodes: [], pattern: '(' },
];

describe('パックの突き合わせ', () => {
  it('同じパックのノードはまとめ、Registry と git の URL を見分ける', () => {
    const result = resolveNodePacks(
      [
        { classType: 'GetNode', cnrId: null },
        { classType: 'SetNode', cnrId: null },
        { classType: 'BeeNode', cnrId: null },
      ],
      MAPPINGS,
    );
    expect(result.packs.map((pack) => [pack.key, pack.registry, pack.nodes.length])).toEqual([
      ['comfyui-kjnodes', true, 2],
      ['https://github.com/a/b', false, 1],
    ]);
  });

  it('cnr_id があれば対応表より先に採り、本体の印は採らない', () => {
    const result = resolveNodePacks(
      [
        { classType: 'GetNode', cnrId: 'other-pack' },
        { classType: 'Nope', cnrId: 'comfy-core' },
      ],
      MAPPINGS,
    );
    expect(result.packs.map((pack) => pack.key)).toEqual(['other-pack']);
    expect(result.unresolved).toEqual(['Nope']);
  });

  it('読めない決まりは無いものとして扱う', () => {
    expect(resolveNodePacks([{ classType: '(', cnrId: null }], MAPPINGS).unresolved).toEqual(['(']);
  });

  it('cnr_id は文字のときだけ読む', () => {
    expect(cnrIdOf(bareNode({ properties: { cnr_id: 'kj' } }))).toBe('kj');
    expect(cnrIdOf(bareNode({ properties: { cnr_id: 3 } }))).toBeNull();
    expect(cnrIdOf(undefined)).toBeNull();
  });
});
