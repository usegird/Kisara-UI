import { GROUP_PADDING, GROUP_TITLE_HEIGHT } from '@/graph/group-bounds';
import { type GroupParents, type Membership } from '@/graph/groups';
import { boxOf, TITLE_HEIGHT, widthOf, type OrderLayout } from '@/graph/node-box';
import type { NodeId, WorkflowNode } from '@/graph/types';

export const FRAME_TOP = GROUP_PADDING + GROUP_TITLE_HEIGHT;
export const FRAME_BOTTOM = GROUP_PADDING;

const SAME_POSITION_TOLERANCE = 0.5;

export type Positions = Map<NodeId, [number, number]>;

export interface Item {
  readonly ids: readonly NodeId[];
  readonly group: number | null;
}

export interface Arranged {
  readonly positions: Positions;
  readonly width: number;
  readonly top: number;
  readonly bottom: number;
}

export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface Span {
  readonly top: number;
  readonly bottom: number;
}

export interface Context {
  readonly nodeOf: ReadonlyMap<NodeId, WorkflowNode>;
  readonly layout: OrderLayout;
  readonly consumers: ReadonlyMap<NodeId, ReadonlySet<NodeId>>;
  readonly producers: ReadonlyMap<NodeId, ReadonlySet<NodeId>>;
  readonly linked: ReadonlySet<NodeId>;
  readonly order: ReadonlyMap<NodeId, number>;
  readonly inner: ReadonlyMap<Item, Arranged>;
  readonly laneNext: ReadonlyMap<NodeId, NodeId>;
  readonly membership: Membership;
  readonly parents: GroupParents;
}

export function same(a: number, b: number): boolean {
  return Math.abs(a - b) < SAME_POSITION_TOLERANCE;
}

export function widthFor(item: Item, context: Context): number {
  if (item.group !== null) return context.inner.get(item)?.width ?? 0;
  const node = context.nodeOf.get(item.ids[0] ?? -1);
  return node ? widthOf(node, context.layout) : context.layout.defaultWidth;
}

export function boxFor(item: Item, context: Context): number {
  if (item.group !== null) {
    const inner = context.inner.get(item);
    return (inner ? inner.bottom - inner.top : 0) + FRAME_TOP + FRAME_BOTTOM;
  }
  const node = context.nodeOf.get(item.ids[0] ?? -1);
  return node ? boxOf(node, context.layout) : context.layout.defaultHeight + TITLE_HEIGHT;
}

export function sidePad(item: Item): number {
  return item.group !== null ? GROUP_PADDING : 0;
}
