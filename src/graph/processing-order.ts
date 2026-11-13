import {
  groupMembership,
  groupParents,
  itemAt,
  levelItemKey,
  type LevelItem,
  type Membership,
} from '@/graph/groups';
import { lanes, laneSuccessors } from '@/graph/lane';
import { latestOrder } from '@/graph/latest-order';
import { orderedNodeIds } from '@/graph/layout-read';
import { linkIndex } from '@/graph/link-read';
import type { NodeId, ResolvedLink, Workflow } from '@/graph/types';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// 処理順。グループは 1 つの箱として階層ごとに並べ、支流は入る先の直前へ寄せる（芯は `latest-order.ts`）。
// ─────────────────────────────

/**
 * 受け取った型を次へ出していない入力か。受け取る型と同じ型の出力を持ち、
 * それが 1 つも繋がっていない（繋がりは線の一覧から読む。ノード側の控えは古いことがある）
 */
function deadInputOf(workflow: Workflow, links: readonly ResolvedLink[]) {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const used = new Set(links.map((link) => `${String(link.originId)}:${String(link.originSlot)}`));
  return (link: ResolvedLink): boolean => {
    const outputs: unknown = byId.get(link.targetId)?.outputs;
    if (!Array.isArray(outputs)) return false;
    const slots = outputs.flatMap((output: unknown, slot) =>
      isRecord(output) && 'type' in output && output.type === link.type ? [slot] : [],
    );
    return (
      slots.length > 0 &&
      slots.every((slot) => !used.has(`${String(link.targetId)}:${String(slot)}`))
    );
  };
}

/**
 * 表示順（＝処理順）。処理の順を守り、それぞれを使う直前まで遅らせる。
 * グループは 1 つの箱として並べ、箱の中はメンバーだけで並べる。
 *
 * 既存ワークフローの `pos` は自由な2D配置なので、Y 順に並べると流れが読めない。
 * 一本道リストとして読めるようにするための整列。
 */
export function topologicalOrder(workflow: Workflow): NodeId[] {
  const current = orderedNodeIds(workflow);
  const membership = groupMembership(workflow);
  const parents = groupParents(workflow);
  const all = [...linkIndex(workflow.links).values()];
  const dead = deadInputOf(workflow, all);

  // 階層ごとに並べる。子のグループは 1 つの箱として並べ、箱の中も同じように並べる
  const level = (ids: readonly NodeId[], container: number | null): NodeId[] => {
    const unitOf = (id: NodeId): LevelItem =>
      itemAt(id, container, membership, parents) ?? { kind: 'node', id };
    const members = new Map<string, { readonly unit: LevelItem; readonly ids: NodeId[] }>();
    for (const id of ids) {
      const unit = unitOf(id);
      const known = members.get(levelItemKey(unit));
      if (known) known.ids.push(id);
      else members.set(levelItemKey(unit), { unit, ids: [id] });
    }
    const inside = new Set(ids);
    const edges = all
      .filter(
        ({ originId, targetId }) =>
          container === null || (inside.has(originId) && inside.has(targetId)),
      )
      .map((link) => ({
        from: levelItemKey(unitOf(link.originId)),
        to: levelItemKey(unitOf(link.targetId)),
        slot: link.targetSlot,
        use: !dead(link),
      }));
    return latestOrder([...members.keys()], edges).flatMap((key) => {
      const entry = members.get(key);
      if (!entry) return [];
      return entry.unit.kind === 'group' ? level(entry.ids, entry.unit.index) : entry.ids;
    });
  };
  return lanesBeforeTarget(level(current, null), workflow, membership);
}

/**
 * 支流を、入る先（続きの最後のノード。同じ所属）の直前へ続けて移す
 */
function lanesBeforeTarget(
  order: readonly NodeId[],
  workflow: Workflow,
  membership: Membership,
): NodeId[] {
  let result = [...order];
  for (const { ids, target } of lanes(
    laneSuccessors(new Set(order), workflow.links, membership),
    workflow.links,
  )) {
    const rest = result.filter((id) => !ids.includes(id));
    const at = rest.indexOf(target);
    if (at >= 0) result = [...rest.slice(0, at), ...ids, ...rest.slice(at)];
  }
  return result;
}
