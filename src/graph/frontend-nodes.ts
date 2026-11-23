import { FRONTEND_ONLY_TYPES, type NodeDefinition, type NodeDefinitionMap } from '@/graph/types';

function noteDefinition(type: string): NodeDefinition {
  return {
    name: type,
    displayName: type,
    category: '',
    module: '',
    inputs: [
      {
        name: 'text',
        type: 'STRING',
        required: true,
        isWidget: true,
        options: null,
        config: { multiline: true },
      },
    ],
    outputs: [],
    outputNode: false,
  };
}

const FRONTEND_DEFINITIONS: NodeDefinitionMap = new Map(
  FRONTEND_ONLY_TYPES.notes.map((type) => [type, noteDefinition(type)]),
);

export function definitionOf(
  definitions: NodeDefinitionMap,
  type: string,
): NodeDefinition | undefined {
  return definitions.get(type) ?? FRONTEND_DEFINITIONS.get(type);
}
