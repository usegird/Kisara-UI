import { describe, expect, it } from 'vitest';

import { linkIndex } from '@/graph/link-read';
import { removeLink } from '@/graph/links';
import { subgraphDefinitions } from '@/graph/normalize';
import { createOutputValues } from '@/graph/output-values';
import { displayGraph } from '@/graph/subgraph-display';
import { addEntrance, emptiedEntrances, removeEntrances } from '@/graph/subgraph-entrance';
import { editLevel, scopedId, setSubgraphOpen } from '@/graph/subgraph-level';
import { outerValueOf } from '@/graph/subgraph-values';
import { nodeInputs, type SubgraphDefinition, type Workflow } from '@/graph/types';

import { definition, definitionMap, widget } from '../helpers/definitions';
import { bareNode } from '../helpers/workflow';

const DEFINITIONS = definitionMap(
  definition('Gen', [widget('a', 'INT'), widget('b', 'INT')], { outputNode: true }),
);

const INNER = bareNode({
  id: 5,
  type: 'Gen',
  widgets_values: [1, 2],
  inputs: [{ name: 'a', type: 'INT', widget: { name: 'a' }, link: 1 }],
});

const SUBGRAPH: SubgraphDefinition = {
  id: 'sg',
  name: 'S',
  inputs: [{ id: 'x', name: 'a', type: 'INT', linkIds: [1] }],
  nodes: [INNER],
  links: [{ id: 1, origin_id: -10, origin_slot: 0, target_id: 5, target_slot: 0, type: 'INT' }],
};

function workflowOf(values: unknown[]): Workflow {
  return {
    nodes: [bareNode({ id: 9, type: 'sg', widgets_values: values, inputs: [] })],
    links: [],
    definitions: { subgraphs: [SUBGRAPH] },
  };
}

function definitionOf(workflow: Workflow): SubgraphDefinition {
  const found = subgraphDefinitions(workflow)[0];
  if (!found) throw new Error('定義が無い');
  return found;
}

const SOURCE = { instanceId: 9, innerId: 5, widgetName: 'b' };

describe('入口を作る', () => {
  it('定義の入口の末尾に足し、インスタンスの値の末尾に今の中の値を足す', () => {
    const next = addEntrance(workflowOf([7]), SOURCE, DEFINITIONS);
    if (!next) throw new Error('作れない');
    const added = definitionOf(next);
    const instance = next.nodes[0];

    expect(added.inputs?.map((io) => io.name)).toEqual(['a', 'b']);
    expect(instance?.widgets_values).toEqual([7, 2]);
    expect(nodeInputs(instance).map((input) => input.name)).toEqual(['b']);
    expect(instance && outerValueOf(instance, added, 1, DEFINITIONS)).toEqual({
      kind: 'value',
      value: 2,
    });
  });

  it('外側が空のインスタンスには値を足さない。線を受けている欄は入口にしない', () => {
    const next = addEntrance(workflowOf([]), SOURCE, DEFINITIONS);

    expect(next?.nodes[0]?.widgets_values).toEqual([]);
    expect(addEntrance(workflowOf([7]), { ...SOURCE, widgetName: 'a' }, DEFINITIONS)).toBeNull();
  });

  it('名前が重なれば番号を添える', () => {
    const taken = { id: 'y', name: 'b', type: 'INT', linkIds: [] };
    const base = workflowOf([7]);
    const workflow: Workflow = {
      ...base,
      definitions: { subgraphs: [{ ...SUBGRAPH, inputs: [...(SUBGRAPH.inputs ?? []), taken] }] },
    };
    const next = addEntrance(workflow, SOURCE, DEFINITIONS);

    expect(next && definitionOf(next).inputs?.map((io) => io.name)).toEqual(['a', 'b', 'b_1']);
  });
});

describe('入口を消す', () => {
  it('最後の線を外した入口を消し、後ろの入口の線を詰め、インスタンスの値も外す', () => {
    const added = addEntrance(workflowOf([7]), SOURCE, DEFINITIONS);
    if (!added) throw new Error('作れない');
    const before = definitionOf(added);
    const unlinked = editLevel(added, 9, (level) => removeLink(level, scopedId(9, 1)));
    const emptied = emptiedEntrances(before, definitionOf(unlinked));
    const next = removeEntrances(unlinked, before.id, emptied, before);
    const after = definitionOf(next);
    const entrance = [...linkIndex(after.links).values()].find((link) => link.originId === -10);

    expect([...emptied]).toEqual([0]);
    expect(after.inputs?.map((io) => io.name)).toEqual(['b']);
    expect(entrance?.originSlot).toBe(0);
    expect(next.nodes[0]?.widgets_values).toEqual([2]);
  });
});

describe('開いている間の入口の変数', () => {
  it('入口から受ける中の行は入口の変数から結び、目安は外側の欄の値', () => {
    const opened = setSubgraphOpen(workflowOf([7]), 9, true);
    const display = displayGraph(opened).workflow;
    const link = linkIndex(display.links).get(scopedId(9, 1));

    expect(link).toMatchObject({ originId: 9, originSlot: 0, targetId: scopedId(9, 5) });
    const values = createOutputValues(display, DEFINITIONS)(9, 0);
    expect(values.map((part) => part.label)).toEqual(['a: 7']);
  });
});
