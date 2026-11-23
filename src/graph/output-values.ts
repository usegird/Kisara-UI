import { linkIndex } from '@/graph/link-read';
import { openSubgraphIds } from '@/graph/subgraph-level';
import { entryWidgetsOf, outerValueOf } from '@/graph/subgraph-values';
import {
  NODE_MODE,
  nodeInputs,
  nodeOutputs,
  slotTypeName,
  subgraphDefinitions,
  type NodeDefinitionMap,
  type NodeId,
  type SubgraphDefinition,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { resolveWidgetValues, summarizeValues, valuePartOf, type ValuePart } from '@/graph/widgets';

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
  const subgraphs = new Map(subgraphDefinitions(workflow).map((sub) => [sub.id, sub]));
  const open = new Set(openSubgraphIds(workflow));

  const entryOf = (node: WorkflowNode, slot: number) => {
    const definition = open.has(node.id) ? subgraphs.get(node.type) : undefined;
    const io = definition?.inputs?.[slot];
    if (definition === undefined || io === undefined) return null;
    const input = nodeInputs(node).find((candidate) => candidate.name === io.name);
    const source = input?.link == null ? undefined : links.get(input.link);
    if (source) return { source, values: [] };
    const value = entryValueOf(node, definition, slot, definitions);
    const bypassed = node.mode === NODE_MODE.bypass;
    const name = io.label ?? io.name;
    return {
      source: null,
      values: value === undefined ? [] : [valuePartOf(name, value, bypassed)],
    };
  };

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

    const entry = entryOf(node, slot);
    if (entry !== null) {
      const values = entry.source
        ? resolve(entry.source.originId, entry.source.originSlot, seen)
        : entry.values;
      cache.set(key, values);
      return values;
    }

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

function entryValueOf(
  instance: WorkflowNode,
  definition: SubgraphDefinition,
  slot: number,
  definitions: NodeDefinitionMap,
): unknown {
  const outer = outerValueOf(instance, definition, slot, definitions);
  if (outer !== null) return outer.kind === 'value' ? outer.value : undefined;
  const widget = entryWidgetsOf(definition)[slot];
  const inner = widget ? definition.nodes.find((node) => node.id === widget.nodeId) : undefined;
  const innerDefinition = inner ? definitions.get(inner.type) : undefined;
  if (!widget || !inner || !innerDefinition) return undefined;
  const values = resolveWidgetValues(inner, innerDefinition);
  return values.ok ? values.byWidget.get(widget.name) : undefined;
}
