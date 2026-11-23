import { describe, expect, it } from 'vitest';

import { cloneNodes } from '@/graph/clone-nodes';
import {
  groupMembership,
  groupParents,
  segmentByGroup,
  setGroupColor,
  workflowGroups,
  type Membership,
} from '@/graph/groups';
import { linkIndex } from '@/graph/link-read';
import {
  applyOrder,
  groupNodes,
  insertNodesAfter,
  orderedNodeIds,
  removeFromX,
  ungroup,
} from '@/graph/order';
import { moveTarget } from '@/graph/order-move';
import type { Workflow } from '@/graph/types';
import { isRecord } from '@/lib/guards';

import { node } from '../helpers/workflow';

function arranged(count: number): Workflow {
  const nodes = Array.from({ length: count }, (_, at) => node(at + 1, 'X', { pos: [at * 400, 0] }));
  const workflow: Workflow = { nodes, links: [] };
  return applyOrder(workflow, orderedNodeIds(workflow));
}

function members(workflow: Workflow): number[][] {
  const membership = groupMembership(workflow);
  return workflowGroups(workflow).map((_, index) =>
    orderedNodeIds(workflow).filter((id) => membership.get(id) === index),
  );
}

function boundingOf(workflow: Workflow, index: number): number[] {
  const group = workflowGroups(workflow)[index];
  return isRecord(group) && Array.isArray(group.bounding) ? (group.bounding as number[]) : [];
}

describe('所属', () => {
  it('箱の中央が枠に入るノードが属する。複数の枠に入れば内側（面積の小さい方）', () => {
    const workflow: Workflow = {
      nodes: [node(1, 'X', { pos: [0, 30] }), node(2, 'X', { pos: [1000, 30] })],
      links: [],
      groups: [
        { id: 1, title: 'outer', bounding: [-50, -50, 2000, 500] },
        { id: 2, title: 'inner', bounding: [-10, -10, 300, 300] },
        { id: 3, title: 'broken', bounding: 'x' },
      ],
    };
    const membership = groupMembership(workflow);
    expect(membership.get(1)).toBe(1);
    expect(membership.get(2)).toBe(0);
  });
});

describe('グループ化', () => {
  it('離れたノードを先頭の位置へ寄せ、枠がメンバーを囲む。所属は位置から読み戻せる', () => {
    const grouped = groupNodes(arranged(4), [2, 4]);

    expect(orderedNodeIds(grouped)).toEqual([1, 2, 4, 3]);
    expect(members(grouped)).toEqual([[2, 4]]);
    const group = workflowGroups(grouped)[0];
    expect(isRecord(group) && group.id).toBe(1);
    expect(isRecord(group) && group.title).toBe('Group');
  });

  it('番号は外と定義で共有する数えの次にし、数えを進める（消したグループの番号を使い直さない）', () => {
    const base = arranged(2);
    const workflow: Workflow = {
      ...base,
      state: { lastGroupId: 7 },
      definitions: {
        subgraphs: [
          {
            id: 'd',
            name: 'D',
            nodes: [],
            links: [],
            groups: [{ id: 9 }],
            state: { lastGroupId: 5 },
          },
        ],
      },
    };
    const grouped = groupNodes(workflow, [1]);
    const group = workflowGroups(grouped)[0];
    expect(isRecord(group) && group.id).toBe(10);
    expect(grouped.state).toEqual({ lastGroupId: 10 });
    expect(grouped.definitions?.subgraphs?.[0]?.state).toEqual({ lastGroupId: 10 });
  });

  it('中を全部選んだグループは、子のグループとして枠ごと入る', () => {
    const first = groupNodes(arranged(3), [2]);
    const second = groupNodes(first, [1, 2]);

    expect(workflowGroups(second)).toHaveLength(2);
    expect(members(second)).toEqual([[2], [1]]);
    expect(groupParents(second).get(0)).toBe(1);
  });

  it('一部だけ選んだグループからは抜ける', () => {
    const first = groupNodes(arranged(3), [2, 3]);
    const second = groupNodes(first, [1, 2]);

    expect(members(second)).toEqual([[3], [1, 2]]);
    expect(groupParents(second).size).toBe(0);
  });

  it('色を書き、既定に戻すと color のキーごと消す。ほかのキーは触らない', () => {
    const grouped = groupNodes(arranged(3), [2]);
    const painted = setGroupColor(grouped, 0, '#8A8');
    expect(workflowGroups(painted)[0]).toMatchObject({ color: '#8A8', title: 'Group' });
    expect(setGroupColor(painted, 0, '#8A8')).toBe(painted);

    const cleared = setGroupColor(painted, 0, null);
    expect(workflowGroups(cleared)[0]).not.toHaveProperty('color');
    expect(setGroupColor(cleared, 0, null)).toBe(cleared);
  });

  it('解除は枠だけを消し、並びを変えない', () => {
    const grouped = groupNodes(arranged(4), [2, 3]);
    const released = ungroup(grouped, 0);

    expect(workflowGroups(released)).toHaveLength(0);
    expect(orderedNodeIds(released)).toEqual(orderedNodeIds(grouped));
  });
});

describe('並べ替え', () => {
  const grouped = groupNodes(arranged(5), [2, 3, 4]);

  it('同じグループのメンバーどうしは、その中で並べ替える', () => {
    const inside = moveTarget(grouped, { kind: 'node', id: 4 }, { over: { kind: 'node', id: 2 } });
    expect(orderedNodeIds(inside)).toEqual([1, 4, 2, 3, 5]);
    expect(members(inside)).toEqual([[4, 2, 3]]);
  });

  it('同じグループの中でも、前後を指定すればその前後へ入る', () => {
    const before = moveTarget(
      grouped,
      { kind: 'node', id: 2 },
      { over: { kind: 'node', id: 4 }, side: 'before' },
    );
    expect(members(before)).toEqual([[3, 2, 4]]);
  });

  it('外のノードをメンバーへ落とすとグループに入る。前か後ろは落とした側', () => {
    const before = moveTarget(
      grouped,
      { kind: 'node', id: 5 },
      { over: { kind: 'node', id: 3 }, side: 'before' },
    );
    expect(orderedNodeIds(before)).toEqual([1, 2, 5, 3, 4]);
    expect(members(before)).toEqual([[2, 5, 3, 4]]);

    const after = moveTarget(
      grouped,
      { kind: 'node', id: 1 },
      { over: { kind: 'node', id: 4 }, side: 'after' },
    );
    expect(members(after)).toEqual([[2, 3, 4, 1]]);
  });

  it('メンバーを外のノードへ落とすとグループから抜ける。最後の 1 つなら枠も消える', () => {
    const out = moveTarget(
      grouped,
      { kind: 'node', id: 3 },
      { over: { kind: 'node', id: 5 }, side: 'before' },
    );
    expect(orderedNodeIds(out)).toEqual([1, 2, 4, 3, 5]);
    expect(members(out)).toEqual([[2, 4]]);

    const single = groupNodes(arranged(3), [2]);
    const emptied = moveTarget(
      single,
      { kind: 'node', id: 2 },
      { over: { kind: 'node', id: 3 }, side: 'after' },
    );
    expect(workflowGroups(emptied)).toHaveLength(0);
    expect(orderedNodeIds(emptied)).toEqual([1, 3, 2]);
  });

  it('グループそのものへ落としたノードは中に入らず、前か後ろへ入る（メンバーなら抜ける）', () => {
    const over = { kind: 'group', index: 0 } as const;
    const down = moveTarget(grouped, { kind: 'node', id: 1 }, { over });
    expect(orderedNodeIds(down)).toEqual([2, 3, 4, 1, 5]);
    expect(members(down)).toEqual([[2, 3, 4]]);

    const leave = moveTarget(grouped, { kind: 'node', id: 4 }, { over, side: 'after' });
    expect(orderedNodeIds(leave)).toEqual([1, 2, 3, 4, 5]);
    expect(members(leave)).toEqual([[2, 3]]);
  });

  it('グループはメンバーごと動く', () => {
    const moved = moveTarget(
      grouped,
      { kind: 'group', index: 0 },
      { over: { kind: 'node', id: 5 } },
    );
    expect(orderedNodeIds(moved)).toEqual([1, 5, 2, 3, 4]);
    expect(members(moved)).toEqual([[2, 3, 4]]);
  });
});

describe('足す・消す', () => {
  const grouped = groupNodes(arranged(4), [2, 3]);

  const withNew = (workflow: Workflow): Workflow => ({
    ...workflow,
    nodes: [...workflow.nodes, node(9, 'X', { pos: [0, 0] })],
  });

  it('前後が同じグループならそこに入る。基準のグループを渡せば端でも入る', () => {
    const middle = insertNodesAfter(withNew(grouped), [9], { previousId: 2 });
    expect(members(middle)).toEqual([[2, 9, 3]]);

    const edge = insertNodesAfter(withNew(grouped), [9], { previousId: 3 });
    expect(members(edge)).toEqual([[2, 3]]);

    const joined = insertNodesAfter(withNew(grouped), [9], { previousId: 3, group: 0 });
    expect(members(joined)).toEqual([[2, 3, 9]]);
  });

  it('最後のメンバーを消すとグループも消す', () => {
    const single = groupNodes(arranged(3), [2]);
    expect(workflowGroups(removeFromX(single, 2))).toHaveLength(0);
    expect(workflowGroups(removeFromX(grouped, 2))).toHaveLength(1);
  });

  it('メンバーの無い枠は右端のノードより右へ寄せる（ノードを取り込まない）', () => {
    const workflow: Workflow = {
      ...arranged(2),
      groups: [{ id: 7, title: 'empty', bounding: [5000, 5000, 100, 100] }],
    };
    const placed = applyOrder(workflow, [2, 1]);
    const right = Math.max(...placed.nodes.map((n) => n.pos[0] + (n.size?.[0] ?? 240)));

    expect(boundingOf(placed, 0)[0]).toBeGreaterThan(right);
    expect(boundingOf(placed, 0).slice(2)).toEqual([100, 100]);
    expect(groupMembership(placed).size).toBe(0);
  });
});

describe('まとめてクローン', () => {
  it('写したものどうしの線はクローンどうしで、外からの入力は元の相手から引く', () => {
    const workflow: Workflow = {
      nodes: [
        node(1, 'X'),
        node(2, 'X', { inputs: [{ name: 'in', type: 'IMAGE', link: 10 }] }),
        node(3, 'X', { inputs: [{ name: 'in', type: 'IMAGE', link: 11 }] }),
      ],
      links: [
        [10, 1, 0, 2, 0, 'IMAGE'],
        [11, 2, 0, 3, 0, 'IMAGE'],
      ],
    };
    const cloned = cloneNodes(workflow, [2, 3]);

    expect(cloned?.ids).toEqual([4, 5]);
    const pairs = [...linkIndex(cloned?.workflow.links ?? []).values()]
      .filter((link) => link.targetId >= 4)
      .map((link) => [link.originId, link.targetId]);
    expect(pairs).toEqual([
      [1, 4],
      [4, 5],
    ]);
  });
});

describe('塊に分ける', () => {
  it('続いている同じグループを 1 つにし、離れて現れた分は 1 つずつ出す', () => {
    const membership: Membership = new Map([
      [2, 0],
      [3, 0],
      [5, 0],
    ]);
    const items = [1, 2, 3, 4, 5].map((id) => ({ id }));
    const kinds = segmentByGroup(items, membership).map((segment) =>
      segment.kind === 'single' ? segment.item.id : segment.items.map((item) => item.id),
    );
    expect(kinds).toEqual([1, [2, 3], 4, 5]);
  });
});
