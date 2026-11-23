import { describe, expect, it } from 'vitest';

import { groupKeyIn, inLevel, levelOfTargets, sortKeyIn, sortTarget } from '@/graph/level-edit';
import { scopedId } from '@/graph/subgraph-level';
import type { Workflow } from '@/graph/types';

import { bareNode } from '../helpers/workflow';

const INSTANCE = 5;
const INNER_ID = 3;

const WORKFLOW: Workflow = {
  nodes: [bareNode({ id: 1 }), bareNode({ id: 2, pos: [300, 0] })],
  links: [],
  groups: [{ id: 7, title: 'G', bounding: [0, 0, 100, 100] }, { title: 'H' }],
};

describe('inLevel', () => {
  it('階層が決まらない（undefined）なら編集せずに元を返す', () => {
    const edit = (): Workflow => ({ ...WORKFLOW, nodes: [] });
    expect(inLevel(WORKFLOW, undefined, edit)).toBe(WORKFLOW);
  });

  it('外（null）ならそのまま編集する', () => {
    const next = inLevel(WORKFLOW, null, (workflow) => ({ ...workflow, nodes: [] }));
    expect(next.nodes).toEqual([]);
  });
});

describe('sortKeyIn', () => {
  it('外のノードは外の階層で、鍵はそのまま', () => {
    expect(sortKeyIn(2)).toEqual({ level: null, key: 2 });
  });

  it('中のノードは開いたインスタンスの階層', () => {
    const id = scopedId(INSTANCE, INNER_ID);
    expect(sortKeyIn(id)).toEqual({ level: INSTANCE, key: id });
  });

  it('中のグループの鍵はインスタンスと中の鍵に分ける', () => {
    expect(sortKeyIn({ group: `${String(INSTANCE)}/7` })).toEqual({
      level: INSTANCE,
      key: { group: '7' },
    });
  });

  it('外のグループの鍵は外の階層', () => {
    expect(sortKeyIn({ group: '7' })).toEqual({ level: null, key: { group: '7' } });
  });
});

describe('groupKeyIn', () => {
  it('外の鍵は外、中の鍵はインスタンスの階層', () => {
    expect(groupKeyIn('i1')).toEqual({ level: null, key: 'i1' });
    expect(groupKeyIn(`${String(INSTANCE)}/i0`)).toEqual({ level: INSTANCE, key: 'i0' });
  });
});

describe('levelOfTargets', () => {
  it('指定がどれも無ければ外', () => {
    expect(levelOfTargets([undefined, undefined])).toBeNull();
  });

  it('同じ階層のものだけならその階層', () => {
    const inner = scopedId(INSTANCE, INNER_ID);
    expect(levelOfTargets([inner, undefined])).toBe(INSTANCE);
  });

  it('階層をまたぐと決まらない', () => {
    expect(levelOfTargets([1, scopedId(INSTANCE, INNER_ID)])).toBeUndefined();
  });
});

describe('sortTarget', () => {
  it('ノードの鍵はノードを指す', () => {
    expect(sortTarget(WORKFLOW, 2)).toEqual({ kind: 'node', id: 2 });
  });

  it('グループの鍵は添字を指す（id が無ければ添字の鍵）', () => {
    expect(sortTarget(WORKFLOW, { group: '7' })).toEqual({ kind: 'group', index: 0 });
    expect(sortTarget(WORKFLOW, { group: 'i1' })).toEqual({ kind: 'group', index: 1 });
  });

  it('見つからないグループは null', () => {
    expect(sortTarget(WORKFLOW, { group: '99' })).toBeNull();
  });
});
