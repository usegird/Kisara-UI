import { withGroupBounds } from '@/graph/group-bounds';
import {
  contiguous,
  groupMembership,
  groupParents,
  itemAt,
  levelItemKey,
  type Membership,
} from '@/graph/groups';
import { laneSuccessors } from '@/graph/lane';
import { arrange } from '@/graph/layout-arrange';
import { same, type Arranged, type Context, type Item, type Positions } from '@/graph/layout-items';
import { linkIndex } from '@/graph/link-read';
import { DEFAULT_ORDER_LAYOUT, positionOf, type OrderLayout } from '@/graph/node-box';
import { routeLongLinks } from '@/graph/reroutes';
import type { NodeId, Workflow } from '@/graph/types';

// ─────────────────────────────
// 並びから位置を求める。グループは 1 つの箱として内側から置き、位置が決まったら遠くの複数へ出る線に
// 中継点を置く（`reroutes.ts`）。1 つの階層の置き方は `layout-arrange.ts`、読み戻す側は `layout-read.ts`。
// ─────────────────────────────

/** 置き直しの選び方 */
export interface RelayoutOptions {
  /** 縦も今の位置に寄せず、原点から置き直す（処理順に並べるときに選べる） */
  readonly fromOrigin?: boolean | undefined;
}

/** 置き直しの選び方と、所属の読み方 */
export interface RelayoutPlan extends RelayoutOptions {
  /** 所属。省くと今の位置から読む */
  readonly membership?: Membership | undefined;
}

/** 並んだノードの間の線（両端とも並びに入っているものだけ） */
interface LinkMaps {
  readonly consumers: Map<NodeId, Set<NodeId>>;
  readonly producers: Map<NodeId, Set<NodeId>>;
  readonly linked: Set<NodeId>;
}

/**
 * 並びどおりに位置を求める。`sequence` に無いノードは動かさない。
 * 同じグループのノードは先頭のメンバーの位置へ寄せて 1 つの箱にし、枠も求め直す。
 * 所属は渡されなければ今の位置から読む
 */
export function relayout(
  workflow: Workflow,
  sequence: readonly NodeId[],
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
  { membership = groupMembership(workflow, layout), fromOrigin = false }: RelayoutPlan = {},
): Workflow {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const parents = groupParents(workflow);
  const ids = contiguous([...new Set(sequence)], membership, parents).filter((id) => byId.has(id));
  const included = new Set(ids);

  const inner = new Map<Item, Arranged>();
  const context: Context = {
    nodeOf: byId,
    layout,
    ...linkMapsOf(workflow, included),
    order: new Map(ids.map((id, at) => [id, at])),
    inner,
    laneNext: laneSuccessors(included, workflow.links, membership),
    membership,
    parents,
  };
  const items = itemsOf(ids, context, null);
  for (const item of items) {
    if (item.group !== null) inner.set(item, arrangeInner(item, context, inner));
  }

  const arranged = arrange(items, context, 'outer');
  let positions = arranged.positions;
  // 原点から置き直す（枠を含めた箱の上端で揃える）
  if (fromOrigin && Number.isFinite(arranged.top)) {
    const shift = -arranged.top;
    positions = new Map([...positions].map(([id, [x, y]]) => [id, [x, y + shift]]));
  }

  const placed = withGroupBounds(withPositions(workflow, positions), membership, layout, parents);
  // 位置の変わったノードの束だけ、線の中継を置き直す。
  // 原点から置き直すときは、位置が変わらなくても全部置き直す
  const moved = new Set(
    placed.nodes.filter((node) => byId.get(node.id) !== node).map((node) => node.id),
  );
  return routeLongLinks(placed, layout, fromOrigin ? undefined : moved);
}

/** 並んだノードどうしの線を、出力先・入力元・線のあるノードの表にする（自分への線は数えない） */
function linkMapsOf(workflow: Workflow, included: ReadonlySet<NodeId>): LinkMaps {
  const consumers = new Map<NodeId, Set<NodeId>>();
  const producers = new Map<NodeId, Set<NodeId>>();
  const linked = new Set<NodeId>();
  for (const { originId, targetId } of linkIndex(workflow.links).values()) {
    if (originId === targetId || !included.has(originId) || !included.has(targetId)) continue;
    consumers.set(originId, (consumers.get(originId) ?? new Set()).add(targetId));
    producers.set(targetId, (producers.get(targetId) ?? new Set()).add(originId));
    linked.add(originId);
    linked.add(targetId);
  }
  return { consumers, producers, linked };
}

/** 位置が変わったノードだけを差し替える。1 つも変わらなければ同じものを返す */
function withPositions(workflow: Workflow, positions: Positions): Workflow {
  let changed = false;
  const nodes = workflow.nodes.map((node) => {
    const next = positions.get(node.id);
    const [x, y] = positionOf(node);
    if (!next || (same(next[0], x) && same(next[1], y))) return node;
    changed = true;
    return { ...node, pos: next };
  });
  return changed ? { ...workflow, nodes } : workflow;
}

/** 箱の中を置き、上端を 0 に揃える。子のグループの箱は先に中を置く */
function arrangeInner(item: Item, context: Context, inner: Map<Item, Arranged>): Arranged {
  const members = itemsOf(item.ids, context, item.group);
  for (const member of members) {
    if (member.group !== null) inner.set(member, arrangeInner(member, context, inner));
  }
  const arranged = arrange(members, context, 'inner');
  const shift = Number.isFinite(arranged.top) ? -arranged.top : 0;
  const positions: Positions = new Map(
    [...arranged.positions].map(([id, [x, y]]) => [id, [x, y + shift]]),
  );
  return { positions, width: arranged.width, top: 0, bottom: arranged.bottom + shift };
}

/**
 * `container` の階層の並びを、続いている同じ子のグループごとの箱と直下のノードに分ける
 * （外は null）
 */
function itemsOf(
  ids: readonly NodeId[],
  { membership, parents }: Pick<Context, 'membership' | 'parents'>,
  container: number | null,
): Item[] {
  const items: { ids: NodeId[]; key: string; group: number | null }[] = [];
  for (const id of ids) {
    const at = itemAt(id, container, membership, parents) ?? { kind: 'node', id };
    const key = levelItemKey(at);
    const last = items.at(-1);
    if (at.kind === 'group' && last?.key === key) last.ids.push(id);
    else items.push({ ids: [id], key, group: at.kind === 'group' ? at.index : null });
  }
  return items.map((item) => ({ ids: item.ids, group: item.group }));
}
