import { subgraphDefinitions } from '@/graph/normalize';
import type {
  NodeDefinition,
  NodeId,
  SubgraphDefinition,
  SubgraphIo,
  Workflow,
  WorkflowNode,
} from '@/graph/types';
import { writeWidgetByName } from '@/graph/widgets';
import { isUnknownArray } from '@/lib/guards';

export function subgraphMap(workflow: Workflow): Map<string, SubgraphDefinition> {
  const map = new Map<string, SubgraphDefinition>();
  for (const definition of subgraphDefinitions(workflow)) {
    if (typeof definition.id === 'string') map.set(definition.id, definition);
  }
  return map;
}

interface ProxyWidgetRef {
  readonly nodeId: NodeId;
  readonly widget: string;
}

export function proxyWidgets(node: WorkflowNode): ProxyWidgetRef[] {
  const raw: unknown = node.properties?.proxyWidgets;
  if (!isUnknownArray(raw)) return [];

  const refs: ProxyWidgetRef[] = [];
  for (const entry of raw) {
    if (!isUnknownArray(entry) || entry.length < 2) continue;

    const rawId = entry[0];
    const rawWidget = entry[1];
    const nodeId = typeof rawId === 'string' ? Number(rawId) : rawId;
    if (typeof nodeId !== 'number' || Number.isNaN(nodeId)) continue;
    if (typeof rawWidget !== 'string') continue;

    refs.push({ nodeId, widget: rawWidget });
  }
  return refs;
}

export function subgraphInputAt(
  definition: SubgraphDefinition,
  slot: number,
): SubgraphIo | undefined {
  return (definition.inputs ?? [])[slot];
}

export interface SubgraphWidgetRef {
  readonly subgraphId: string;
  readonly innerNodeId: NodeId;
  readonly innerDefinition: NodeDefinition;
  readonly widgetName: string;
}

export function writeSubgraphWidget(
  workflow: Workflow,
  { subgraphId, innerNodeId, innerDefinition, widgetName }: SubgraphWidgetRef,
  value: unknown,
): Workflow | null {
  const subgraphs = subgraphDefinitions(workflow);
  const targetIndex = subgraphs.findIndex((definition) => definition.id === subgraphId);
  if (targetIndex < 0) return null;

  const target = subgraphs[targetIndex];
  if (!target) return null;

  const innerIndex = target.nodes.findIndex((node) => node.id === innerNodeId);
  const inner = target.nodes[innerIndex];
  if (!inner) return null;

  if (innerDefinition.inputs.some((input) => input.name === widgetName && input.branches)) {
    return null;
  }
  const updated = writeWidgetByName(inner, innerDefinition, widgetName, value);
  if (!updated) return null;

  const nextNodes = [...target.nodes];
  nextNodes[innerIndex] = updated;

  const nextSubgraphs = [...subgraphs];
  nextSubgraphs[targetIndex] = { ...target, nodes: nextNodes };

  return {
    ...workflow,
    definitions: { ...workflow.definitions, subgraphs: nextSubgraphs },
  };
}
