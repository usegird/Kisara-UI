import { frameAround, GROUP_PADDING, GROUP_TITLE_HEIGHT } from '@/graph/group-bounds';
import { closeColumns, propagateUp, shiftColumns } from '@/graph/layout-shift-columns';
import {
  columnLeft,
  columnRight,
  columnsOf,
  containsItem,
  framesUp,
  groupFrame,
  idsOf,
  itemsOf,
  nodeRect,
  parentOf,
  translate,
  union,
  type Container,
  type Item,
  type Work,
} from '@/graph/layout-shift-work';
import type { NodeRect } from '@/graph/node-box';
import type { NodeId } from '@/graph/types';

// ─────────────────────────────
// ノードやグループのまとまりを、変更箇所だけの置き直しで入れる・抜く。
// ─────────────────────────────

/** 入れるもの 1 つ。ノード 1 つか、グループの箱（メンバーの間隔を保って動かす） */
export interface Unit {
  readonly ids: readonly NodeId[];
  readonly group: number | null;
}

/** 入れる先。`beside` の前か後ろ。null なら階層の末尾 */
export interface Spot {
  readonly container: Container;
  readonly beside: NodeId | { readonly group: number } | null;
  readonly side: 'before' | 'after';
}

/** まとまり全体の箱。箱の無いまとまりは null */
export function unitRect(work: Work, unit: Unit): NodeRect | null {
  const rects = unit.ids.flatMap((id) => nodeRect(work, id) ?? []);
  if (rects.length === 0) return null;
  if (unit.group === null) return union(rects);
  return groupFrame(work, unit.group, new Set()) ?? frameAround(rects);
}

/** 入れるものの所属を `container` に書く（ノードは所属、グループの箱は親） */
function assignContainer(work: Work, units: readonly Unit[], container: Container): void {
  for (const unit of units) {
    if (unit.group === null) {
      for (const id of unit.ids) {
        if (container === null) work.membership.delete(id);
        else work.membership.set(id, container);
      }
    } else if (container === null) work.parents.delete(unit.group);
    else work.parents.set(unit.group, container);
  }
}

/** 入れる先の隣（`beside`）に当たるものか */
function isBeside(item: Item, beside: Spot['beside']): boolean {
  if (beside === null) return false;
  if (typeof beside === 'number') return item.group === null && containsItem(item, beside);
  return item.group === beside.group;
}

/**
 * `units` を `spot` へ入れる。入れるものの所属は `spot.container` に書く。
 * 入れるものは今の位置から抜いた扱いで数える（呼ぶ側で、元の場所は先に詰めておく）。
 * 読み戻すと「上 → 入れたもの → 下」になる
 */
export function insertUnits(work: Work, units: readonly Unit[], spot: Spot): void {
  const adding = new Set(units.flatMap((unit) => unit.ids));
  assignContainer(work, units, spot.container);
  const before = framesUp(work, spot.container, adding);
  const frameBefore = spot.container === null ? null : (before.get(spot.container) ?? null);

  const items = itemsOf(work, spot.container, adding);
  const columns = columnsOf(items);
  const matches = (item: Item): boolean => isBeside(item, spot.beside);
  const at = columns.findIndex((column) => column.some(matches));

  let x: number;
  let top: number;
  let column: Item[] | null = null;
  let lower: Item[] = [];
  if (at < 0) {
    // 末尾。いちばん右の箱の右に、最後の列の上端に揃えて置く
    const last = columns.at(-1);
    x = last
      ? Math.max(...items.map((item) => item.rect.right)) + work.layout.gap
      : startOf(work, frameBefore);
    top = last ? Math.min(...last.map((item) => item.rect.top)) : topOf(frameBefore);
  } else {
    column = columns[at] ?? [];
    const index = column.findIndex(matches);
    const split = spot.side === 'after' ? index + 1 : index;
    const upper = column.slice(0, split);
    lower = column.slice(split);
    const anchor = column[index];
    x = upper.length > 0 ? columnRight(upper) + work.layout.gap : columnLeft(column);
    top = anchor ? anchor.rect.top : 0;
  }

  // 入れるものを 1 つずつ別の列に置く（上端を揃える）
  let right = x;
  let lastLeft = x;
  for (const unit of units) {
    const rect = unitRect(work, unit);
    if (!rect) continue;
    translate(work, unit.ids, right - rect.left, top - rect.top);
    lastLeft = right;
    right += rect.right - rect.left + work.layout.gap;
  }
  const insertedRight = right - work.layout.gap;

  if (column !== null && at >= 0) {
    const oldLeft = columnLeft(column);
    const oldRight = columnRight(column);
    let blockRight = insertedRight;
    let blockLastLeft = lastLeft;
    if (lower.length > 0) {
      const lowerLeft = columnLeft(lower);
      const dx = insertedRight + work.layout.gap - lowerLeft;
      translate(work, idsOf(lower), dx, 0);
      blockLastLeft = lowerLeft + dx;
      blockRight = columnRight(lower) + dx;
    }
    const dx = Math.max(blockLastLeft - oldLeft, blockRight - oldRight, 0);
    shiftColumns(work, columns.slice(at + 1), dx);
  }

  // 箱の中に入れたなら、箱の伸びを外へ順に伝える
  propagateUp(work, spot.container, before);
}

/** 空の階層に入れるときの左端（グループなら枠の内側） */
function startOf(work: Work, frame: NodeRect | null): number {
  return frame ? frame.left + GROUP_PADDING : work.layout.startX;
}

function topOf(frame: NodeRect | null): number {
  return frame ? frame.top + GROUP_PADDING + GROUP_TITLE_HEIGHT : 0;
}

/**
 * `unit` を今の場所から抜いたものとして詰める。位置は書き換えない（抜くものは
 * 呼ぶ側で消すか、別の場所へ入れる）。列にほかのものが残れば動かさない
 */
export function removeUnit(work: Work, unit: Unit): void {
  const first = unit.ids[0];
  if (first === undefined) return;
  const container: Container =
    unit.group === null ? (work.membership.get(first) ?? null) : parentOf(work, unit.group);
  const removing = new Set(unit.ids);
  const before = framesUp(work, container, new Set());

  const items = itemsOf(work, container, new Set());
  const columns = columnsOf(items);
  const at = columns.findIndex((column) =>
    column.some((item) => item.ids.some((id) => removing.has(id))),
  );
  const column = columns[at];
  if (column && column.every((item) => item.ids.every((id) => removing.has(id)))) {
    // 列が空になる。後ろに読む列を、空いた列の左端まで詰める
    const rest = columns.filter((_, index) => index !== at);
    const behind = columns.slice(at + 1);
    const want = behind.length > 0 ? Math.min(...behind.map(columnLeft)) - columnLeft(column) : 0;
    closeColumns(work, { columns: rest, behind }, want, null);
  } else if (column) {
    // 列が残る。抜けたものが列の左端なら、残りを元の左端へ寄せる（ゆとりの分以内）。
    // 左端が右へずれると、すぐ後ろの列が同じ列として読まれ、並びが入れ替わる
    const remaining = column.filter((item) => !item.ids.some((id) => removing.has(id)));
    const dx = columnLeft(column) - columnLeft(remaining);
    if (dx < 0) translate(work, idsOf(remaining), dx, 0);
  }

  if (container === null || !before.get(container)) return;
  // 箱から抜けた。残りで枠が縮めば外へ順に詰める。空になれば箱ごと抜けた扱い
  const detach = (): void => {
    if (unit.group === null) for (const id of unit.ids) work.membership.delete(id);
    else work.parents.delete(unit.group);
  };
  const attach = (): void => {
    if (unit.group === null) for (const id of unit.ids) work.membership.set(id, container);
    else work.parents.set(unit.group, container);
  };
  detach();
  if (groupFrame(work, container, new Set())) {
    propagateUp(work, container, before);
    return;
  }
  // 箱ごと空いた: 1 つ外の列から箱を抜いて詰める（その外も同じく）
  attach();
  removeUnit(work, { ids: unit.ids, group: container });
  detach();
}
