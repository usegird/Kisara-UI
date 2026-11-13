import { describe, expect, it } from 'vitest';

import { unpinMoved, withFlag } from '@/graph/node-flags';
import type { Workflow } from '@/graph/types';

import { node } from '../helpers/workflow';

// ─────────────────────────────
// 位置を変えたノードのピン留めを外す。
// ─────────────────────────────

const pinned = { flags: { pinned: true } };

describe('位置を変えたらピン留めを外す', () => {
  const before: Workflow = {
    nodes: [node(1, 'A', { pos: [0, 0], ...pinned }), node(2, 'B', { pos: [300, 0], ...pinned })],
    links: [],
  };

  it('動いたノードだけ外し、動いていないものは残す', () => {
    const after: Workflow = {
      ...before,
      nodes: [before.nodes[0]!, { ...before.nodes[1]!, pos: [600, 0] }],
    };
    const result = unpinMoved(before, after);
    expect(result.nodes[0]?.flags).toEqual({ pinned: true });
    expect(result.nodes[1]?.flags).toEqual({});
  });

  it('動いていなければ同じものを返す（描き直さない）', () => {
    const after: Workflow = { ...before, nodes: [...before.nodes] };
    expect(unpinMoved(before, after)).toBe(after);
  });

  it('subgraph の中で動いたものも外す', () => {
    const inner = node(5, 'C', { pos: [0, 0], ...pinned });
    const sub = { id: 's', nodes: [inner], links: [] };
    const withSub = { ...before, definitions: { subgraphs: [sub] } } as unknown as Workflow;
    const moved = {
      ...withSub,
      definitions: { subgraphs: [{ ...sub, nodes: [{ ...inner, pos: [10, 0] }] }] },
    } as unknown as Workflow;
    const result = unpinMoved(withSub, moved);
    expect(result.definitions?.subgraphs?.[0]?.nodes[0]?.flags).toEqual({});
  });

  it('flags の無かったノードは、外しても flags を作らない', () => {
    const bare = node(3, 'D');
    expect(withFlag(bare, 'pinned', true).flags).toEqual({ pinned: true });
    expect('flags' in withFlag(bare, 'pinned', false)).toBe(false);
  });
});
