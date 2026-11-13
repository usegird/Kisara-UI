import { GROUP_PADDING, GROUP_TITLE_HEIGHT } from '@/graph/group-bounds';
import { type GroupParents, type Membership } from '@/graph/groups';
import { boxOf, TITLE_HEIGHT, widthOf, type OrderLayout } from '@/graph/node-box';
import type { NodeId, WorkflowNode } from '@/graph/types';

// ─────────────────────────────
// 並びから位置を求めるときに置く 1 つ（ノードかグループの箱）と、その大きさ・置いた結果の形。
// ─────────────────────────────

/** 枠の見出しと上の余白（箱の上端からメンバーの箱の上端まで） */
export const FRAME_TOP = GROUP_PADDING + GROUP_TITLE_HEIGHT;
/** 枠の下の余白 */
export const FRAME_BOTTOM = GROUP_PADDING;

/** 位置を同じとみなす差（端数の違いでは動かしたことにしない） */
const SAME_POSITION_TOLERANCE = 0.5;

/** ノード → 位置（`pos`） */
export type Positions = Map<NodeId, [number, number]>;

/** 置く 1 つ。ノード（`ids` が 1 つ）か、グループの箱（中のノード全部の並び。`group` は添字） */
export interface Item {
  readonly ids: readonly NodeId[];
  readonly group: number | null;
}

/** 置いた結果。位置は `pos`（見出しの下）。端は箱（枠を含む）の端 */
export interface Arranged {
  readonly positions: Positions;
  readonly width: number;
  readonly top: number;
  readonly bottom: number;
}

/** 置いた箱の端（グループは枠の左右の余白も含む） */
export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** 揃える相手が占める縦の範囲（箱の上端と下端） */
export interface Span {
  readonly top: number;
  readonly bottom: number;
}

/** 置くときに見る、並び・線・箱の中の結果 */
export interface Context {
  readonly nodeOf: ReadonlyMap<NodeId, WorkflowNode>;
  readonly layout: OrderLayout;
  readonly consumers: ReadonlyMap<NodeId, ReadonlySet<NodeId>>;
  readonly producers: ReadonlyMap<NodeId, ReadonlySet<NodeId>>;
  readonly linked: ReadonlySet<NodeId>;
  readonly order: ReadonlyMap<NodeId, number>;
  /** 箱の中を置いた結果（箱の左上が原点） */
  readonly inner: ReadonlyMap<Item, Arranged>;
  /** 支流の続き（前 → 次） */
  readonly laneNext: ReadonlyMap<NodeId, NodeId>;
  readonly membership: Membership;
  readonly parents: GroupParents;
}

/** 2 つの値を同じ位置とみなすか */
export function same(a: number, b: number): boolean {
  return Math.abs(a - b) < SAME_POSITION_TOLERANCE;
}

/** 箱の幅（グループは中を置いた幅） */
export function widthFor(item: Item, context: Context): number {
  if (item.group !== null) return context.inner.get(item)?.width ?? 0;
  const node = context.nodeOf.get(item.ids[0] ?? -1);
  return node ? widthOf(node, context.layout) : context.layout.defaultWidth;
}

/** 箱の高さ（見出しを含む。グループは枠の見出しと余白も含む） */
export function boxFor(item: Item, context: Context): number {
  if (item.group !== null) {
    const inner = context.inner.get(item);
    return (inner ? inner.bottom - inner.top : 0) + FRAME_TOP + FRAME_BOTTOM;
  }
  const node = context.nodeOf.get(item.ids[0] ?? -1);
  return node ? boxOf(node, context.layout) : context.layout.defaultHeight + TITLE_HEIGHT;
}

/** 横の余白。グループの枠は箱の左右にはみ出す */
export function sidePad(item: Item): number {
  return item.group !== null ? GROUP_PADDING : 0;
}
