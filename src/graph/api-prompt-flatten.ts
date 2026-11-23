import { linkIndex } from '@/graph/link-read';
import { subgraphInputAt, subgraphMap } from '@/graph/subgraph';
import {
  FRONTEND_ONLY_TYPES,
  isNoteType,
  NODE_MODE,
  nodeInputs,
  nodeMode,
  nodeOutputs,
  SUBGRAPH_IO_NODE_ID,
  type LinkId,
  type NodeDefinition,
  type NodeDefinitionMap,
  type NodeId,
  type ResolvedLink,
  type SubgraphDefinition,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';

interface Source {
  readonly nodeId: string;
  readonly slot: number;
}

interface Level {
  readonly prefix: string;
  readonly nodesById: Map<NodeId, WorkflowNode>;
  readonly links: Map<LinkId, ResolvedLink>;
  readonly boundary: ((walk: Walk, slot: number) => Source | null) | null;
  readonly subgraphs: ReadonlyMap<string, SubgraphDefinition>;
  readonly chain: readonly string[];
}

export interface FlatNode {
  readonly id: string;
  readonly node: WorkflowNode;
  readonly level: Level;
  readonly definition: NodeDefinition | undefined;
  readonly sources: Map<string, Source>;
}

interface Walk {
  readonly childLevels: ReadonlyMap<string, Level>;
  readonly seen: Set<string>;
}

export interface SubgraphCycle {
  readonly id: string;
  readonly type: string;
  readonly name: string;
}

interface Build {
  readonly childLevels: Map<string, Level>;
  readonly flat: Map<string, FlatNode>;
  readonly definitions: NodeDefinitionMap;
  readonly cycles: SubgraphCycle[];
}

interface FlatWorkflow {
  readonly flat: Map<string, FlatNode>;
  readonly cycles: readonly SubgraphCycle[];
}

export function flattenWorkflow(workflow: Workflow, definitions: NodeDefinitionMap): FlatWorkflow {
  const build: Build = { childLevels: new Map(), flat: new Map(), definitions, cycles: [] };
  buildLevel(build, {
    prefix: '',
    nodesById: nodesById(workflow.nodes),
    links: linkIndex(workflow.links),
    boundary: null,
    subgraphs: subgraphMap(workflow),
    chain: [],
  });

  for (const entry of build.flat.values()) {
    nodeInputs(entry.node).forEach((input, index) => {
      const walk = { childLevels: build.childLevels, seen: new Set<string>() };
      const source = resolveInput(walk, entry.level, entry.node, index);
      if (source) entry.sources.set(input.name, source);
    });
  }
  return { flat: build.flat, cycles: build.cycles };
}

export function reachableNodes(flat: ReadonlyMap<string, FlatNode>): Set<string> {
  const reachable = new Set<string>();
  const queue: string[] = [];

  for (const entry of flat.values()) {
    if (entry.definition?.outputNode === true) {
      reachable.add(entry.id);
      queue.push(entry.id);
    }
  }

  while (queue.length > 0) {
    const id = queue.pop();
    if (id === undefined) break;

    const entry = flat.get(id);
    if (!entry) continue;

    for (const source of entry.sources.values()) {
      if (reachable.has(source.nodeId)) continue;
      if (!flat.has(source.nodeId)) continue;
      reachable.add(source.nodeId);
      queue.push(source.nodeId);
    }
  }
  return reachable;
}

function buildLevel(build: Build, level: Level): void {
  for (const node of level.nodesById.values()) {
    const mode = nodeMode(node);
    const definition = level.subgraphs.get(node.type);

    if (definition) {
      if (mode !== NODE_MODE.normal) continue;
      if (level.chain.includes(definition.id)) {
        build.cycles.push({
          id: absoluteId(level, node.id),
          type: node.type,
          name: definition.name ?? node.type,
        });
        continue;
      }

      const child = createChildLevel(level, node, definition);
      build.childLevels.set(absoluteId(level, node.id), child);
      buildLevel(build, child);
      continue;
    }

    if (node.type === FRONTEND_ONLY_TYPES.reroute) continue;
    if (isNoteType(node.type)) continue;
    if (mode !== NODE_MODE.normal) continue;

    const id = absoluteId(level, node.id);
    build.flat.set(id, {
      id,
      node,
      level,
      definition: build.definitions.get(node.type),
      sources: new Map<string, Source>(),
    });
  }
}

function createChildLevel(
  parent: Level,
  instance: WorkflowNode,
  definition: SubgraphDefinition,
): Level {
  return {
    prefix: `${absoluteId(parent, instance.id)}:`,
    nodesById: nodesById(definition.nodes),
    links: linkIndex(definition.links),
    subgraphs: parent.subgraphs,
    chain: [...parent.chain, definition.id],
    boundary: (walk, slot) => {
      const io = subgraphInputAt(definition, slot);
      if (!io) return null;

      const index = nodeInputs(instance).findIndex((input) => input.name === io.name);
      if (index < 0) return null;

      return resolveInput(walk, parent, instance, index);
    },
  };
}

function resolveInput(
  walk: Walk,
  level: Level,
  node: WorkflowNode,
  inputIndex: number,
): Source | null {
  const input = nodeInputs(node)[inputIndex];
  if (!input || input.link === null || input.link === undefined) return null;

  const link = level.links.get(input.link);
  if (!link) return null;

  return resolveOutput(walk, level, link.originId, link.originSlot);
}

function resolveSubgraphOutput(
  walk: Walk,
  level: Level,
  node: WorkflowNode,
  slot: number,
): Source | null {
  const child = walk.childLevels.get(absoluteId(level, node.id));
  if (!child) return null;

  for (const link of child.links.values()) {
    if (link.targetId !== SUBGRAPH_IO_NODE_ID.output) continue;
    if (link.targetSlot !== slot) continue;

    return resolveOutput(walk, child, link.originId, link.originSlot);
  }
  return null;
}

function resolveOutput(walk: Walk, level: Level, nodeId: NodeId, slot: number): Source | null {
  const key = `${level.prefix}${nodeId}#${slot}`;
  if (walk.seen.has(key)) return null;
  walk.seen.add(key);

  if (nodeId === SUBGRAPH_IO_NODE_ID.input) {
    return level.boundary ? level.boundary(walk, slot) : null;
  }

  const node = level.nodesById.get(nodeId);
  if (!node) return null;

  const mode = nodeMode(node);
  const isSubgraph = level.subgraphs.has(node.type);

  if (isSubgraph && mode === NODE_MODE.normal) {
    return resolveSubgraphOutput(walk, level, node, slot);
  }
  if (node.type === FRONTEND_ONLY_TYPES.reroute) {
    return resolveInput(walk, level, node, 0);
  }
  if (mode === NODE_MODE.bypass) {
    const outputType = nodeOutputs(node)[slot]?.type;
    const index = nodeInputs(node).findIndex((input) => input.type === outputType);
    return index >= 0 ? resolveInput(walk, level, node, index) : null;
  }
  if (mode === NODE_MODE.mute) return null;

  return { nodeId: absoluteId(level, nodeId), slot };
}

function absoluteId(level: Level, nodeId: NodeId): string {
  return `${level.prefix}${nodeId}`;
}

function nodesById(nodes: readonly WorkflowNode[]): Map<NodeId, WorkflowNode> {
  const map = new Map<NodeId, WorkflowNode>();
  for (const node of nodes) map.set(node.id, node);
  return map;
}
