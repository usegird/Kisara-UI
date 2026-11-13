import { describe, expect, it } from 'vitest';

import { workflowGroups } from '@/graph/groups';
import { DEFAULT_ORDER_LAYOUT, TITLE_HEIGHT } from '@/graph/node-box';
import { arrangeByProcessing } from '@/graph/order';
import type { Workflow } from '@/graph/types';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// 「全てのノード座標を再配置」。今の座標を捨てて、並びと所属だけから置く。
// ─────────────────────────────

/** 1→2→3 と 1→4→5 の 2 本。最後の列が 2 つ（3 と 5）あり、縦の差を今の座標から引きずりやすい */
function forked(y5: number): Workflow {
  const node = (id: number, x: number, y: number) => ({
    id,
    type: 'X',
    pos: [x, y] as [number, number],
    size: [100, 50] as [number, number],
  });
  return {
    nodes: [node(1, 0, 0), node(2, 200, 0), node(3, 400, 0), node(4, 200, 200), node(5, 400, y5)],
    links: [
      [1, 1, 0, 2, 0, 'A'],
      [2, 2, 0, 3, 0, 'A'],
      [3, 1, 0, 4, 0, 'A'],
      [4, 4, 0, 5, 0, 'A'],
    ],
    groups: [{ title: 'G', bounding: [180, -60, 140, 140] }],
  };
}

const positions = (workflow: Workflow): [number, [number, number]][] =>
  workflow.nodes.map((node) => [node.id, node.pos]);

/** 最初のグループの枠 [x, y, w, h]。無ければ NaN */
function frameOf(workflow: Workflow): number[] {
  const group: unknown = workflowGroups(workflow)[0];
  const bounding: unknown[] =
    isRecord(group) && Array.isArray(group.bounding) ? group.bounding : [];
  return bounding.map((v) => (typeof v === 'number' ? v : NaN));
}

describe('全てのノード座標を再配置', () => {
  it('今の縦の差を引きずらず、同じ並びなら同じ位置になる', () => {
    const near = arrangeByProcessing(forked(200), DEFAULT_ORDER_LAYOUT, { fromOrigin: true });
    const far = arrangeByProcessing(forked(900), DEFAULT_ORDER_LAYOUT, { fromOrigin: true });
    expect(positions(far)).toEqual(positions(near));
    // 上端（枠を含む）は原点
    const tops = [...near.nodes.map((node) => node.pos[1] - TITLE_HEIGHT), frameOf(near)[1] ?? NaN];
    expect(Math.min(...tops)).toBe(0);
  });

  it('グループの所属は今の位置から読む', () => {
    const laid = arrangeByProcessing(forked(200), DEFAULT_ORDER_LAYOUT, { fromOrigin: true });
    const [x, y, w, h] = frameOf(laid);
    const inside = (id: number): boolean => {
      const node = laid.nodes.find((n) => n.id === id);
      if (!node || x === undefined || y === undefined || w === undefined || h === undefined) {
        return false;
      }
      return node.pos[0] >= x && node.pos[0] <= x + w && node.pos[1] >= y && node.pos[1] <= y + h;
    };
    expect(inside(2)).toBe(true);
    expect(inside(4)).toBe(false);
  });
});
