import type {
  InputDefinition,
  NodeDefinition,
  NodeId,
  Workflow,
  WorkflowNode,
} from '@/graph/types';
import { defaultSlots, defaultSlotValues } from '@/graph/widget-slots';
import { nextNodeId } from '@/graph/workflow-ids';

export function socketInputs(definition: NodeDefinition): readonly InputDefinition[] {
  return defaultSlots(definition.inputs).inputs.filter((input) => !input.isWidget);
}

export function createNode(
  definition: NodeDefinition,
  id: NodeId,
  pos: [number, number] = [0, 0],
  blank: ReadonlySet<string> = new Set(),
): WorkflowNode {
  return {
    id,
    type: definition.name,
    pos,
    mode: 0,
    inputs: socketInputs(definition).map((input) => ({
      name: input.name,
      type: input.type,
      link: null,
    })),
    outputs: definition.outputs.map((output) => ({
      name: output.name,
      type: output.type,
      links: [],
    })),
    properties: { 'Node name for S&R': definition.name },
    widgets_values: defaultSlotValues(defaultSlots(definition.inputs), blank),
  };
}

export function withNewNode(workflow: Workflow, node: WorkflowNode): Workflow {
  if (workflow.nodes.some((existing) => existing.id === node.id)) return workflow;

  return {
    ...workflow,
    nodes: [...workflow.nodes, node],
    last_node_id: Math.max(node.id, nextNodeId(workflow) - 1),
  };
}
