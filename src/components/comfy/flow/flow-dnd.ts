import {
  closestCenter,
  defaultKeyboardCoordinateGetter,
  pointerWithin,
  type Collision,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';

import type { SortLists } from '@/components/comfy/flow/card-outline';
import { isInputDrop } from '@/components/comfy/flow/link-dnd';
import { splitInnerGroupKey } from '@/graph/subgraph-display';
import { levelOfId } from '@/graph/subgraph-level';
import type { NodeId } from '@/graph/types';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// フロー画面の dnd-kit 設定。1 つの DndContext で並べ替えとリンクの 2 種類のドラッグを受けるので、
// 掴んだ id の形で振り分ける（アプリ入力の並べ替えは列が自分の受け口で受ける）。
// ─────────────────────────────

/** 親の枠を辿る段数の上限（親の鍵が巡回していても止まるように） */
const MAX_FRAME_DEPTH = 64;

// 掴んだ id の形: カードの並べ替え（開いた subgraph の枠はインスタンスのカード）は数値、
// グループの並べ替えは `group:<鍵>`、出力 → パラメータはそれ以外の文字列。
// 並べ替えの受け口は枠ごと。外のカードとグループはカードの列の受け口、グループの中のカードと
// 子のグループは枠ごとの受け口に入り、掴んだものは指している枠（重なれば内側）の受け口へ移れる。

/** 並べ替えの受け口の id（dnd-kit の sortable が data に載せる）。並べ替えでなければ null */
function sortableContainerOf(data: unknown): unknown {
  if (!isRecord(data) || !isRecord(data.sortable)) return null;
  return data.sortable.containerId ?? null;
}

/** 枠を並べ替えるときの id（カードの数値 id・リンクの id とぶつからない形） */
export function groupSortId(key: string): string {
  return `group:${key}`;
}

/** 並べ替えの id からグループの鍵。グループでなければ null */
export function groupKeyOfSortId(id: unknown): string | null {
  return typeof id === 'string' && id.startsWith('group:') ? id.slice('group:'.length) : null;
}

/** 枠の中の並べ替えの受け口 */
export function groupContainerId(key: string): string {
  return `members:${key}`;
}

/** 開いた subgraph の枠の中の並べ替えの受け口 */
export function subgraphContainerId(instanceId: NodeId): string {
  return `subgraph:${String(instanceId)}`;
}

/**
 * 並べ替えの id が属する階層（開いた subgraph のインスタンス。外なら null）。
 * 中のカードは付け替えた id、中のグループは `<インスタンス>/<鍵>` の鍵を持つ。
 * 落とせる先は同じ階層の中だけなので、当たり判定の候補をこれで絞る
 */
export function sortLevelOf(id: unknown): NodeId | null {
  if (typeof id === 'number') return levelOfId(id);
  const group = groupKeyOfSortId(id);
  return group === null ? null : (splitInnerGroupKey(group)?.instanceId ?? null);
}

/** 枠の上のタブの帯の高さ。ここは枠の外とみなす（落としてもグループに入らない） */
export const GROUP_TAB_HEIGHT = 22;

/** 受け口の id から、その枠のグループの鍵。カードの列の受け口なら null */
export function groupKeyOfContainer(container: unknown): string | null {
  return typeof container === 'string' && container.startsWith('members:')
    ? container.slice('members:'.length)
    : null;
}

/** 並べ替えの受け口と、その中の位置（dnd-kit の sortable が data に載せる）。無ければ null */
export function sortableSlot(
  data: unknown,
): { readonly container: unknown; readonly index: number } | null {
  if (!isRecord(data) || !isRecord(data.sortable)) return null;
  const { containerId, index } = data.sortable;
  return typeof index === 'number' ? { container: containerId, index } : null;
}

type KeyboardArgs = Parameters<KeyboardCoordinateGetter>[1];

/** 並べ替えの受け口の並び（dnd-kit の sortable が data に載せる。置き直す前の並び） */
function sortableItems(data: unknown): readonly unknown[] {
  if (!isRecord(data) || !isRecord(data.sortable)) return [];
  const { items } = data.sortable;
  return Array.isArray(items) ? items : [];
}

/**
 * 受け口から読んだ置き直す前の並び（キーボードの落とす先を数える。card-outline の `keyboardSlots`）。
 * 外の列は枠が載っている受け口（枠が無ければ掴んだものの受け口）
 */
export function sortListsOf(context: KeyboardArgs['context']): SortLists {
  // 同じ階層のものだけを数える（開いた subgraph の中と外は行き来しない）
  const level = sortLevelOf(context.active?.id);
  const entries = context.droppableContainers
    .getEnabled()
    .filter((entry) => sortLevelOf(entry.id) === level);
  const keys = (data: unknown): SortLists['outer'] =>
    sortableItems(data).flatMap((item): SortLists['outer'][number][] => {
      if (typeof item === 'number') return [item];
      const group = groupKeyOfSortId(item);
      return group === null ? [] : [{ group }];
    });
  // 外の列は、枠の受け口でない並べ替えの受け口
  const outerOf = entries.find((entry) => {
    const container = sortableContainerOf(entry.data.current);
    return container !== null && groupKeyOfContainer(container) === null;
  });
  const members = new Map<string, SortLists['outer']>();
  for (const entry of entries) {
    const key = groupKeyOfContainer(sortableContainerOf(entry.data.current));
    if (key === null || members.has(key)) continue;
    members.set(key, keys(entry.data.current));
  }
  return { outer: keys(outerOf?.data.current), members };
}

/** キーボードでの移動先（リンク）。既定の 25px 刻み。並べ替えは useFlowDnd が並びで数える */
export const coordinateGetter: KeyboardCoordinateGetter = defaultKeyboardCoordinateGetter;

type CollisionArgs = Parameters<CollisionDetection>[0];
type Entry = CollisionArgs['droppableContainers'][number];

/** 並べ替えの各要素が掴んだときに居た受け口（id → 受け口の id） */
export type Homes = ReadonlyMap<UniqueIdentifier, unknown>;

/**
 * 掴んだときの受け口を留める（useFlowDnd が掴んだ直後に 1 回）。受け口は描いている場所で決まるので、
 * 掴んだものを置き直すと、その受け口も変わる。今の受け口で候補を選ぶと、置き直しが候補を変え、
 * 候補が置き直しを変える行き来が止まらなくなる（列の横の外を指して、縦に一番近いものを選ぶとき）
 */
export function homesOf(containers: CollisionArgs['droppableContainers']): Homes {
  const homes = new Map<UniqueIdentifier, unknown>();
  for (const entry of containers) {
    const container = sortableContainerOf(entry.data.current);
    if (container !== null) homes.set(entry.id, container);
  }
  return homes;
}

function hit(entry: Entry): Collision[] {
  return [{ id: entry.id, data: { droppableContainer: entry, value: 0 } }];
}

/**
 * 並べ替えでは、どの受け口の並びもずらさない。掴んだものは落とす先へ実際に置き直して
 * 見せる（useFlowDnd の `preview`）ので、ずらすと二重に動く
 */
export const keepInPlace = (): null => null;

/**
 * 落とした後に、並びの位置が変わったものを元の位置から滑らせない（useSortable の
 * `animateLayoutChanges`）。置き直しで既に落とす先に見せているので動きは出ず、
 * 位置を測るための強制レイアウトと 2 回の描き直しだけが残る
 */
export const noLayoutAnimation = (): boolean => false;

/**
 * 並べ替えの当たり判定。指している所（キーボードでは掴んだものの中央）で決める。
 *   1. 自分の元の場所なら自分（置き直しをやめて元へ戻す）
 *   2. グループの枠の中（タブの帯を除く）なら、その枠の直下のもの。枠が重なれば内側の枠。
 *      グループを掴んでいれば、自分の枠とその中の枠は数えない
 *   3. それ以外はカードの列のもの（外のカードとグループ）
 * 指しているものが無い隙間では、縦に一番近いもの。位置も受け口も掴んだときの並びで見る
 * （useFlowDnd が留めた位置が `droppableRects` に、受け口が `homes` に入ってくる）
 */
function sortCollision(args: CollisionArgs, homes: Homes | null): Collision[] {
  const { active, droppableRects, droppableContainers } = args;
  const containerOf = (entry: Entry): unknown =>
    homes?.get(entry.id) ?? sortableContainerOf(entry.data.current);
  const own = homes?.get(active.id) ?? sortableContainerOf(active.data.current);
  // 落とせる先は同じ階層の中だけ（開いた subgraph の中と外は行き来しない）
  const level = sortLevelOf(active.id);
  const sortables = droppableContainers.filter(
    (entry) => containerOf(entry) !== null && sortLevelOf(entry.id) === level,
  );
  const { x, y } = pointOf(args);
  const inside = (entry: Entry, band = 0): boolean => {
    const rect = droppableRects.get(entry.id);
    if (!rect) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top + band && y <= rect.bottom;
  };

  const self = sortables.find((entry) => entry.id === active.id);
  if (self && inside(self)) return hit(self);

  const frames = sortables.filter((entry) => groupKeyOfSortId(entry.id) !== null);
  // 枠の親（枠が載っている受け口の枠）。外の列なら null
  const parentKey = (key: string): string | null => {
    const entry = frames.find((candidate) => candidate.id === groupSortId(key));
    return entry ? groupKeyOfContainer(containerOf(entry)) : null;
  };
  const activeKey = groupKeyOfSortId(active.id);
  /** 掴んだグループの枠か、その中の枠 */
  const ownFrame = (key: string): boolean => {
    for (
      let at: string | null = key, steps = 0;
      at !== null && steps < MAX_FRAME_DEPTH;
      steps += 1
    ) {
      if (at === activeKey) return true;
      at = parentKey(at);
    }
    return false;
  };
  const area = (entry: Entry): number => {
    const rect = droppableRects.get(entry.id);
    return rect ? rect.width * rect.height : Number.POSITIVE_INFINITY;
  };
  // 指している枠のうち内側（いちばん小さいもの）
  const frame = frames
    .filter((entry) => !ownFrame(groupKeyOfSortId(entry.id) ?? ''))
    .filter((entry) => inside(entry, GROUP_TAB_HEIGHT))
    .reduce<Entry | undefined>(
      (best, entry) => (best && area(best) <= area(entry) ? best : entry),
      undefined,
    );
  const frameKey = frame ? groupKeyOfSortId(frame.id) : null;
  // カードの列の受け口は、枠の受け口でない受け口（無ければ掴んだものの受け口）
  const outerEntry = sortables.find((entry) => groupKeyOfContainer(containerOf(entry)) === null);
  const outer = outerEntry ? containerOf(outerEntry) : own;
  const container = frameKey === null ? outer : groupContainerId(frameKey);
  const candidates = sortables.filter((entry) => containerOf(entry) === container);

  const pointed = candidates.find((entry) => entry.id !== active.id && inside(entry));
  if (pointed) return hit(pointed);
  const nearest = nearestEntry(candidates, droppableRects, y);
  // 枠の中にカードが 1 枚も無ければ（掴んだ唯一のメンバーが抜けた）、枠そのもの
  if (nearest === undefined) return frame ? hit(frame) : [];
  return hit(nearest);
}

/** 指している所。カーソルが無ければ（キーボード）掴んだものの中央 */
function pointOf({ pointerCoordinates, collisionRect }: CollisionArgs): {
  readonly x: number;
  readonly y: number;
} {
  return {
    x: pointerCoordinates?.x ?? collisionRect.left + collisionRect.width / 2,
    y: pointerCoordinates?.y ?? collisionRect.top + collisionRect.height / 2,
  };
}

/** 縦の中ほどが `y` にいちばん近いもの。位置が分からないものは数えない */
function nearestEntry(
  candidates: readonly Entry[],
  rects: CollisionArgs['droppableRects'],
  y: number,
): Entry | undefined {
  let nearest: { readonly entry: Entry; readonly distance: number } | null = null;
  for (const entry of candidates) {
    const rect = rects.get(entry.id);
    if (!rect) continue;
    const distance = Math.abs(rect.top + rect.height / 2 - y);
    if (nearest === null || distance < nearest.distance) nearest = { entry, distance };
  }
  return nearest?.entry;
}

/**
 * 当たり判定。
 *   ・並べ替え（カード・グループ）: `sortCollision`。候補を並べ替えの受け口に絞らないと、
 *     カードの中のパラメータ行（リンク用の droppable）を拾う
 *   ・リンク（文字列 id）: **パラメータ行だけ**を候補にして、**カーソルが載っている行**を選ぶ。
 *     候補を絞らないと、行を包んでいるカード（並べ替え用の droppable）が勝ってしまい、
 *     掴んだチップの矩形で判定されて見た目のカーソルとドロップ先がずれる。
 *     **近いものを拾うフォールバックは置かない**（行に届いていないのに反応してしまう）。
 *     カーソルが無いキーボード操作のときだけ、近いものを選ぶ
 *
 * `homes` は並べ替えで掴んだときの受け口（`homesOf`）。無ければ今の受け口で見る
 */
export function collisionDetection(args: CollisionArgs, homes: Homes | null = null): Collision[] {
  if (sortableContainerOf(args.active.data.current) !== null) return sortCollision(args, homes);

  const rows = args.droppableContainers.filter((container) => isInputDrop(container.data.current));
  const candidates = { ...args, droppableContainers: rows };

  return args.pointerCoordinates === null ? closestCenter(candidates) : pointerWithin(candidates);
}

/**
 * 並べ替えの当たり判定に使う指の位置。**列の外（上のヘッダなど）を指しているときは、列の見えて
 * いる端を指しているとみなす**。列の外にも、送って隠れたカードの位置がある（dnd-kit の位置は
 * 送った量を足して今の画面の位置を返す）ので、そのままだと見えていないカードへ落ちる
 */
export function pointerInView(
  pointer: { readonly x: number; readonly y: number } | null,
  view: { readonly top: number; readonly bottom: number } | null,
): { x: number; y: number } | null {
  if (!pointer || !view) return pointer;
  return { x: pointer.x, y: Math.min(view.bottom, Math.max(view.top, pointer.y)) };
}
