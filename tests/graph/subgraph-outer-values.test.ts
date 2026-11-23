import { describe, expect, it } from 'vitest';

import { buildNodeViews } from '@/graph/rows';
import { outerFieldOf, writeOuterValue } from '@/graph/subgraph-values';
import { toApiPrompt } from '@/graph/to-api-prompt';
import type { SubgraphDefinition, Workflow, WorkflowNode } from '@/graph/types';

import { definition, definitionMap, widget } from '../helpers/definitions';
import { bareNode } from '../helpers/workflow';

const DEFINITIONS = definitionMap(
  definition('Gen', [widget('flag', 'BOOLEAN'), widget('size', 'INT')], { outputNode: true }),
);

const INNER = bareNode({
  id: 5,
  type: 'Gen',
  widgets_values: [true, 3],
  inputs: [
    { name: 'flag', type: 'BOOLEAN', widget: { name: 'flag' }, link: 1 },
    { name: 'size', type: 'INT', widget: { name: 'size' }, link: 2 },
  ],
});

const SUBGRAPH: SubgraphDefinition = {
  id: 'sg',
  name: 'S',
  inputs: [
    { id: 'a', name: 'flag', type: 'BOOLEAN', linkIds: [1] },
    { id: 'b', name: 'size', type: 'INT', linkIds: [2] },
  ],
  nodes: [INNER],
  links: [
    { id: 1, origin_id: -10, origin_slot: 0, target_id: 5, target_slot: 0, type: 'BOOLEAN' },
    { id: 2, origin_id: -10, origin_slot: 1, target_id: 5, target_slot: 1, type: 'INT' },
  ],
};

function promptOf(instance: Partial<WorkflowNode>) {
  return toApiPrompt(workflowOf(instance), DEFINITIONS);
}

function workflowOf(instance: Partial<WorkflowNode>): Workflow {
  return {
    nodes: [bareNode({ id: 9, type: 'sg', ...instance })],
    links: [],
    definitions: { subgraphs: [SUBGRAPH] },
  };
}

function rowsOf(instance: Partial<WorkflowNode>) {
  const views = buildNodeViews(workflowOf(instance), DEFINITIONS, { showUnlinkedNodes: true });
  return views.find((view) => view.id === 9)?.rows ?? [];
}

describe('入口の欄の行', () => {
  it('インスタンスの inputs に無い入口も、定義の入口の順に外側の値で出す', () => {
    const rows = rowsOf({
      widgets_values: [false, 7],
      inputs: [{ name: 'size', label: 'Size', type: 'INT', widget: { name: 'size' }, link: null }],
    });

    expect(rows.map((row) => [row.label, row.value, row.linkable])).toEqual([
      ['flag', false, false],
      ['Size', 7, true],
    ]);
    expect(rows[1]?.target).toMatchObject({ kind: 'instance', nodeId: 9, slot: 1 });
  });

  it('外側が空なら中の値を出し、中のノードへ書く', () => {
    const rows = rowsOf({ widgets_values: [] });

    expect(rows.map((row) => row.value)).toEqual([true, 3]);
    expect(rows[0]?.target).toMatchObject({ kind: 'subgraph', innerNodeId: 5 });
  });

  it('値の位置が決まらなければ読み取り専用', () => {
    const rows = rowsOf({ widgets_values: [false] });

    expect(rows.map((row) => [row.kind, row.target])).toEqual([
      ['unresolved', null],
      ['unresolved', null],
    ]);
  });

  it('直すと外側の値の並びのその入口の位置に書き、位置が決まらなければ書かない', () => {
    const instance = bareNode({ id: 9, type: 'sg', widgets_values: [false, 7] });

    expect(writeOuterValue(instance, SUBGRAPH, 1, 12)?.widgets_values).toEqual([false, 12]);
    expect(writeOuterValue({ ...instance, widgets_values: [false] }, SUBGRAPH, 1, 12)).toBeNull();
  });
});

describe('断られた入力の外側の欄', () => {
  it('外側の値を送った入力なら、外側のカードと欄の名前を返す', () => {
    const workflow = workflowOf({ widgets_values: [false, 7] });

    expect(outerFieldOf(workflow, '9:5', 'size', DEFINITIONS)).toEqual({
      promptNodeId: '9',
      label: 'size',
    });
  });

  it('中の値を送った入力・外のノードは null', () => {
    const workflow = workflowOf({ widgets_values: [] });

    expect(outerFieldOf(workflow, '9:5', 'size', DEFINITIONS)).toBeNull();
    expect(outerFieldOf(workflow, '9', 'size', DEFINITIONS)).toBeNull();
  });
});

describe('入口の欄の値', () => {
  it('外側に値があれば、中の値ではなく外側の値を送る', () => {
    const { prompt } = promptOf({ widgets_values: [false, 7] });

    expect(prompt['9:5']?.inputs).toEqual({ flag: false, size: 7 });
  });

  it('外側が空なら値は中のノードにあるので、中の値を送る', () => {
    expect(promptOf({ widgets_values: [] }).prompt['9:5']?.inputs).toEqual({ flag: true, size: 3 });
  });

  it('昇格の写しを持つ形は、値が中のノードにあるので中の値を送る', () => {
    const { prompt } = promptOf({
      widgets_values: [false, 7],
      properties: { proxyWidgets: [['5', 'flag']] },
    });

    expect(prompt['9:5']?.inputs).toEqual({ flag: true, size: 3 });
  });

  it('数か型が合わなければ、中の値で代えずにノードを出さない', () => {
    for (const values of [[false], ['x', 7]]) {
      const { prompt, diagnostics } = promptOf({ widgets_values: values });

      expect(prompt['9:5']).toBeUndefined();
      expect(diagnostics.map((entry) => entry.code)).toContain('misaligned-widgets');
    }
  });
});
