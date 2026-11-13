import { boxFor, sidePad, widthFor, type Box, type Context, type Item } from '@/graph/layout-items';
import type { NodeId } from '@/graph/types';

// ─────────────────────────────
// 支流（並びで続き、本流の 1 つへ入るノードの列）を見つけ、入る先の左に横 1 段で並べる。
// ─────────────────────────────

/** 段に分けて並べる列の最短の長さ（合流先を含む） */
const MIN_LANE_RUN = 3;

/** 支流。並びで続くノードと、続きの最後のノード（入る先。列に並ぶ） */
export interface Lane {
  readonly items: readonly Item[];
  readonly target: Item;
}

/**
 * 並びの中の支流。グループの箱は支流に入れない
 */
export function findLanes(items: readonly Item[], context: Context): Lane[] {
  const lanes: Lane[] = [];
  const continues = (from: Item | undefined, to: Item | undefined): boolean =>
    from !== undefined &&
    to !== undefined &&
    from.group === null &&
    to.group === null &&
    context.laneNext.get(from.ids[0] ?? -1) === to.ids[0];
  let at = 0;
  while (at < items.length) {
    const run: Item[] = [];
    for (let k = at; k < items.length; k += 1) {
      const item = items[k];
      if (item === undefined) break;
      if (run.length > 0 && !continues(run.at(-1), item)) break;
      run.push(item);
    }
    const target = run.at(-1);
    const joins = (context.consumers.get(target?.ids[0] ?? -1)?.size ?? 0) > 0;
    if (run.length >= MIN_LANE_RUN && target && joins)
      lanes.push({ items: run.slice(0, -1), target });
    at += Math.max(run.length, 1);
  }
  return lanes;
}

interface LaneState {
  readonly context: Context;
  readonly tops: Map<Item, number>;
  readonly xOf: Map<Item, number>;
  readonly placed: Box[];
}

/**
 * 支流を置く。右端は入る先の左端－隙間、左へ実幅＋隙間で詰める。上端は X が重なる箱の下、
 * 重なる箱が無ければ入る先と中央を揃える。段のノードは上端を揃える
 */
export function placeLane(lane: Lane, { context, tops, xOf, placed }: LaneState): void {
  const { layout } = context;
  const targetX = xOf.get(lane.target);
  if (targetX === undefined) return;

  const lefts: number[] = [];
  let right = targetX - sidePad(lane.target) - layout.gap;
  for (const item of [...lane.items].reverse()) {
    const left = right - widthFor(item, context);
    lefts.unshift(left);
    right = left - layout.gap;
  }
  const from = lefts[0] ?? targetX;
  const to = targetX - sidePad(lane.target) - layout.gap;
  const tallest = Math.max(...lane.items.map((item) => boxFor(item, context)));

  const above = placed.filter((box) => box.left < to && from < box.right);
  const targetTop = tops.get(lane.target) ?? 0;
  const top =
    above.length > 0
      ? Math.max(...above.map((box) => box.bottom)) + layout.stackGap
      : targetTop + boxFor(lane.target, context) / 2 - tallest / 2;

  lane.items.forEach((item, at) => {
    const left = lefts[at] ?? from;
    xOf.set(item, left);
    tops.set(item, top);
    placed.push({
      left,
      right: left + widthFor(item, context),
      top,
      bottom: top + boxFor(item, context),
    });
  });
}

/** 支流のノード → その支流が入る先のノード（列の接続先として使う） */
export function laneVia(lanes: readonly Lane[], context: Context): Map<NodeId, NodeId> {
  const via = new Map<NodeId, NodeId>();
  for (const lane of lanes) {
    const last = lane.items.at(-1)?.ids[0] ?? -1;
    const fed = lane.target.ids.find((id) => context.consumers.get(last)?.has(id));
    if (fed === undefined) continue;
    for (const item of lane.items) for (const id of item.ids) via.set(id, fed);
  }
  return via;
}
