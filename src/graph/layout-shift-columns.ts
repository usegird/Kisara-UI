import { lineage } from '@/graph/groups';
import { COLUMN_TOLERANCE } from '@/graph/layout-read';
import {
  columnLeft,
  columnsOf,
  groupFrame,
  idsOf,
  itemsOf,
  overlapsVertically,
  parentOf,
  subtreeIds,
  translate,
  type Container,
  type Item,
  type Work,
} from '@/graph/layout-shift-work';
import type { NodeRect } from '@/graph/node-box';
import type { NodeId } from '@/graph/types';

// ─────────────────────────────
// 箱の伸び縮みを外へ伝える。列を横へずらし、空いた列を詰め、下を押す。
// ─────────────────────────────

/** 並びで続く列の左端の最小の差（読み戻しのゆとりの 2 倍。layout-place と同じ） */
const ORDER_STEP = COLUMN_TOLERANCE * 2;

/**
 * `container` の中で起きた伸び縮みを外へ順に伝える。`before` は `framesUp` で測った、変わる前の枠。
 * 枠が伸び縮みしたら、1 つ外の階層で `propagate` し、その外の枠も同じく見る
 */
export function propagateUp(
  work: Work,
  container: Container,
  before: ReadonlyMap<number, NodeRect | null>,
): void {
  for (const group of lineage(container ?? undefined, work.parents)) {
    const was = before.get(group);
    const now = groupFrame(work, group, new Set());
    if (!was || !now) return;
    propagate(work, parentOf(work, group), subtreeIds(work, group, new Set()), {
      before: was,
      after: now,
    });
  }
}

/**
 * 箱（ノードかグループ）が `before` から `after` へ伸び縮みした。外の階層で、
 * 右が伸びたら後ろに読むものを送り、下が伸びたら下で横の重なるものを送る。縮んだら左へ詰める
 */
export function propagate(
  work: Work,
  container: Container,
  self: readonly NodeId[],
  { before, after }: { readonly before: NodeRect; readonly after: NodeRect },
): void {
  const skip = new Set(self);
  const others = itemsOf(work, container, skip);
  const columns = columnsOf(others);
  const growRight = after.right - before.right;
  const growDown = after.bottom - before.bottom;
  // 後ろに読む列（左端が箱の左端より右）
  const behind = columns.filter((column) => columnLeft(column) > before.left + COLUMN_TOLERANCE);
  if (growRight > 0) {
    shiftColumns(work, behind, growRight);
  } else if (growRight < 0) {
    closeColumns(work, { columns, behind }, -growRight, after);
  }
  if (growDown > 0) pushBelow(work, others, before, growDown);
}

/** 列をまとめて右へ送る（グループの箱はメンバーごと） */
export function shiftColumns(work: Work, columns: readonly Item[][], dx: number): void {
  for (const column of columns) translate(work, idsOf(column), dx, 0);
}

/**
 * 下で横の重なるものを送る。送ったものの下で横の重なるものも続けて送る（まとめて同じだけ）。
 * 下にあるかは箱の中心で見る
 */
export function pushBelow(work: Work, items: readonly Item[], from: NodeRect, dy: number): void {
  const pushed = new Set<Item>();
  const frontier: NodeRect[] = [from];
  while (frontier.length > 0) {
    const top = frontier.pop();
    if (!top) break;
    for (const item of items) {
      if (pushed.has(item)) continue;
      // 中心が下端より下なら下にあるとみなす（手で並べたものは枠に少し食い込んでいることがある）
      const below = (item.rect.top + item.rect.bottom) / 2 > top.bottom;
      const sideways = item.rect.left < top.right && top.left < item.rect.right;
      if (!below || !sideways) continue;
      pushed.add(item);
      frontier.push(item.rect);
    }
  }
  for (const item of pushed) translate(work, item.ids, 0, dy);
}

/**
 * 後ろに読む列を左へ詰める。前の列との左端の差 `ORDER_STEP` と、高さの重なる箱の右の隙間を割らない
 * 分だけ（`want` を上限に）。`left` は詰める基準の箱（その右端の隙間も割らない）
 */
export function closeColumns(
  work: Work,
  { columns, behind }: { readonly columns: readonly Item[][]; readonly behind: readonly Item[][] },
  want: number,
  left: NodeRect | null,
): void {
  if (behind.length === 0 || want <= 0) return;
  const moving = new Set(behind.flat());
  const staying = columns.flat().filter((item) => !moving.has(item));
  const stayingLefts = staying.map((item) => item.readLeft);
  const firstBehind = Math.min(...behind.map(columnLeft));
  let room = want;
  const lastStayLeft = stayingLefts.length > 0 ? Math.max(...stayingLefts) : null;
  if (lastStayLeft !== null) room = Math.min(room, firstBehind - (lastStayLeft + ORDER_STEP));
  const blockers = left ? [...staying.map((item) => item.rect), left] : staying.map((i) => i.rect);
  for (const item of moving) {
    for (const block of blockers) {
      if (!overlapsVertically(item.rect, block) || block.right > item.rect.left) continue;
      room = Math.min(room, item.rect.left - block.right - work.layout.gap);
    }
  }
  if (room <= 0) return;
  for (const column of behind) translate(work, idsOf(column), -room, 0);
}
