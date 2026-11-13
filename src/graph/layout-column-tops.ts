import {
  boxFor,
  FRAME_BOTTOM,
  FRAME_TOP,
  same,
  type Context,
  type Item,
  type Span,
} from '@/graph/layout-items';
import { COLUMN_TOLERANCE } from '@/graph/layout-read';
import { boxOf, heightOf, positionOf, rectOf, TITLE_HEIGHT } from '@/graph/node-box';
import type { NodeId } from '@/graph/types';

// ─────────────────────────────
// 並びから位置を求めるときの縦位置（箱の上端）。右の列から決め、入力元を接続先より上寄りに置く。
// 接続先が右に無いものは、全体では入力元の今の範囲より下寄りに置き、箱の中では上から積む
// ─────────────────────────────

/** 置き方。`outer` は全体（縦は今の位置に寄せる）、`inner` は箱の中（上から積む） */
type ArrangeMode = 'outer' | 'inner';

/** 縦位置を決める間の持ち物 */
interface TopsState {
  readonly context: Context;
  readonly mode: ArrangeMode;
  /** 支流のノード → その支流が入る先のノード */
  readonly via: ReadonlyMap<NodeId, NodeId>;
  /** ノード → 列の添字 */
  readonly columnAt: ReadonlyMap<NodeId, number>;
  /** 決めたノードの箱の中央 */
  readonly centers: Map<NodeId, number>;
  /** 中央を控えたノードの箱（見出しを含む）の高さの半分 */
  readonly halves: Map<NodeId, number>;
  readonly tops: Map<Item, number>;
  /** 支流は本流の下へ回り込むので、高さを揃える入力元にしない（追いかけるとずれていく） */
  readonly laneIds: ReadonlySet<NodeId>;
  /** 接続先として揃えた相手（右のいちばん近い列の接続先） */
  readonly nearestOf: Map<Item, readonly NodeId[]>;
  readonly anchoredTo: Set<NodeId>;
  /** 入力元の今の高さに揃えた、1 つだけの列（あとで入力元の新しい高さに揃え直す） */
  readonly rested: { readonly item: Item; readonly index: number }[];
}

/** 同じ相手に揃える、続いた箱の塊 */
interface Block {
  readonly anchor: Span | null;
  readonly items: Item[];
}

/** 塊と、その箱の高さ・全体の高さ・置きたい上端 */
interface Entry {
  readonly block: Block;
  readonly boxes: readonly number[];
  readonly total: number;
  desired: number;
}

/** 列ごとの箱の上端を決める */
export function columnTops(
  columns: readonly (readonly Item[])[],
  context: Context,
  mode: ArrangeMode,
  via: ReadonlyMap<NodeId, NodeId>,
): Map<Item, number> {
  const columnAt = new Map<NodeId, number>();
  columns.forEach((column, index) => {
    for (const item of column) for (const id of item.ids) columnAt.set(id, index);
  });
  const state: TopsState = {
    context,
    mode,
    via,
    columnAt,
    centers: new Map(),
    halves: new Map(),
    tops: new Map(),
    laneIds: new Set(via.keys()),
    nearestOf: new Map(),
    anchoredTo: new Set(),
    rested: [],
  };

  for (let index = columns.length - 1; index >= 0; index -= 1) {
    placeColumn(state, columns[index] ?? [], index);
  }
  realignRested(state);
  return state.tops;
}

function placeColumn(state: TopsState, column: readonly Item[], index: number): void {
  const { layout } = state.context;
  const blocks = columnBlocks(state, column, index);
  const entries = blocks.map((block) => blockEntry(state, block, index, blocks.length === 1));

  // 列の高さは接続先のある塊が決める。行き止まり（揃える相手の無い塊）は、同じ列で
  // 後ろに接続先のある塊があれば、その上に下から積み上げる（天井にして押し下げない）
  let ceiling: number | null = null;
  for (let k = entries.length - 1; k >= 0; k -= 1) {
    const entry = entries[k];
    if (entry === undefined) continue;
    if (entry.block.anchor !== null) ceiling = entry.desired;
    else if (ceiling !== null) {
      entry.desired = ceiling - layout.stackGap - entry.total;
      ceiling = entry.desired;
    }
  }

  // 上から順に置き、前の箱と重なるなら下へずらす
  let end = Number.NEGATIVE_INFINITY;
  for (const { block, boxes, desired } of entries) {
    let at = Number.isFinite(end) ? Math.max(desired, end + layout.stackGap) : desired;
    block.items.forEach((item, k) => {
      settle(state, item, at);
      at += (boxes[k] ?? 0) + layout.stackGap;
    });
    end = at - layout.stackGap;
  }
}

/**
 * 同じ接続先に揃うものは、続いていれば 1 つの塊にして塊ごと揃える。
 * 接続先が揃わないまま同じ入力元から枝分かれして積んだ列は、まるごと 1 つの塊にして
 * 入力元に揃える（接続先ごとに揃えると、押し下げた分を次の並べ直しで追いかけてずれていく）
 * 行き止まり（揃える相手の無いもの）は揃い方を見ない（下で接続先のある塊の上下に積む）
 */
function columnBlocks(state: TopsState, column: readonly Item[], index: number): Block[] {
  const anchors = column.map((item) => anchorOf(state, item, index));
  const live = anchors.filter((anchor): anchor is Span => anchor !== null);
  const aligned = live.length > 0 && live.every((anchor) => sameSpan(anchor, live[0] ?? null));
  if (column.length > 1 && !aligned && sharedProducer(column, state.context)) {
    return [{ anchor: null, items: [...column] }];
  }
  const blocks: Block[] = [];
  column.forEach((item, k) => {
    const anchor = anchors[k] ?? null;
    const last = blocks.at(-1);
    if (last && anchor !== null && last.anchor !== null && sameSpan(last.anchor, anchor)) {
      last.items.push(item);
    } else {
      blocks.push({ anchor, items: [item] });
    }
  });
  return blocks;
}

/** 塊の高さと置きたい上端を求め、揃えた相手と後で揃え直すものを控える */
function blockEntry(state: TopsState, block: Block, index: number, single: boolean): Entry {
  const { context } = state;
  const boxes = block.items.map((item) => boxFor(item, context));
  const total = boxes.reduce((sum, h) => sum + h, 0) + context.layout.stackGap * (boxes.length - 1);
  const desired = desiredTop(state, block, index, total);
  const first = block.items[0];
  if (block.anchor !== null) {
    for (const item of block.items)
      for (const id of state.nearestOf.get(item) ?? []) state.anchoredTo.add(id);
  } else if (state.mode === 'outer' && first && single && block.items.length === 1) {
    state.rested.push({ item: first, index });
  }
  return { block, boxes, total, desired };
}

/** 塊の上端。接続先があればそれより上寄り、無ければ入力元の今の範囲より下寄り（箱の中は 0） */
function desiredTop(state: TopsState, block: Block, index: number, total: number): number {
  const { context } = state;
  const whole: Span = { top: 0, bottom: total };
  if (block.anchor !== null) {
    const feedsRight = (id: NodeId, item: Item): boolean =>
      feedsColumnRight(state, id, item, index);
    return upperLeft(block.anchor, spanWithin(context, block.items, feedsRight) ?? whole);
  }
  const first = block.items[0];
  if (state.mode === 'inner' || first === undefined) return 0;
  // 入力元が行き止まりを範囲に数えないのと同じ基準で揃える（互いの基準が
  // 違うと、並べ直すたびにずれていく）
  return lowerRight(
    restingSpan(first, context, state.laneIds),
    spanWithin(context, block.items, (id, item) => flowsThrough(context, id, item)) ??
      spanWithin(context, block.items, (id, item) => fedFromOutside(context, id, item)) ??
      whole,
  );
}

/**
 * 入力元の今の高さに揃えたものは、入力元がこの回で動いていれば新しい高さに揃え直す
 * （次の並べ直しで動かないように）。ほかのものが接続先として揃えていれば動かさない
 */
function realignRested(state: TopsState): void {
  const { context } = state;
  for (const { item, index } of state.rested) {
    if (item.ids.some((id) => state.anchoredTo.has(id))) continue;
    const span = settledSpan(state, item, index);
    if (span === null) continue;
    const own = (id: NodeId, of: Item): boolean =>
      [...(context.producers.get(id) ?? [])].some((from) => !of.ids.includes(from));
    const whole: Span = { top: 0, bottom: boxFor(item, context) };
    settle(state, item, lowerRight(span, spanWithin(context, [item], own) ?? whole));
  }
}

/** 箱の上端を決め、メンバーの中央を控える（左の列が接続先として使う） */
function settle(state: TopsState, item: Item, top: number): void {
  const { context } = state;
  const { layout } = context;
  state.tops.set(item, top);
  const inner = item.group !== null ? context.inner.get(item) : undefined;
  for (const id of item.ids) {
    const node = context.nodeOf.get(id);
    if (!node) continue;
    const y = inner ? top + FRAME_TOP + (inner.positions.get(id)?.[1] ?? 0) : top + TITLE_HEIGHT;
    state.centers.set(id, y + (heightOf(node, layout) - TITLE_HEIGHT) / 2);
    state.halves.set(id, boxOf(node, layout) / 2);
  }
}

/**
 * 右にある、いちばん近い列の接続先が占める範囲。無ければ null。
 * その先に接続先が無いもの（プレビュー・保存）は、ほかに接続先があれば数えない
 * （背の高いプレビューが列の天井にいると、入力元がそこへ引き上げられる）
 */
function anchorOf(state: TopsState, item: Item, index: number): Span | null {
  const { context, columnAt, centers } = state;
  const own = new Set(item.ids);
  // 支流のノードは列に無いので、その支流の入る先を接続先とみなす
  const targets = [
    ...new Set(
      item.ids.flatMap((id) =>
        [...(context.consumers.get(id) ?? [])].map((to) => state.via.get(to) ?? to),
      ),
    ),
  ].filter((to) => !own.has(to) && (columnAt.get(to) ?? -1) > index && centers.has(to));
  if (targets.length === 0) return null;
  const flowing = targets.filter((to) => (context.consumers.get(to)?.size ?? 0) > 0);
  const pool = flowing.length > 0 ? flowing : targets;
  const nearest = Math.min(...pool.map((to) => columnAt.get(to) ?? 0));
  const near = pool.filter((to) => columnAt.get(to) === nearest);
  state.nearestOf.set(item, near);
  return settledRange(state, near);
}

/** 入力元（`restingSpan` と同じ選び方）の、この回で決めた列が占める範囲 */
function settledSpan(state: TopsState, item: Item, index: number): Span | null {
  const { context, columnAt } = state;
  const own = new Set(item.ids);
  const rank = (id: NodeId): number => context.order.get(id) ?? 0;
  const first = Math.min(...item.ids.map(rank));
  const sources = [...new Set(item.ids.flatMap((id) => [...(context.producers.get(id) ?? [])]))]
    .filter((id) => !own.has(id) && !state.laneIds.has(id))
    .sort((a, b) => rank(b) - rank(a));
  const source = sources.find((id) => rank(id) < first) ?? sources[0];
  const at = source === undefined ? undefined : columnAt.get(source);
  if (source === undefined || at === undefined || at >= index) return null;
  const column = sources.filter((id) => columnAt.get(id) === at && state.centers.has(id));
  if (column.length === 0) return null;
  return settledRange(state, column);
}

/** 決めたノードの箱が占める縦の範囲 */
function settledRange(state: TopsState, ids: readonly NodeId[]): Span {
  const edge = (id: NodeId, sign: number): number =>
    (state.centers.get(id) ?? 0) + sign * (state.halves.get(id) ?? 0);
  return {
    top: Math.min(...ids.map((id) => edge(id, -1))),
    bottom: Math.max(...ids.map((id) => edge(id, 1))),
  };
}

/**
 * 塊の上端から見た、`pick` に当たるノードの箱が占める範囲。当たるものが無ければ null。
 * 塊全体ではなく、線の繋がるノードを揃える（グループの枠の分だけずれ、
 * 入力元の高さに揃うものとの間で、並べ直すたびにずれていく）
 */
function spanWithin(
  context: Context,
  block: readonly Item[],
  pick: (id: NodeId, item: Item) => boolean,
): Span | null {
  const { layout } = context;
  const spans: (readonly [number, number])[] = [];
  let at = 0;
  for (const item of block) {
    const inner = item.group !== null ? context.inner.get(item) : undefined;
    for (const id of item.ids) {
      const node = context.nodeOf.get(id);
      if (!node || !pick(id, item)) continue;
      const top = inner ? at + FRAME_TOP + (inner.positions.get(id)?.[1] ?? 0) - TITLE_HEIGHT : at;
      spans.push([top, top + boxOf(node, layout)]);
    }
    at += boxFor(item, context) + layout.stackGap;
  }
  if (spans.length === 0) return null;
  return {
    top: Math.min(...spans.map(([top]) => top)),
    bottom: Math.max(...spans.map(([, end]) => end)),
  };
}

/** 右の列へ出力する */
function feedsColumnRight(state: TopsState, id: NodeId, item: Item, index: number): boolean {
  return [...(state.context.consumers.get(id) ?? [])].some(
    (to) => !item.ids.includes(to) && (state.columnAt.get(state.via.get(to) ?? to) ?? -1) > index,
  );
}

/** 自分の箱の外から入力を受ける */
function fedFromOutside(context: Context, id: NodeId, item: Item): boolean {
  return [...(context.producers.get(id) ?? [])].some((from) => !item.ids.includes(from));
}

/** 外から入力を受け、その先にも接続先がある（行き止まりでない） */
function flowsThrough(context: Context, id: NodeId, item: Item): boolean {
  return fedFromOutside(context, id, item) && (context.consumers.get(id)?.size ?? 0) > 0;
}

/** 列のどれにも入力している、列の外のノードがあるか */
function sharedProducer(column: readonly Item[], context: Context): boolean {
  const own = new Set(column.flatMap((item) => item.ids));
  const sources = (item: Item): Set<NodeId> =>
    new Set(
      item.ids.flatMap((id) => [...(context.producers.get(id) ?? [])].filter((p) => !own.has(p))),
    );
  const [first, ...rest] = column.map(sources);
  return [...(first ?? [])].some((p) => rest.every((set) => set.has(p)));
}

/** 今の範囲（見出しを含む箱）。グループの箱は枠を含める */
function currentItemSpan(item: Item, context: Context): Span {
  const rects = item.ids.flatMap((id) => {
    const node = context.nodeOf.get(id);
    return node ? [rectOf(node, context.layout)] : [];
  });
  if (rects.length === 0) return { top: 0, bottom: 0 };
  const [above, below] = item.group !== null ? [FRAME_TOP, FRAME_BOTTOM] : [0, 0];
  return {
    top: Math.min(...rects.map((rect) => rect.top)) - above,
    bottom: Math.max(...rects.map((rect) => rect.bottom)) + below,
  };
}

/**
 * 接続先が右に無いとき（最後のものなど）に揃える相手の範囲。**外の入力元の今の範囲**
 * （並びで直前にいる入力元を優先）。自分の今の高さを使うと、下に積んであったものが
 * 最後になったとき、全体がその高さへ寄ってしまう。入力元も無ければ今の範囲。
 * 入力元が縦に積んだ列にいれば、**同じ列の入力元をまとめた範囲**
 * （1 つだけに揃えると、列がこちらに積み直されるたびにずれていく）
 */
function restingSpan(item: Item, context: Context, skip: ReadonlySet<NodeId>): Span {
  const own = new Set(item.ids);
  const rank = (id: NodeId): number => context.order.get(id) ?? 0;
  const first = Math.min(...item.ids.map(rank));
  const sources = [...new Set(item.ids.flatMap((id) => [...(context.producers.get(id) ?? [])]))]
    .filter((id) => !own.has(id) && !skip.has(id))
    .sort((a, b) => rank(b) - rank(a));
  const source = sources.find((id) => rank(id) < first) ?? sources[0];
  const node = source === undefined ? undefined : context.nodeOf.get(source);
  if (!node) return currentItemSpan(item, context);

  const left = positionOf(node)[0];
  const column = sources.flatMap((id) => {
    const other = context.nodeOf.get(id);
    return other && Math.abs(positionOf(other)[0] - left) <= COLUMN_TOLERANCE
      ? [rectOf(other, context.layout)]
      : [];
  });
  return {
    top: Math.min(...column.map((rect) => rect.top)),
    bottom: Math.max(...column.map((rect) => rect.bottom)),
  };
}

function sameSpan(a: Span | null, b: Span | null): boolean {
  return a !== null && b !== null && same(a.top, b.top) && same(a.bottom, b.bottom);
}

/**
 * 左（入力元）を右（接続先）より上寄りに置く。左の方が高ければ
 * 下端を揃えて余りを上へ、右の方が高ければ上端を揃えて余りを下へ。
 * `left` は塊の上端を 0 とした相対の範囲。戻り値は塊の上端
 */
function upperLeft(right: Span, left: Span): number {
  const taller = left.bottom - left.top > right.bottom - right.top;
  return taller ? right.bottom - left.bottom : right.top - left.top;
}

/** 右（接続先の無いもの）を左（入力元）より下寄りに置く。`upperLeft` の左右逆 */
function lowerRight(left: Span, right: Span): number {
  const taller = right.bottom - right.top > left.bottom - left.top;
  return taller ? left.top - right.top : left.bottom - right.bottom;
}
