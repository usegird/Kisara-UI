import type { Membership } from '@/graph/groups';
import { linkIndex } from '@/graph/link-read';
import type { NodeId, WorkflowLink } from '@/graph/types';

// ─────────────────────────────
// 支流のつながりと支流の判定。処理順・置き方・読み戻しの 3 か所が同じ判定を使うので、ここだけで決める。
// ─────────────────────────────

/** 支流の続き（前 → 次）。`ids` に無いノードとの線は数えない。所属の違う 2 つは繋がない */
export function laneSuccessors(
  ids: ReadonlySet<NodeId>,
  links: readonly WorkflowLink[],
  membership: Membership,
): Map<NodeId, NodeId> {
  const { consumers, producers } = linkSetsOf(ids, links);
  const next = new Map<NodeId, NodeId>();
  for (const [from, to] of consumers) {
    if (to.size !== 1 || (producers.get(from)?.size ?? 0) > 1) continue;
    const [target] = to;
    if (target === undefined || producers.get(target)?.size !== 1) continue;
    if (membership.get(from) !== membership.get(target)) continue;
    next.set(from, target);
  }
  return next;
}

/** `ids` の中どうしの線を、出力先・入力元の表にする（自分への線は数えない） */
function linkSetsOf(
  ids: ReadonlySet<NodeId>,
  links: readonly WorkflowLink[],
): {
  readonly consumers: Map<NodeId, Set<NodeId>>;
  readonly producers: Map<NodeId, Set<NodeId>>;
} {
  const consumers = new Map<NodeId, Set<NodeId>>();
  const producers = new Map<NodeId, Set<NodeId>>();
  for (const { originId, targetId } of linkIndex(links).values()) {
    if (originId === targetId || !ids.has(originId) || !ids.has(targetId)) continue;
    consumers.set(originId, (consumers.get(originId) ?? new Set()).add(targetId));
    producers.set(targetId, (producers.get(targetId) ?? new Set()).add(originId));
  }
  return { consumers, producers };
}

/** 支流。`ids` は本流の下に回り込む続き、`target` はその続きが入る、列に並ぶノード */
interface Lane {
  readonly ids: readonly NodeId[];
  readonly target: NodeId;
}

/**
 * 支流の続きをたどり、入る先（続きの最後のノード）と、本流の下に回り込む残りに分けて支流にする。
 * 始まりは前を持たないもの。
 */
export function lanes(next: ReadonlyMap<NodeId, NodeId>, links: readonly WorkflowLink[]): Lane[] {
  const feeding = new Set(
    [...linkIndex(links).values()]
      .filter((link) => link.originId !== link.targetId)
      .map((link) => link.originId),
  );
  const hasPrevious = new Set(next.values());
  const result: Lane[] = [];
  for (const start of next.keys()) {
    if (hasPrevious.has(start)) continue;
    const chain = [start];
    const seen = new Set(chain);
    for (let at = next.get(start); at !== undefined && !seen.has(at); at = next.get(at)) {
      chain.push(at);
      seen.add(at);
    }
    const target = chain.pop();
    if (target !== undefined && feeding.has(target) && chain.length >= 2)
      result.push({ ids: chain, target });
  }
  return result;
}
