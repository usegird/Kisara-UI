import { linkIndex } from '@/graph/link-read';
import {
  nodeInputs,
  nodeOutputs,
  slotTypeName,
  type NodeDefinitionMap,
  type NodeId,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { summarizeValues, type ValuePart } from '@/graph/widgets';

const ANY_TYPE = '*';

function matchesOutput(inputType: string, outputType: string): boolean {
  return inputType === outputType || inputType === ANY_TYPE || outputType === ANY_TYPE;
}

export type OutputValueResolver = (nodeId: NodeId, slot: number) => readonly ValuePart[];

export function joinValues(values: readonly ValuePart[]): string {
  return values.map((part) => part.text).join(', ');
}

export function createOutputValues(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
): OutputValueResolver {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const links = linkIndex(workflow.links);
  const cache = new Map<string, readonly ValuePart[]>();

  const upstream = (node: WorkflowNode, outputType: string) => {
    for (const input of nodeInputs(node)) {
      if (input.link === null || input.link === undefined) continue;
      if (!matchesOutput(slotTypeName(input.type), outputType)) continue;

      const link = links.get(input.link);
      if (link) return link;
    }
    return null;
  };

  const resolve = (nodeId: NodeId, slot: number, seen: Set<string>): readonly ValuePart[] => {
    const key = `${nodeId}:${slot}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    if (seen.has(key)) return [];

    seen.add(key);
    const node = byId.get(nodeId);
    if (!node) return [];

    const own = summarizeValues(node, definitions.get(node.type));
    const outputType = slotTypeName(nodeOutputs(node)[slot]?.type ?? ANY_TYPE);
    const source = upstream(node, outputType);

    const inherited = source ? resolve(source.originId, source.originSlot, seen) : [];
    const values = [...inherited, ...own];

    cache.set(key, values);
    return values;
  };

  return (nodeId, slot) => {
    try {
      return resolve(nodeId, slot, new Set());
    } catch {
      return [];
    }
  };
}
