import { frameAround, withGroupBounds } from '@/graph/group-bounds';
import {
  groupMembership,
  groupParents,
  itemAt,
  lineage,
  type GroupParents,
  type Membership,
} from '@/graph/groups';
import { COLUMN_TOLERANCE } from '@/graph/layout-read';
import { positionOf, rectOf, type NodeRect, type OrderLayout } from '@/graph/node-box';
import { routeLongLinks } from '@/graph/reroutes';
import type { NodeId, Workflow, WorkflowNode } from '@/graph/types';

// ─────────────────────────────
// 変更箇所だけの置き直しの作業の形。作業中の位置と、箱・列の読み方。
// ─────────────────────────────

/** 位置を同じとみなす差（端数の違いでは動かしたことにしない） */
const SAME_POSITION_TOLERANCE = 0.5;

type Positions = Map<NodeId, [number, number]>;

/** 置き直しの作業場。位置は書き換えながら読む */
export interface Work {
  readonly workflow: Workflow;
  readonly layout: OrderLayout;
  readonly byId: Map<NodeId, WorkflowNode>;
  readonly pos: Positions;
  /** 所属（作業中に書き換える） */
  readonly membership: Map<NodeId, number>;
  /** グループの親（作業中に書き換える） */
  readonly parents: Map<number, number>;
  /** 動かしたノード（線の中継点を置き直す束を決める） */
  readonly moved: Set<NodeId>;
}

/** 1 つの階層（外か、グループの中）に並ぶもの。ノード 1 つか、子のグループの箱 */
export interface Item {
  readonly ids: readonly NodeId[];
  /** グループの箱なら添字 */
  readonly group: number | null;
  /** 読み戻しの位置（ノードは箱の左上、グループはメンバーの左端と上端） */
  readonly readLeft: number;
  readonly readTop: number;
  /** 占める箱（グループは枠の余白と見出しを含む） */
  readonly rect: NodeRect;
}

/** 入れる先・抜く元の階層。外は null、グループの中は添字 */
export type Container = number | null;

/** 作業中の位置でのノードの箱。無いノードは null */
export function nodeRect(work: Work, id: NodeId): NodeRect | null {
  const node = work.byId.get(id);
  if (!node) return null;
  const at = work.pos.get(id) ?? positionOf(node);
  return rectOf({ ...node, pos: at }, work.layout);
}

/** 箱をすべて囲む箱 */
export function union(rects: readonly NodeRect[]): NodeRect {
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

/** グループの中のノード（子のグループの中も）。`skip` のノードは数えない */
export function subtreeIds(work: Work, group: number, skip: ReadonlySet<NodeId>): NodeId[] {
  return work.workflow.nodes.flatMap((node) =>
    !skip.has(node.id) && lineage(work.membership.get(node.id), work.parents).includes(group)
      ? [node.id]
      : [],
  );
}

/** 階層に並ぶもの。`skip` のノードは数えない（入れる途中・抜く途中のもの） */
export function itemsOf(work: Work, container: Container, skip: ReadonlySet<NodeId>): Item[] {
  const items: Item[] = [];
  const children = new Map<number, NodeId[]>();
  for (const node of work.workflow.nodes) {
    if (skip.has(node.id)) continue;
    const at = itemAt(node.id, container, work.membership, work.parents);
    if (at === null) continue;
    if (at.kind === 'group') {
      children.set(at.index, [...(children.get(at.index) ?? []), node.id]);
      continue;
    }
    const rect = nodeRect(work, node.id);
    if (rect)
      items.push({ ids: [node.id], group: null, readLeft: rect.left, readTop: rect.top, rect });
  }
  for (const [group, ids] of children) {
    const rects = ids.flatMap((id) => nodeRect(work, id) ?? []);
    const frame = groupFrame(work, group, skip);
    if (rects.length === 0 || !frame) continue;
    const box = union(rects);
    items.push({ ids, group, readLeft: box.left, readTop: box.top, rect: frame });
  }
  return items;
}

/** 読み戻しと同じ決まりで列に分ける（左端の順、差がゆとり以内なら同じ列、列の中は上から） */
export function columnsOf(items: readonly Item[]): Item[][] {
  const byLeft = [...items].sort(
    (a, b) => a.readLeft - b.readLeft || a.readTop - b.readTop || (a.ids[0] ?? 0) - (b.ids[0] ?? 0),
  );
  const columns: Item[][] = [];
  for (const item of byLeft) {
    const column = columns.at(-1);
    const start = column?.[0]?.readLeft;
    if (column && start !== undefined && item.readLeft - start <= COLUMN_TOLERANCE) {
      column.push(item);
    } else columns.push([item]);
  }
  return columns.map((column) =>
    [...column].sort(
      (a, b) =>
        a.readTop - b.readTop || a.readLeft - b.readLeft || (a.ids[0] ?? 0) - (b.ids[0] ?? 0),
    ),
  );
}

/** 作業中の位置をまとめてずらす */
export function translate(work: Work, ids: readonly NodeId[], dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  for (const id of ids) {
    const node = work.byId.get(id);
    if (!node) continue;
    const [x, y] = work.pos.get(id) ?? positionOf(node);
    work.pos.set(id, [x + dx, y + dy]);
    work.moved.add(id);
  }
}

/** 要素の中のノードの id をすべて並べる */
export function idsOf(items: readonly Item[]): NodeId[] {
  return items.flatMap((item) => item.ids);
}

/** 列の左端 */
export function columnLeft(column: readonly Item[]): number {
  return Math.min(...column.map((item) => item.readLeft));
}

/** 列の右端 */
export function columnRight(column: readonly Item[]): number {
  return Math.max(...column.map((item) => item.rect.right));
}

/** 縦の範囲が重なるか */
export function overlapsVertically(a: NodeRect, b: NodeRect): boolean {
  return a.top < b.bottom && b.top < a.bottom;
}

/** そのノードが要素の中にあるか */
export function containsItem(item: Item, id: NodeId): boolean {
  return item.ids.includes(id);
}

/**
 * グループの枠（今の位置から。`withGroupBounds` と同じく、直下のメンバーの箱と子のグループの枠を
 * 囲む）。中に誰も居なければ null
 */
export function groupFrame(work: Work, group: number, skip: ReadonlySet<NodeId>): NodeRect | null {
  const rects: NodeRect[] = [];
  for (const [id, member] of work.membership) {
    if (member !== group || skip.has(id)) continue;
    const rect = nodeRect(work, id);
    if (rect) rects.push(rect);
  }
  for (const [child, parent] of work.parents) {
    if (parent !== group) continue;
    const frame = groupFrame(work, child, skip);
    if (frame) rects.push(frame);
  }
  return rects.length === 0 ? null : frameAround(rects);
}

/** 階層の親（外は null） */
export function parentOf(work: Work, group: number): Container {
  return work.parents.get(group) ?? null;
}

/** `container` から外へたどったグループの、今の枠（伸び縮みを外へ伝える前に測る） */
export function framesUp(
  work: Work,
  container: Container,
  skip: ReadonlySet<NodeId>,
): Map<number, NodeRect | null> {
  const frames = new Map<number, NodeRect | null>();
  for (const group of lineage(container ?? undefined, work.parents)) {
    frames.set(group, groupFrame(work, group, skip));
  }
  return frames;
}

/** 置き直しの作業を始める */
export function startWork(
  workflow: Workflow,
  layout: OrderLayout,
  membership?: Membership,
  parents?: GroupParents,
): Work {
  return {
    workflow,
    layout,
    byId: new Map(workflow.nodes.map((node) => [node.id, node])),
    pos: new Map(),
    membership: new Map(membership ?? groupMembership(workflow, layout)),
    parents: new Map(parents ?? groupParents(workflow)),
    moved: new Set(),
  };
}

/** 作業の結果を書き出す。位置の変わったノードだけ差し替え、枠と線の中継点を求め直す */
export function finish(work: Work): Workflow {
  let changed = false;
  const nodes = work.workflow.nodes.map((node) => {
    const next = work.pos.get(node.id);
    if (!next) return node;
    const [x, y] = positionOf(node);
    const still =
      Math.abs(next[0] - x) < SAME_POSITION_TOLERANCE &&
      Math.abs(next[1] - y) < SAME_POSITION_TOLERANCE;
    if (still) return node;
    changed = true;
    return { ...node, pos: next };
  });
  const placed = changed ? { ...work.workflow, nodes } : work.workflow;
  const framed = withGroupBounds(placed, work.membership, work.layout, work.parents);
  const moved = new Set(
    framed.nodes.filter((node, at) => node !== work.workflow.nodes[at]).map((node) => node.id),
  );
  return moved.size === 0 ? framed : routeLongLinks(framed, work.layout, moved);
}
