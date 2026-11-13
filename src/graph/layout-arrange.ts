import { columnTops } from '@/graph/layout-column-tops';
import {
  boxFor,
  FRAME_TOP,
  sidePad,
  widthFor,
  type Arranged,
  type Box,
  type Context,
  type Item,
  type Positions,
} from '@/graph/layout-items';
import { findLanes, laneVia, placeLane } from '@/graph/layout-lanes';
import { COLUMN_TOLERANCE } from '@/graph/layout-read';
import { TITLE_HEIGHT } from '@/graph/node-box';
import type { NodeId } from '@/graph/types';

// ─────────────────────────────
// 1 つの階層の並びを置く。線のあるものを列に分けて左から詰め、線の無いものは端か下に積み、
// 支流は入る先の左に横 1 段で並べる。縦位置は `layout-column-tops.ts`。
// ─────────────────────────────

/**
 * 並びで続くものの左端の最小の差。読み戻しのゆとり（`COLUMN_TOLERANCE`）の 2 倍にし、
 * 少し動かしても前後が入れ替わらないようにする
 */
const ORDER_STEP = COLUMN_TOLERANCE * 2;

/**
 * 後ろから列を決める。列の中は並びの順。続いているものがどれも右の列へ入力しているか、
 * どれも同じものから入力を受けていて、互いに線で繋がっていなければ同じ列に積む
 */
function splitColumns(items: readonly Item[], feeds: (from: Item, to: Item) => boolean): Item[][] {
  const columns: Item[][] = [];
  let run: Item[] = [];
  let target: readonly Item[] | null = null;

  for (const item of [...items].reverse()) {
    const right = target;
    const into = (u: Item): boolean => right?.some((t) => feeds(u, t)) ?? false;
    const related = (u: Item): boolean => feeds(item, u) || feeds(u, item);
    // 同じものから入力を受ける（同じ入力元から枝分かれした）
    const sibling = items.some((p) => feeds(p, item) && run.every((u) => feeds(p, u)));
    const stacks = (into(item) && run.every(into)) || sibling;
    if (run.length > 0 && stacks && !run.some(related)) {
      run.unshift(item);
      continue;
    }
    if (run.length > 0) {
      columns.unshift(run);
      target = run;
    }
    run = [item];
  }
  if (run.length > 0) columns.unshift(run);
  return columns;
}

/** 横に置く間の持ち物 */
interface PlaceState {
  readonly context: Context;
  readonly tops: Map<Item, number>;
  readonly xOf: Map<Item, number>;
  readonly placed: Box[];
  /** ノード → 置いた箱の右端（線が逆走しないように見る） */
  readonly rightOf: Map<NodeId, number>;
}

/** 横に並べる列と、列に入れないもの */
interface ColumnRun {
  readonly items: readonly Item[];
  readonly columns: readonly (readonly Item[])[];
  readonly linked: (item: Item) => boolean;
  /** 開始軸・終了軸・支流（別に置く） */
  readonly skip: ReadonlySet<Item>;
}

/**
 * 並びどおりに置く。`outer` は全体（横は `startX` から、縦は今の位置に寄せる）、
 * `inner` は箱の中（横は 0 から、接続先が中に無いものは上から積む）
 */
export function arrange(
  items: readonly Item[],
  context: Context,
  mode: 'outer' | 'inner',
): Arranged {
  const { layout } = context;
  // 箱は、中に線のあるメンバーがいるときだけ線のあるものとして扱う
  const linked = (item: Item): boolean => item.ids.some((id) => context.linked.has(id));

  // 線の無いもの: 線のあるものより前（開始軸）・後（終了軸）・途中に分ける
  const firstLinked = items.findIndex(linked);
  const lastLinked = items.findLastIndex(linked);
  const head = firstLinked < 0 ? [...items] : items.slice(0, firstLinked);
  const tail = firstLinked < 0 ? [] : items.slice(lastLinked + 1).filter((item) => !linked(item));

  // 支流は列にしない
  const lanes = findLanes(items, context);
  const inLane = new Set(lanes.flatMap((lane) => lane.items));

  // 線のあるものだけで列を決める
  const columns = splitColumns(
    items.filter((item) => linked(item) && !inLane.has(item)),
    (from, to) => feeds(context, from, to),
  );

  // 縦位置
  const tops = columnTops(columns, context, mode, laneVia(lanes, context));
  const firstTop = tops.size > 0 ? Math.min(...tops.values()) : 0;

  const origin = mode === 'outer' ? layout.startX : 0;
  const state: PlaceState = { context, tops, xOf: new Map(), placed: [], rightOf: new Map() };

  // 開始軸の線の無いものは、いちばん左に 1 列に積む
  let cursor = origin - ORDER_STEP;
  if (head.length > 0) {
    stackColumn(state, head, origin, firstTop);
    cursor = origin;
  }

  // 横位置。並びの順に、列は詰めて置き、途中の線の無いものは並びの位置だけ取る
  const band: Item[] = [];
  const skip = new Set([...head, ...tail, ...inLane]);
  cursor = placeColumns(state, { items, columns, linked, skip }, cursor, band);

  // 支流は入る先の左に横 1 段で並べ、X が重なる箱の下へ回り込ませる
  for (const lane of lanes) placeLane(lane, state);
  cursor = shiftIntoFrame(state, origin, cursor);

  // 終了軸の線の無いものは、いちばん右に 1 列に積む
  if (tail.length > 0) {
    const right = Math.max(origin, ...state.placed.map((box) => box.right + layout.gap));
    stackColumn(state, tail, Math.max(cursor + ORDER_STEP, right), firstTop);
  }

  const below = placeBand(state, band, origin);
  return arrangedOf(items, state, below, origin);
}

/** 1 列に上から積む（開始軸・終了軸の線の無いもの） */
function stackColumn(state: PlaceState, column: readonly Item[], x: number, from: number): void {
  const { context } = state;
  let top = from;
  for (const item of column) {
    const width = widthFor(item, context);
    state.xOf.set(item, x);
    state.tops.set(item, top);
    state.placed.push({ left: x, right: x + width, top, bottom: top + boxFor(item, context) });
    top += boxFor(item, context) + context.layout.stackGap;
  }
}

/**
 * 並びの順に、列は詰めて置き、途中の線の無いものは並びの位置だけ取る（`band` に入れ、あとで
 * 下に積む）。最後の左端を返す
 */
function placeColumns(
  state: PlaceState,
  { items, columns, linked, skip }: ColumnRun,
  start: number,
  band: Item[],
): number {
  const { context, xOf } = state;
  const columnOf = new Map<Item, readonly Item[]>();
  for (const column of columns) for (const item of column) columnOf.set(item, column);

  let cursor = start;
  /** 続けて来た線の無いものは、横をずらさず同じ左端に揃える（下で 1 列に積む） */
  let inRun = false;
  for (const item of items) {
    if (skip.has(item)) continue;
    if (!linked(item)) {
      if (!inRun) cursor += ORDER_STEP;
      inRun = true;
      xOf.set(item, cursor);
      band.push(item);
      continue;
    }
    // 置き済みの列の途中のものは、続きを切らない（列の後ろに読むので）
    const column = columnOf.get(item);
    if (!column || xOf.has(item)) continue;
    inRun = false;

    const x = columnLeft(state, column, cursor + ORDER_STEP);
    for (const member of column) {
      const top = state.tops.get(member) ?? 0;
      const width = widthFor(member, context);
      const pad = sidePad(member);
      xOf.set(member, x);
      state.placed.push({
        left: x - pad,
        right: x + width + pad,
        top,
        bottom: top + boxFor(member, context),
      });
      for (const id of member.ids) state.rightOf.set(id, x + width);
    }
    cursor = x;
  }
  return cursor;
}

/** 支流が始まりより左へはみ出したら、全体を右へずらす（箱の中で枠の外へ出さない） */
function shiftIntoFrame(state: PlaceState, origin: number, cursor: number): number {
  const { placed, xOf } = state;
  const shift = origin - Math.min(origin, ...placed.map((box) => box.left));
  if (shift <= 0) return cursor;
  for (const [item, x] of xOf) xOf.set(item, x + shift);
  placed.splice(
    0,
    placed.length,
    ...placed.map((box) => ({ ...box, left: box.left + shift, right: box.right + shift })),
  );
  return cursor + shift;
}

/**
 * 途中の線の無いものは、横が重なる箱の下（重なる箱が無ければ全体の下端の下）。
 * 下に置いたものどうしが重なるなら下へずらす
 */
function placeBand(state: PlaceState, band: readonly Item[], origin: number): Box[] {
  const { context, placed } = state;
  const { layout } = context;
  const floor = Math.max(Number.NEGATIVE_INFINITY, ...placed.map((box) => box.bottom));
  const bandTop = Number.isFinite(floor) ? floor + layout.stackGap : 0;
  const below: Box[] = [];
  for (const item of band) {
    const x = state.xOf.get(item) ?? origin;
    const width = widthFor(item, context);
    const overlaps = (box: Box): boolean =>
      x < box.right + layout.stackGap && box.left < x + width + layout.stackGap;
    const above = placed.filter(overlaps);
    let top =
      above.length > 0 ? Math.max(...above.map((box) => box.bottom)) + layout.stackGap : bandTop;
    for (const box of below) if (overlaps(box)) top = Math.max(top, box.bottom + layout.stackGap);
    state.tops.set(item, top);
    below.push({ left: x, right: x + width, top, bottom: top + boxFor(item, context) });
  }
  return below;
}

/** 置いた箱を位置にし、全体の幅と上下の端を求める */
function arrangedOf(
  items: readonly Item[],
  state: PlaceState,
  below: readonly Box[],
  origin: number,
): Arranged {
  const positions: Positions = new Map();
  for (const item of items) {
    const x = state.xOf.get(item);
    const top = state.tops.get(item);
    if (x === undefined || top === undefined) continue;
    const inner = item.group !== null ? state.context.inner.get(item) : undefined;
    if (inner) {
      for (const [id, [ix, iy]] of inner.positions) {
        positions.set(id, [x + ix, top + FRAME_TOP + iy]);
      }
    } else {
      positions.set(item.ids[0] ?? -1, [x, top + TITLE_HEIGHT]);
    }
  }

  const all = [...state.placed, ...below];
  return {
    positions,
    width: Math.max(origin, ...all.map((box) => box.right)) - origin,
    top: Math.min(Number.POSITIVE_INFINITY, ...all.map((box) => box.top)),
    bottom: Math.max(Number.NEGATIVE_INFINITY, ...all.map((box) => box.bottom)),
  };
}

/**
 * 4. 列の左端。並び順・高さが重なる箱・入力元のうち、いちばん右が要る位置。
 * 高さが重ならない箱とは X が重なってよい
 */
function columnLeft(state: PlaceState, column: readonly Item[], start: number): number {
  const { context } = state;
  const { layout } = context;
  let x = start;
  for (const member of column) {
    const top = state.tops.get(member) ?? 0;
    const bottom = top + boxFor(member, context);
    const pad = sidePad(member);
    for (const box of state.placed) {
      if (top < box.bottom + layout.stackGap && box.top < bottom + layout.stackGap) {
        x = Math.max(x, box.right + layout.gap + pad);
      }
    }
    // 線が逆走しない（入力元の右端より右）
    for (const id of member.ids) {
      for (const from of context.producers.get(id) ?? []) {
        const right = state.rightOf.get(from);
        if (right !== undefined && !member.ids.includes(from)) {
          x = Math.max(x, right + layout.gap + pad);
        }
      }
    }
  }
  return x;
}

/** `from` のどれかが `to` のどれかへ出力しているか */
function feeds(context: Context, from: Item, to: Item): boolean {
  return from.ids.some((id) => to.ids.some((t) => context.consumers.get(id)?.has(t) ?? false));
}
