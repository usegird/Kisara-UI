import { readLink } from '@/graph/link-read';
import {
  subgraphDefinitions,
  type LinkId,
  type NodeId,
  type SubgraphDefinition,
  type Workflow,
  type WorkflowLink,
} from '@/graph/types';
import { isRecord } from '@/lib/guards';

function maxOf(values: Iterable<number>): number {
  let max = 0;
  for (const value of values) if (value > max) max = value;
  return max;
}

function stateNumber(definition: SubgraphDefinition, key: string): number {
  const value = isRecord(definition.state) ? definition.state[key] : undefined;
  return typeof value === 'number' ? value : 0;
}

function groupIds(groups: unknown): number[] {
  if (!Array.isArray(groups)) return [];
  return (groups as unknown[]).flatMap((group) =>
    isRecord(group) && typeof group.id === 'number' ? [group.id] : [],
  );
}

export function lastGroupIdOf(workflow: Workflow): number {
  const state = isRecord(workflow.state) ? workflow.state.lastGroupId : undefined;
  return maxOf([
    typeof state === 'number' ? state : 0,
    ...groupIds(workflow.groups),
    ...subgraphDefinitions(workflow).flatMap((definition) => [
      stateNumber(definition, 'lastGroupId'),
      ...groupIds(definition.groups),
    ]),
  ]);
}

export function lastNodeIdOf(workflow: Workflow): number {
  return maxOf([
    typeof workflow.last_node_id === 'number' ? workflow.last_node_id : 0,
    ...workflow.nodes.map((node) => node.id),
    ...subgraphDefinitions(workflow).flatMap((definition) => [
      stateNumber(definition, 'lastNodeId'),
      ...definition.nodes.map((node) => node.id),
    ]),
  ]);
}

export function lastLinkIdOf(workflow: Workflow): number {
  const ids = (links: readonly WorkflowLink[]): number[] =>
    links.map((link) => readLink(link)?.id ?? 0);
  return maxOf([
    typeof workflow.last_link_id === 'number' ? workflow.last_link_id : 0,
    ...ids(workflow.links),
    ...subgraphDefinitions(workflow).flatMap((definition) => [
      stateNumber(definition, 'lastLinkId'),
      ...ids(definition.links),
    ]),
  ]);
}

export function nextLinkId(workflow: Workflow): LinkId {
  return lastLinkIdOf(workflow) + 1;
}

export function nextNodeId(workflow: Workflow): NodeId {
  return lastNodeIdOf(workflow) + 1;
}
