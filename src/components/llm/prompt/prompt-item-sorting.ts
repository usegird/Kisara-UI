import {
  closestCenter,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, type SortingStrategy } from '@dnd-kit/sortable';

import type { DropSlot } from '@/chat/prompt';
import type { BandJoin } from '@/components/llm/prompt/prompt-card-style';

// ─────────────────────────────
// プロンプトの項目の並べ替えの、落とす位置と落としたあとの並び（入れられる所の決まりは dropSlots）。
// 運んでいる間の見せ方と落としたときに渡す前後の行は、同じ `droppedOrder` から作る（別々に決めない）。
// ─────────────────────────────

/** 行の間（px）を測れないときの値（一覧の gap-1） */
const ROW_GAP = 4;

/**
 * 落とす位置。この位置の行（運ぶ行を含む並びの位置）の手前に入る。メッセージを指したときと、
 * 下へ運んだときは指した行の後ろ
 */
function insertionIndex(
  kinds: readonly DropSlot[],
  activeIndex: number,
  overIndex: number,
): number {
  return kinds[overIndex] === 'input' || activeIndex < overIndex ? overIndex + 1 : overIndex;
}

/**
 * 並んだ 2 行の間に項目を入れられるか（`insertionIndex` で届く所か）。前の行を下へ運んで指すと
 * その後ろに、次の行を上へ運んで指すとその手前に入る。会話履歴の帯は指せず、メッセージを指すと
 * すぐ下に入るので、帯の後ろとメッセージの手前には入らない
 */
function insertableBetween(prev: DropSlot, next: DropSlot): boolean {
  return prev !== 'fixed' || next === 'before' || next === 'after';
}

/** 一覧の 1 行の、地のつなぎ方を決めるのに使うもの */
interface BandRow {
  readonly kind: DropSlot;
  /** 動かせない行（地を付ける） */
  readonly locked: boolean;
}

/**
 * 動かせない行どうしで、間に項目を入れられない所は地をつなげる。
 * 行ごとに、前の行・次の行とつなげるかを返す
 */
export function bandJoins(rows: readonly BandRow[]): BandJoin[] {
  const joined = (at: number): boolean => {
    const prev = rows[at - 1];
    const next = rows[at];
    if (prev === undefined || next === undefined) return false;
    return prev.locked && next.locked && !insertableBetween(prev.kind, next.kind);
  };
  return rows.map((_, at) => ({ joinUp: joined(at), joinDown: joined(at + 1) }));
}

/** 落としたあとの並び（運ぶ行を `insertionIndex` へ動かした並び） */
export function droppedOrder<T>(
  ids: readonly T[],
  kinds: readonly DropSlot[],
  activeIndex: number,
  overIndex: number,
): T[] {
  const at = insertionIndex(kinds, activeIndex, overIndex);
  const active = ids[activeIndex];
  if (active === undefined) return [...ids];
  const rest = ids.filter((_, index) => index !== activeIndex);
  const target = at > activeIndex ? at - 1 : at;
  return [...rest.slice(0, target), active, ...rest.slice(target)];
}

/**
 * 運んでいる間、どの行も落としたあとの並びの位置へずらす（元の位置は詰まり、入れられない行も並びに
 * 合わせてずれる）。行の高さは行ごとに測った値を使い、行の上の間は行ごとに今の並びの間を保つ
 * （地をつなげた動かせない行は間が 0。その手前には項目が入らないので、つながったまま動く）
 */
export function droppedOrderStrategy(kinds: readonly DropSlot[]): SortingStrategy {
  return ({ activeIndex, overIndex, index, rects }) => {
    const first = rects[0];
    const current = rects[index];
    if (first === undefined || current === undefined || overIndex < 0) return null;
    if (activeIndex === overIndex) return null;
    // 行ごとの、前の行との間。先頭の行は測れないので、つなげていない行の間（いちばん広い間）を使う
    const measured = rects.map((rect, at) => {
      const prev = rects[at - 1];
      return prev === undefined ? 0 : rect.top - (prev.top + prev.height);
    });
    const rowGap = Math.max(ROW_GAP, ...measured);
    const gaps = measured.map((gap, at) => (at === 0 ? rowGap : gap));
    const indices = rects.map((_, at) => at);
    let top = first.top;
    let placed = false;
    for (const at of droppedOrder(indices, kinds, activeIndex, overIndex)) {
      if (placed) top += gaps[at] ?? 0;
      placed = true;
      if (at === index) {
        const y = top - current.top;
        return y === 0 ? null : { x: 0, y, scaleX: 1, scaleY: 1 };
      }
      top += rects[at]?.height ?? 0;
    }
    return null;
  };
}

/**
 * 指せる行だけで当たりを決める（入れられない行は測るが、指しても反応しない）。行の大きさは
 * 落とし先にした行しか測られないので、入れられない行も落とし先のまま置き、ここで外す
 */
export function slotCollision(allowed: (id: UniqueIdentifier) => boolean): CollisionDetection {
  return (args) =>
    closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) => allowed(container.id)),
    });
}

/**
 * キーボードの上下で、指せる行だけを順に渡る（入れられない行は飛ばす）。左右などはそのまま
 * dnd-kit の並べ替えの移り方に任せる
 */
export function slotKeyboardCoordinates(
  allowed: (id: UniqueIdentifier) => boolean,
): KeyboardCoordinateGetter {
  return (event, args) => {
    const down = event.code === 'ArrowDown';
    if (!down && event.code !== 'ArrowUp') return sortableKeyboardCoordinates(event, args);
    event.preventDefault();
    const { active, collisionRect, droppableRects, droppableContainers, over } = args.context;
    if (active === null || collisionRect === null) return undefined;
    const candidates = droppableContainers.getEnabled().flatMap((entry) => {
      const rect = droppableRects.get(entry.id);
      if (entry.disabled || !allowed(entry.id) || rect === undefined) return [];
      const ahead = down ? rect.top > collisionRect.top : rect.top < collisionRect.top;
      return ahead ? [{ id: entry.id, rect }] : [];
    });
    candidates.sort((a, b) => (down ? a.rect.top - b.rect.top : b.rect.top - a.rect.top));
    const target = candidates[0]?.id === over?.id ? candidates[1] : candidates[0];
    if (target === undefined) return undefined;
    // 運ぶ行より下へ移るときは、指す行の下端に揃える（dnd-kit の並べ替えと同じ）
    const origin = droppableRects.get(active.id);
    const after = origin !== undefined && target.rect.top > origin.top;
    return {
      x: target.rect.left,
      y: after ? target.rect.top + target.rect.height - collisionRect.height : target.rect.top,
    };
  };
}
