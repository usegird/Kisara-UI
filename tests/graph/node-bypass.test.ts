import { describe, expect, it } from 'vitest';

import sdxl from '@/graph/builtin/sdxl-a1111.json';
import { bypassStateOf, disabledNodeIdsOf, setNodesBypassed } from '@/graph/node-bypass';
import { parseWorkflow } from '@/graph/normalize';
import { NODE_MODE, type Workflow } from '@/graph/types';

import { node } from '../helpers/workflow';

const HIRES = [7, 8];
const ADETAILER = [10, 11];

function builtin(): Workflow {
  return setNodesBypassed(parseWorkflow(structuredClone(sdxl)), [...HIRES, ...ADETAILER], true);
}

describe('bypassStateOf', () => {
  it('すべてバイパス・すべて通常・混ざりを見分ける', () => {
    const workflow = builtin();

    expect(bypassStateOf(workflow, HIRES)).toBe('bypassed');
    expect(bypassStateOf(workflow, [5, 6])).toBe('normal');
    expect(bypassStateOf(workflow, [6, 7])).toBe('mixed');
  });

  it('ミュートは通常にもバイパスにも数えない', () => {
    const workflow: Workflow = {
      nodes: [node(1, 'A', { mode: NODE_MODE.mute })],
      links: [],
    };

    expect(bypassStateOf(workflow, [1])).toBe('mixed');
  });

  it('見つからない・空なら null', () => {
    expect(bypassStateOf(builtin(), [999])).toBeNull();
    expect(bypassStateOf(builtin(), [])).toBeNull();
  });
});

describe('setNodesBypassed', () => {
  it('変わらなければ同じものを返す', () => {
    const workflow = builtin();

    expect(setNodesBypassed(workflow, HIRES, true)).toBe(workflow);
  });

  it('有効にするとバイパスもミュートも通常に戻す', () => {
    const workflow: Workflow = {
      nodes: [node(1, 'A', { mode: NODE_MODE.mute }), node(2, 'B', { mode: NODE_MODE.bypass })],
      links: [],
    };

    const enabled = setNodesBypassed(workflow, [1, 2], false);

    expect(enabled.nodes.map((entry) => entry.mode)).toEqual([0, 0]);
  });
});

describe('disabledNodeIdsOf', () => {
  it('並べた枠のうち無効のノードだけを、並びの順で返す', () => {
    const frames = [{ nodeId: 8 }, { nodeId: 6 }, { nodeId: 7 }];

    expect(disabledNodeIdsOf(builtin(), frames)).toEqual([8, 7]);
    expect(disabledNodeIdsOf(null, frames)).toEqual([]);
  });
});
