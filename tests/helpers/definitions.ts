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

export function switchNodeRaw(): Record<string, unknown> {
  const template = { template_id: 'switch', allowed_types: '*' };
  return {
    input: {
      required: { switch: ['BOOLEAN', {}] },
      optional: {
        on_false: ['COMFY_MATCHTYPE_V3', { lazy: true, template }],
        on_true: ['COMFY_MATCHTYPE_V3', { lazy: true, template }],
      },
    },
    input_order: { required: ['switch'], optional: ['on_false', 'on_true'] },
    output: ['COMFY_MATCHTYPE_V3'],
    output_name: ['output'],
    output_matchtypes: ['switch'],
    name: 'ComfySwitchNode',
    display_name: 'If/Else Switch',
  };
}
