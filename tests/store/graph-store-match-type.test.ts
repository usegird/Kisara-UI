import { afterEach, describe, expect, it } from 'vitest';

import { createNode } from '@/graph/create-node';
import { buildNodeDefinitions } from '@/graph/node-definition';
import { nodeInputs, nodeOutputs, slotTypeName } from '@/graph/types';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useGraphStore } from '@/store/use-graph-store';

import { switchNodeRaw } from '../helpers/definitions';
import { node } from '../helpers/workflow';

const definitions = buildNodeDefinitions({ ComfySwitchNode: switchNodeRaw() });

afterEach(() => {
  useGraphStore.getState().clear();
  useDefinitionsStore.setState({ definitions: new Map() });
});

function load(): void {
  const switchDefinition = definitions.get('ComfySwitchNode');
  if (!switchDefinition) throw new Error('定義が読めない');
  const source = node(1, 'Src', {
    inputs: [],
    outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [] }],
  });
  useGraphStore.getState().loadWorkflow({
    nodes: [source, createNode(switchDefinition, 2)],
    links: [],
  });
}

function switchTypes(): string[] {
  const found = useGraphStore.getState().workflow?.nodes.find((entry) => entry.id === 2);
  return [...nodeInputs(found), ...nodeOutputs(found)].map((slot) => slotTypeName(slot.type));
}

describe('型が揃う口を繋ぐ', () => {
  it('ノード定義があれば、繋いだ線の型に揃えて載せる', () => {
    useDefinitionsStore.setState({ definitions });
    load();
    useGraphStore.getState().connect(1, 0, 2, 1);
    expect(switchTypes()).toEqual(['IMAGE', '*', 'IMAGE']);
  });

  it('ノード定義がまだ無ければ揃えない', () => {
    load();
    useGraphStore.getState().connect(1, 0, 2, 1);
    expect(switchTypes()).toEqual(['*', '*', '*']);
  });
});
