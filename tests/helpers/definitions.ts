import { searchDefinitions, type SearchFilters } from '@/graph/search';
import type { InputDefinition, NodeDefinition, NodeDefinitionMap } from '@/graph/types';

export function widget(
  name: string,
  type: string,
  config: Readonly<Record<string, unknown>> = {},
): InputDefinition {
  return { name, type, required: true, isWidget: true, options: null, config };
}

export function socket(name: string, type: string): InputDefinition {
  return { name, type, required: true, isWidget: false, options: null, config: {} };
}

export function definition(
  name: string,
  inputs: readonly InputDefinition[],
  overrides: Partial<NodeDefinition> = {},
): NodeDefinition {
  return {
    name,
    displayName: name,
    category: '',
    inputs,
    outputs: [],
    module: 'nodes',
    outputNode: false,
    ...overrides,
  };
}

export function definitionMap(...definitions: readonly NodeDefinition[]): NodeDefinitionMap {
  return new Map(definitions.map((entry) => [entry.name, entry]));
}

export function matchesFilters(definition: NodeDefinition, filters: SearchFilters): boolean {
  return searchDefinitions(definitionMap(definition), '', { filters }).length > 0;
}
