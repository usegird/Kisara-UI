import { createNode } from '@/graph/create-node';
import { buildNodeViews, type NodeView } from '@/graph/rows';
import type { NodeDefinition, NodeDefinitionMap } from '@/graph/types';

const PREVIEW_NODE_ID = -1;

export function previewNodeView(
  definition: NodeDefinition,
  definitions: NodeDefinitionMap,
): NodeView | null {
  const node = createNode(definition, PREVIEW_NODE_ID);
  const options = { showControlNodes: true, showUnlinkedNodes: true };
  return buildNodeViews({ nodes: [node], links: [] }, definitions, options)[0] ?? null;
}
