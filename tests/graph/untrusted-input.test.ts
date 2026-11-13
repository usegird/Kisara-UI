import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildNodeDefinitions } from '@/graph/node-definition';
import { parseWorkflow, removeDanglingLinks } from '@/graph/normalize';
import { arrangeByProcessing, orderedNodeIds } from '@/graph/order';
import { buildNodeViews } from '@/graph/rows';
import { toApiPrompt } from '@/graph/to-api-prompt';
import { nodeInputs, nodeOutputs, type Workflow } from '@/graph/types';
import { buildVariableBoxes } from '@/graph/variables';

import { loadDefinitions } from '../helpers/fixtures';

// ─────────────────────────────
// 信頼できない入力。**1 つの壊れた入力で全体を止めない**。
// ComfyUI やカスタムノードが思いがけない形で持つ値を、どの経路でも受け流せること。
// ─────────────────────────────

const definitions = loadDefinitions();
const SHOW_ALL = { showControlNodes: true, showUnlinkedNodes: true };

afterEach(() => {
  vi.restoreAllMocks();
});

/** 口や値の形が崩れたノードと、まともなノードを混ぜたもの */
function malformed(): Workflow {
  return parseWorkflow({
    nodes: [
      {
        id: 1,
        type: 'LoadImage',
        pos: [0, 0],
        outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [7] }],
      },
      // 口が配列でない・項目が崩れている・値の並びが数値・位置が無い
      {
        id: 2,
        type: 'Broken',
        inputs: 'x',
        outputs: [null, 5, { name: 3, links: 'y' }],
        widgets_values: 3,
      },
      {
        id: 3,
        type: 'PreviewImage',
        pos: 'here',
        inputs: [{ name: 'images', type: 'IMAGE', link: 7 }, 42],
      },
    ],
    links: [[7, 1, 0, 3, 0, 'IMAGE'], 'junk', [8, 'a', 0, 3, 1]],
  });
}

describe('崩れた Workflow JSON', () => {
  it('同じ id のノードが 2 つあれば、どれかを理由に挙げて読み込まずに断る', () => {
    const nodes = [
      { id: 1, type: 'A' },
      { id: 2, type: 'B' },
      { id: 1, type: 'C' },
    ];
    expect(() => parseWorkflow({ nodes, links: [] })).toThrow(/1.*nodes\[2\]/);
  });

  it('口の読み出しは位置を保ったまま、読めない項目を空の口にする', () => {
    const [, two, three] = malformed().nodes;
    expect(nodeInputs(two)).toEqual([]);
    expect(nodeOutputs(two).map((output) => output.name)).toEqual(['', '', '']);
    expect(nodeOutputs(two)[2]?.links).toBeNull();
    expect(nodeInputs(three).map((input) => input.name)).toEqual(['images', '']);
  });

  it('並べる・整える・カードと変数を組み立てる・実行の形に変える、のどれも止まらない', () => {
    const workflow = removeDanglingLinks(malformed());

    expect(orderedNodeIds(workflow)).toHaveLength(3);
    expect(orderedNodeIds(arrangeByProcessing(workflow))).toHaveLength(3);
    expect(buildNodeViews(workflow, definitions, SHOW_ALL)).toHaveLength(3);
    expect(buildVariableBoxes(workflow, definitions).length).toBeGreaterThan(0);
    expect(() => toApiPrompt(workflow, definitions)).not.toThrow();
  });

  it('組み立ての途中で投げるノードは「壊れた」印を付けて残し、ほかは組み立てる', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const workflow = malformed();
    // 読むだけで投げる値（想定外の形の代わり）
    const trap = { ...workflow.nodes[2] } as Record<string, unknown>;
    Object.defineProperty(trap, 'inputs', {
      get: () => {
        throw new Error('読めない');
      },
    });
    const views = buildNodeViews(
      { ...workflow, nodes: [workflow.nodes[0]!, trap as never] },
      definitions,
      SHOW_ALL,
    );

    expect(views).toHaveLength(2);
    expect(views[0]?.broken).toBeUndefined();
    expect(views.find((view) => view.id === 3)?.broken).toContain('読めない');
  });
});

describe('壊れたノードは隣を巻き込まない', () => {
  it('上流の値が読めなくても、下流のカードは組み立てる（流れ込む値は「分からない」）', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const workflow = malformed();
    const upstream = { ...workflow.nodes[0] } as Record<string, unknown>;
    Object.defineProperty(upstream, 'widgets_values', {
      get: () => {
        throw new Error('読めない');
      },
    });
    const views = buildNodeViews(
      { ...workflow, nodes: [upstream as never, workflow.nodes[2]!] },
      definitions,
      SHOW_ALL,
    );

    expect(views.find((view) => view.id === 1)?.broken).toContain('読めない');
    const downstream = views.find((view) => view.id === 3);
    expect(downstream?.broken).toBeUndefined();
    expect(downstream?.rows.find((row) => row.name === 'images')?.source?.values).toEqual([]);
  });
});

describe('崩れたノード定義', () => {
  it('読めない定義だけを外し、ほかは使う', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const trap: Record<string, unknown> = {};
    Object.defineProperty(trap, 'input', {
      enumerable: true,
      get: () => {
        throw new Error('読めない');
      },
    });

    const map = buildNodeDefinitions({
      Good: { input: { required: { a: ['INT', {}] } }, output: ['INT'] },
      Bad: trap,
      Odd: { input: 'x', output: 'y', output_name: 5 },
    });

    expect(map.has('Good')).toBe(true);
    expect(map.has('Bad')).toBe(false);
    expect(map.get('Odd')?.inputs).toEqual([]);
  });
});
