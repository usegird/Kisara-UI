import { describe, expect, it } from 'vitest';

import { createNode } from '@/graph/create-node';
import { addLink, removeLink } from '@/graph/links';
import { commonType, withMatchedTypes } from '@/graph/match-types';
import { buildNodeDefinition, buildNodeDefinitions } from '@/graph/node-definition';
import {
  nodeInputs,
  nodeOutputs,
  slotTypeName,
  type NodeId,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';

import { switchNodeRaw } from '../helpers/definitions';
import { node } from '../helpers/workflow';

const definitions = buildNodeDefinitions({ ComfySwitchNode: switchNodeRaw() });
const switchDefinition = definitions.get('ComfySwitchNode');

function latentSource(id: NodeId): WorkflowNode {
  return node(id, 'Src', { inputs: [], outputs: [{ name: 'LATENT', type: 'LATENT', links: [] }] });
}

function workflowWith(...extra: WorkflowNode[]): Workflow {
  if (!switchDefinition) throw new Error('定義が読めない');
  return { nodes: [latentSource(1), createNode(switchDefinition, 2), ...extra], links: [] };
}

function typesOf(workflow: Workflow, id: NodeId): { inputs: string[]; outputs: string[] } {
  const found = workflow.nodes.find((entry) => entry.id === id);
  return {
    inputs: nodeInputs(found).map((input) => slotTypeName(input.type)),
    outputs: nodeOutputs(found).map((output) => slotTypeName(output.type)),
  };
}

function connect(workflow: Workflow, from: NodeId, to: NodeId, slot: number): Workflow {
  const linked = addLink(workflow, {
    originId: from,
    originSlot: 0,
    targetId: to,
    targetSlot: slot,
  });
  return withMatchedTypes(linked, definitions);
}

describe('定義の読み取り', () => {
  it('口は allowed_types を型にして組の名前を持ち、組に結んだ出力は * にする', () => {
    expect(
      switchDefinition?.inputs.map((input) => [input.name, input.type, input.matchType]),
    ).toEqual([
      ['switch', 'BOOLEAN', undefined],
      ['on_false', '*', 'switch'],
      ['on_true', '*', 'switch'],
    ]);
    expect(switchDefinition?.outputs).toEqual([{ name: 'output', type: '*', matchType: 'switch' }]);
  });

  it('template が読めない口は組に入れず * の口にする', () => {
    const read = buildNodeDefinition('X', {
      input: { required: { value: ['COMFY_MATCHTYPE_V3', {}] } },
      output: [],
    });
    expect(read?.inputs[0]).toMatchObject({ type: '*', isWidget: false });
    expect(read?.inputs[0]?.matchType).toBeUndefined();
  });
});

describe('線を繋ぐ・外す', () => {
  it('LATENT を繋ぐと、反対側の口と出力が LATENT に揃い、外すと * に戻る', () => {
    const linked = connect(workflowWith(), 1, 2, 0);
    expect(typesOf(linked, 2)).toEqual({ inputs: ['*', 'LATENT'], outputs: ['LATENT'] });
    const linkId = nodeInputs(linked.nodes[1])[0]?.link ?? -1;
    const both = connect(linked, 1, 2, 1);
    expect(typesOf(both, 2)).toEqual({ inputs: ['LATENT', 'LATENT'], outputs: ['LATENT'] });

    const removed = withMatchedTypes(removeLink(both, linkId), definitions);
    expect(typesOf(removed, 2)).toEqual({ inputs: ['LATENT', '*'], outputs: ['LATENT'] });
const other = nodeInputs(removed.nodes[1])[1]?.link ?? -1;    const empty = withMatchedTypes(removeLink(removed, other), definitions);    expect(typesOf(empty, 2)).toEqual({ inputs: ['*', '*'], outputs: ['*'] });
  });

  it('出力の型が変わると、その先の型が揃う口も揃え直す', () => {
    if (!switchDefinition) throw new Error('定義が読めない');
    const chained = connect(
      connect(workflowWith(createNode(switchDefinition, 3)), 2, 3, 0),
      1,
      2,
      0,
    );
    expect(typesOf(chained, 3).outputs).toEqual(['LATENT']);
  });

  it('輪になっていても止まる', () => {
    if (!switchDefinition) throw new Error('定義が読めない');
    const loop = connect(connect(workflowWith(createNode(switchDefinition, 3)), 2, 3, 0), 3, 2, 1);
    expect(typesOf(loop, 2).outputs).toEqual(['*']);
  });

  it('何も変わらなければ同じ物を返す', () => {
    const linked = connect(workflowWith(), 1, 2, 0);
    expect(withMatchedTypes(linked, definitions)).toBe(linked);
  });
});

describe('型の共通部分', () => {
  it('* は何とでも合い、カンマ区切りは積を取り、合わなければ null', () => {
    expect(commonType(['*', '*'])).toBe('*');
    expect(commonType(['IMAGE,MASK', '*', 'MASK'])).toBe('MASK');
    expect(commonType(['IMAGE', 'LATENT'])).toBeNull();
  });
});
