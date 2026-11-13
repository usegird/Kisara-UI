import { describe, expect, it } from 'vitest';

import a1111 from '@/graph/builtin/a1111-txt2img.json';
import {
  clearGroupSwitches,
  disabledNodeIdsOf,
  groupSwitchesOf,
  groupSwitchIds,
  groupSwitchShownOf,
  setNodesBypassed,
  toggleGroupSwitch,
} from '@/graph/group-switch';
import { workflowGroups } from '@/graph/groups';
import { parseWorkflow } from '@/graph/normalize';
import { ownData } from '@/graph/own-data';
import { NODE_MODE, type Workflow } from '@/graph/types';

import { node } from '../helpers/workflow';

// ─────────────────────────────
// グループの切り替え。並びは `extra.kisara.switches`、状態はメンバーの `mode` から読む。
// 組み立ては標準のワークフロー（Hires. fix と ADetailer を切り替えに出してある）を使う。
// ─────────────────────────────

const HIRES = 4;
const ADETAILER = 5;
const CHECKPOINT = 1;

function builtin(): Workflow {
  return parseWorkflow(structuredClone(a1111));
}

describe('groupSwitchesOf', () => {
  it('出している切り替えを、カードの列のグループの順にメンバーと状態つきで返す', () => {
    const switches = groupSwitchesOf(builtin());

    expect(switches.map((entry) => entry.title)).toEqual(['Hires. fix', 'ADetailer']);
    expect(switches.map((entry) => entry.nodeIds)).toEqual([
      [7, 8],
      [10, 11],
    ]);
    expect(switches.map((entry) => entry.state)).toEqual(['off', 'off']);
  });

  it('入れたら on、1 つだけ切れば mixed', () => {
    const on = setNodesBypassed(builtin(), [7, 8], false);
    expect(groupSwitchesOf(on)[0]?.state).toBe('on');

    const mixed = setNodesBypassed(on, [8], true);
    expect(groupSwitchesOf(mixed)[0]?.state).toBe('mixed');
  });

  it('指すグループが無い・メンバーが居ない切り替えは出さない', () => {
    const workflow = { ...builtin(), groups: [] };

    expect(groupSwitchesOf(workflow)).toEqual([]);
    expect(groupSwitchIds(workflow)).toEqual([HIRES, ADETAILER]);
  });
});

describe('toggleGroupSwitch', () => {
  it('出す・外す。最後の 1 つを外したらキーごと消す', () => {
    const added = toggleGroupSwitch(builtin(), CHECKPOINT);
    expect(groupSwitchIds(added)).toEqual([HIRES, ADETAILER, CHECKPOINT]);

    const removed = toggleGroupSwitch(toggleGroupSwitch(builtin(), HIRES), ADETAILER);
    expect(ownData(removed)).not.toHaveProperty('switches');
  });

  it('まとめて外してもノードの mode は変えない', () => {
    const cleared = clearGroupSwitches(builtin());

    expect(groupSwitchIds(cleared)).toEqual([]);
    expect(cleared.nodes.find((entry) => entry.id === 7)?.mode).toBe(NODE_MODE.bypass);
  });
});

describe('groupSwitchShownOf', () => {
  it('出しているか。id を持たないグループは null', () => {
    const workflow = builtin();
    const groups = [...workflowGroups(workflow), { title: 'No id', bounding: [0, 0, 1, 1] }];

    expect(groupSwitchShownOf(workflow, String(HIRES))).toBe(true);
    expect(groupSwitchShownOf(workflow, String(CHECKPOINT))).toBe(false);
    expect(groupSwitchShownOf({ ...workflow, groups }, 'i5')).toBeNull();
  });
});

describe('setNodesBypassed', () => {
  it('変わらなければ同じものを返す', () => {
    const workflow = builtin();

    expect(setNodesBypassed(workflow, [7, 8], true)).toBe(workflow);
  });

  it('ミュートのノードを入れると通常に戻す', () => {
    const workflow: Workflow = {
      nodes: [node(1, 'A', { mode: NODE_MODE.mute })],
      links: [],
    };

    expect(setNodesBypassed(workflow, [1], false).nodes[0]?.mode).toBe(NODE_MODE.normal);
  });
});

describe('disabledNodeIdsOf', () => {
  it('並べた枠のうち無効のノードだけを、並びの順で返す', () => {
    const frames = [{ nodeId: 8 }, { nodeId: 6 }, { nodeId: 7 }];

    expect(disabledNodeIdsOf(builtin(), frames)).toEqual([8, 7]);
    expect(disabledNodeIdsOf(null, frames)).toEqual([]);
  });
});
