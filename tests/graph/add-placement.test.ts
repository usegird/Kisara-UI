import { describe, expect, it } from 'vitest';

import { lastNodeId, placeNewNode, placeNewNodes } from '@/graph/add-placement';
import { orderedNodeIds } from '@/graph/order';
import type { Workflow } from '@/graph/types';

import { bareNode } from '../helpers/workflow';

// ─────────────────────────────
// 足して繋いだノードの置き場所（直前の決め方）
// ─────────────────────────────

const ADDED = 9;

/** 1・2・3 を横に並べ、足すノード 9 を左端に置いたもの（直前を決めるときは数えない） */
const WORKFLOW: Workflow = {
  nodes: [
    bareNode({ id: 1, pos: [0, 0] }),
    bareNode({ id: 2, pos: [400, 0] }),
    bareNode({ id: 3, pos: [800, 0] }),
    bareNode({ id: ADDED, pos: [-400, 0] }),
  ],
  links: [],
};

describe('lastNodeId', () => {
  it('横位置の順で最後のノード', () => {
    expect(lastNodeId(WORKFLOW)).toBe(3);
  });

  it('ノードが無ければ null', () => {
    expect(lastNodeId({ nodes: [], links: [] })).toBeNull();
  });
});

describe('placeNewNode', () => {
  it('基準も入力元も無ければ末尾に置く', () => {
    const placed = placeNewNode(WORKFLOW, ADDED, undefined, undefined);
    expect(orderedNodeIds(placed).at(-1)).toBe(ADDED);
  });

  it('基準が無ければ入力元の次に置く', () => {
    const placed = placeNewNode(WORKFLOW, ADDED, undefined, 1);
    const order = orderedNodeIds(placed);
    expect(order.indexOf(ADDED)).toBe(order.indexOf(1) + 1);
  });
});

describe('placeNewNodes', () => {
  it('足すものを並びの順のまま入力元の次に置く', () => {
    const second = 10;
    const workflow: Workflow = {
      ...WORKFLOW,
      nodes: [...WORKFLOW.nodes, bareNode({ id: second, pos: [-200, 0] })],
    };
    const order = orderedNodeIds(placeNewNodes(workflow, [ADDED, second], undefined, 2));
    expect(order.slice(order.indexOf(2), order.indexOf(2) + 3)).toEqual([2, ADDED, second]);
  });
});
