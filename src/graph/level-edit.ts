import { groupIndexOf } from '@/graph/groups';
import { settleLayout } from '@/graph/order';
import { type SortTarget } from '@/graph/order-move';
import { splitInnerGroupKey } from '@/graph/subgraph-display';
import { editLevel, levelOfId, sharedLevel } from '@/graph/subgraph-level';
import type { NodeId, Workflow } from '@/graph/types';

export type SortKey = NodeId | { readonly group: string };

export function inLevel(
  workflow: Workflow,
  level: NodeId | null | undefined,
  edit: (workflow: Workflow) => Workflow,
): Workflow {
  if (level === undefined) return workflow;
  if (level === null) return edit(workflow);
  return editLevel(workflow, level, (inner) => {
    const next = edit(inner);
    return next === inner ? inner : settleLayout(inner, next);
  });
}

export function sortKeyIn(key: SortKey): { readonly level: NodeId | null; readonly key: SortKey } {
  if (typeof key === 'number') return { level: levelOfId(key), key };
  const inner = splitInnerGroupKey(key.group);
  return inner === null
    ? { level: null, key }
    : { level: inner.instanceId, key: { group: inner.key } };
}

export function groupKeyIn(key: string): { readonly level: NodeId | null; readonly key: string } {
  const inner = splitInnerGroupKey(key);
  return inner === null ? { level: null, key } : { level: inner.instanceId, key: inner.key };
}

export function levelOfTargets(ids: readonly (NodeId | undefined)[]): NodeId | null | undefined {
  const known = ids.filter((id): id is NodeId => id !== undefined);
  return known.length === 0 ? null : sharedLevel(known);
}

export function sortTarget(workflow: Workflow, key: SortKey): SortTarget | null {
  if (typeof key === 'number') return { kind: 'node', id: key };
  const index = groupIndexOf(workflow, key.group);
  return index < 0 ? null : { kind: 'group', index };
}
