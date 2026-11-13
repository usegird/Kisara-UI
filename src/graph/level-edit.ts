import { groupIndexOf } from '@/graph/groups';
import { settleLayout } from '@/graph/order';
import { type SortTarget } from '@/graph/order-move';
import { splitInnerGroupKey } from '@/graph/subgraph-display';
import { editLevel, levelOfId, sharedLevel } from '@/graph/subgraph-level';
import type { NodeId, Workflow } from '@/graph/types';

// ─────────────────────────────
// 編集の対象（ノード・グループの鍵・置き場所）が属する階層を解き、その階層の中で編集する。
// ─────────────────────────────

/** 並べ替えで掴むもの。カードはノード id、グループは鍵 */
export type SortKey = NodeId | { readonly group: string };

/**
 * 階層（外なら null）の中で編集する。中なら、中で伸びた分を送ってから
 * 定義へ書き戻す（外の位置は変わらないので、外では動かない）。
 * 階層が決まらない（またぐ）ときは undefined が来るので、何もしない
 */
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

/** 並べ替えの鍵の階層と、階層の中での鍵を求める。 */
export function sortKeyIn(key: SortKey): { readonly level: NodeId | null; readonly key: SortKey } {
  if (typeof key === 'number') return { level: levelOfId(key), key };
  const inner = splitInnerGroupKey(key.group);
  return inner === null
    ? { level: null, key }
    : { level: inner.instanceId, key: { group: inner.key } };
}

/** グループの鍵の階層と、階層の中での鍵を求める。 */
export function groupKeyIn(key: string): { readonly level: NodeId | null; readonly key: string } {
  const inner = splitInnerGroupKey(key);
  return inner === null ? { level: null, key } : { level: inner.instanceId, key: inner.key };
}

/** 置き場所の指定と繋ぐ先が属する階層を求める。どれも無ければ外 */
export function levelOfTargets(ids: readonly (NodeId | undefined)[]): NodeId | null | undefined {
  const known = ids.filter((id): id is NodeId => id !== undefined);
  return known.length === 0 ? null : sharedLevel(known);
}

/** 並べ替えの鍵をノードかグループの添字にする。グループが見つからなければ null */
export function sortTarget(workflow: Workflow, key: SortKey): SortTarget | null {
  if (typeof key === 'number') return { kind: 'node', id: key };
  const index = groupIndexOf(workflow, key.group);
  return index < 0 ? null : { kind: 'group', index };
}
