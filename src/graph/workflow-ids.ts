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

// ─────────────────────────────
// 採番。本体は外と全部の subgraph の定義で番号を共有する（`last_*_id` と定義の `state`）。
// 外だけを数えると、定義の中で使った番号を外でもう一度使う。
// ─────────────────────────────

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

/**
 * 外と全部の定義で共有している、配ったグループの番号の数え。本体は外と定義で
 * 1 つの数えを使い、読むときに記録の数えと実際の番号の大きい方に揃える
 */
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

/** 外と全部の定義で共有している、使ったノードの番号の最大 */
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

/** 外と全部の定義で共有している、使った線の番号の最大 */
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

/** 次に振る線の id */
export function nextLinkId(workflow: Workflow): LinkId {
  return lastLinkIdOf(workflow) + 1;
}

/** 次に振るノードの id */
export function nextNodeId(workflow: Workflow): NodeId {
  return lastNodeIdOf(workflow) + 1;
}
