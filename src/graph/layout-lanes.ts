import { boxFor, sidePad, widthFor, type Box, type Context, type Item } from '@/graph/layout-items';
import type { NodeId } from '@/graph/types';

const MIN_LANE_RUN = 3;

export interface Lane {
  readonly items: readonly Item[];
  readonly target: Item;
}

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
