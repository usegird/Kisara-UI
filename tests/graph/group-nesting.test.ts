import { describe, expect, it } from 'vitest';

import { groupMembership, groupParents, segmentByGroup, workflowGroups } from '@/graph/groups';
import { DEFAULT_ORDER_LAYOUT, rectOf, type NodeRect } from '@/graph/node-box';
import {
  applyOrder,
  groupNodes,
  insertNodesAfter,
  orderedNodeIds,
  removeFromX,
  settleLayout,
  ungroup,
} from '@/graph/order';
import { moveTarget } from '@/graph/order-move';
import { groupToSubgraph, subgraphToGroup } from '@/graph/subgraph-convert';
import type { NodeId, Workflow } from '@/graph/types';
import { isRecord } from '@/lib/guards';

import { overlaps } from '../helpers/rect';
import { node } from '../helpers/workflow';

function nested(): Workflow {
  const nodes = Array.from({ length: 5 }, (_, at) => node(at + 1, 'X', { pos: [at * 400, 0] }));
  const placed = applyOrder({ nodes, links: [] }, [1, 2, 3, 4, 5]);
  return groupNodes(groupNodes(placed, [2, 3]), [2, 3, 4]);
}

function frameOf(workflow: Workflow, index: number): NodeRect {
  const group = workflowGroups(workflow)[index];
  const [x = 0, y = 0, w = 0, h = 0] =
    isRecord(group) && Array.isArray(group.bounding) ? (group.bounding as number[]) : [];
  return { left: x, top: y, right: x + w, bottom: y + h };
}

function inside(inner: NodeRect, outer: NodeRect): boolean {
  return (
    inner.left > outer.left &&
    inner.top > outer.top &&
    inner.right < outer.right &&
    inner.bottom < outer.bottom
  );
}

function boxOf(workflow: Workflow, id: NodeId): NodeRect {
  const found = workflow.nodes.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`ノード ${String(id)} が無い`);
  return rectOf(found, DEFAULT_ORDER_LAYOUT);
}

function expectShape(workflow: Workflow, membership: Record<number, number>): void {
  const read = groupMembership(workflow);
  expect(Object.fromEntries(read)).toEqual(membership);
  const parents = groupParents(workflow);
  for (const [child, parent] of parents) {
    expect(inside(frameOf(workflow, child), frameOf(workflow, parent))).toBe(true);
  }
  for (const each of workflow.nodes) {
    if (read.has(each.id)) continue;
    for (let index = 0; index < workflowGroups(workflow).length; index += 1) {
      expect(overlaps(boxOf(workflow, each.id), frameOf(workflow, index))).toBe(false);
    }
  }
}

function remove(workflow: Workflow, id: NodeId): Workflow {
  const closed = removeFromX(workflow, id);
  return { ...closed, nodes: closed.nodes.filter((each) => each.id !== id) };
}

describe('読む', () => {
  const workflow = nested();

  it('枠を丸ごと含む枠が親。ノードはいちばん内側に属する', () => {
    expect([...groupParents(workflow)]).toEqual([[0, 1]]);
    expectShape(workflow, { 2: 0, 3: 0, 4: 1 });
  });

  it('並びは箱ごとに読む', () => {
    expect(orderedNodeIds(workflow)).toEqual([1, 2, 3, 4, 5]);
  });

  it('カードの塊も入れ子になる', () => {
    const items = orderedNodeIds(workflow).map((id) => ({ id }));
    const segments = segmentByGroup(items, groupMembership(workflow), groupParents(workflow));
    const shape = segments.map((segment) =>
      segment.kind === 'single'
        ? segment.item.id
        : segment.children.map((child) =>
            child.kind === 'single' ? child.item.id : child.items.map((item) => item.id),
          ),
    );
    expect(shape).toEqual([1, [[2, 3], 4], 5]);
  });

  it('処理順に並べ直しても親子と所属は変わらない', () => {
    const again = applyOrder(workflow, [1, 2, 3, 4, 5]);
    expect([...groupParents(again)]).toEqual([[0, 1]]);
    expectShape(again, { 2: 0, 3: 0, 4: 1 });
  });
});

describe('変える', () => {
  it('内側のグループの中に足すと、外側の枠も伸びて後ろを送る', () => {
    const workflow = nested();
    const added: Workflow = { ...workflow, nodes: [...workflow.nodes, node(6, 'X')] };
    const next = insertNodesAfter(added, [6], { previousId: 2 });
    expect(orderedNodeIds(next)).toEqual([1, 2, 6, 3, 4, 5]);
    expectShape(next, { 2: 0, 3: 0, 4: 1, 6: 0 });
  });

  it('前後のノードが共に入っているいちばん内側のグループに入る', () => {
    const workflow = nested();
    const added: Workflow = { ...workflow, nodes: [...workflow.nodes, node(6, 'X')] };
    const next = insertNodesAfter(added, [6], { previousId: 3 });
    expectShape(next, { 2: 0, 3: 0, 4: 1, 6: 1 });
  });

  it('ノードを内側のグループのノードの隣へ落とすと、そのグループに入る', () => {
    const next = moveTarget(
      nested(),
      { kind: 'node', id: 5 },
      { over: { kind: 'node', id: 3 }, side: 'after' },
    );
    expect(orderedNodeIds(next)).toEqual([1, 2, 3, 5, 4]);
    expectShape(next, { 2: 0, 3: 0, 4: 1, 5: 0 });
  });

  it('グループを外のノードの隣へ落とすと、外の階層へ出る', () => {
    const next = moveTarget(
      nested(),
      { kind: 'group', index: 0 },
      { over: { kind: 'node', id: 5 }, side: 'after' },
    );
    expect(orderedNodeIds(next)).toEqual([1, 4, 5, 2, 3]);
    expect(groupParents(next).size).toBe(0);
    expectShape(next, { 2: 0, 3: 0, 4: 1 });
  });

  it('グループを外から別のグループの中へ入れる', () => {
    const out = moveTarget(
      nested(),
      { kind: 'group', index: 0 },
      { over: { kind: 'node', id: 5 }, side: 'after' },
    );
    const back = moveTarget(
      out,
      { kind: 'group', index: 0 },
      { over: { kind: 'node', id: 4 }, side: 'before' },
    );
    expect(orderedNodeIds(back)).toEqual([1, 2, 3, 4, 5]);
    expect([...groupParents(back)]).toEqual([[0, 1]]);
  });

  it('自分の中（子孫）へは入れない', () => {
    const workflow = nested();
    expect(
      moveTarget(
        workflow,
        { kind: 'group', index: 1 },
        { over: { kind: 'node', id: 2 }, side: 'after' },
      ),
    ).toBe(workflow);
  });

  it('解除すると、直下のものと子のグループは外へ移る', () => {
    const next = ungroup(nested(), 1);
    expect(workflowGroups(next)).toHaveLength(1);
    expect(groupParents(next).size).toBe(0);
    expect(Object.fromEntries(groupMembership(next))).toEqual({ 2: 0, 3: 0 });
  });

  it('中にノードが居なくなった枠は、子から順に消える', () => {
    const inner = remove(remove(nested(), 2), 3);
    expect(workflowGroups(inner)).toHaveLength(1);
    expectShape(inner, { 4: 0 });
    expect(workflowGroups(remove(inner, 4))).toHaveLength(0);
  });

  it('グループの中でグループ化すると、新しいグループはその子になる', () => {
    const next = groupNodes(nested(), [4]);
    expect(groupParents(next).get(2)).toBe(1);
    expectShape(next, { 2: 0, 3: 0, 4: 2 });
  });

  it('内側のノードが伸びると、外側の枠も伸びて後ろを送る', () => {
    const before = nested();
    const after: Workflow = {
      ...before,
      nodes: before.nodes.map((each) => (each.id === 2 ? { ...each, size: [600, 300] } : each)),
    };
    const settled = settleLayout(before, after);
    expect(orderedNodeIds(settled)).toEqual([1, 2, 3, 4, 5]);
    expectShape(settled, { 2: 0, 3: 0, 4: 1 });
  });
});

describe('subgraph との変換', () => {
  it('外側のグループを subgraph にすると、子のグループも定義に入る。戻すと親子が戻る', () => {
    const converted = groupToSubgraph(nested(), 1);
    if (!converted) throw new Error('変換できない');
    expect(workflowGroups(converted.workflow)).toHaveLength(0);
    expect(orderedNodeIds(converted.workflow)).toEqual([1, converted.instanceId, 5]);

    const back = subgraphToGroup(converted.workflow, converted.instanceId);
    if (!back) throw new Error('戻せない');
    expect(workflowGroups(back)).toHaveLength(2);
    expect(groupParents(back).size).toBe(1);
    expect(orderedNodeIds(back)).toHaveLength(5);
  });

  it('内側のグループを subgraph にすると、インスタンスは外側のグループの中に入る', () => {
    const converted = groupToSubgraph(nested(), 0);
    if (!converted) throw new Error('変換できない');
    const membership = groupMembership(converted.workflow);
    expect(membership.get(converted.instanceId)).toBe(0);
    expect(membership.get(4)).toBe(0);
    expect(orderedNodeIds(converted.workflow)).toEqual([1, converted.instanceId, 4, 5]);
  });
});
