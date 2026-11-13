import type { ClientRect, CollisionDetection, UniqueIdentifier } from '@dnd-kit/core';
import { useCallback, useRef } from 'react';

import {
  collisionDetection,
  homesOf,
  pointerInView,
  type Homes,
} from '@/components/comfy/flow/flow-dnd';
import type { Point } from '@/lib/point';

// ─────────────────────────────
// 並べ替えの当たり判定。落とす先は掴んだときの並びの位置で決めるので、その位置と受け口を留める。
// ─────────────────────────────

// dnd-kit の型が書き換えられる Map なので合わせる（中身は書き換えない）
type Rects = Map<UniqueIdentifier, ClientRect>;

/** 並べ替えの位置（掴んだときのもの）。見つからなければ dnd-kit が今持っているもの */
export type RectOf = (id: UniqueIdentifier, fallback: ClientRect | null) => ClientRect | null;

type CollisionArgs = Parameters<CollisionDetection>[0];

/** 列の見えている範囲 */
function viewOf(scroller: HTMLElement | null): { top: number; bottom: number } | null {
  return scroller?.getBoundingClientRect() ?? null;
}

/** 掴んでいる間の当たり判定と、その控えを読む・片付ける手続き。どれも作り直さない */
export interface SortCollision {
  readonly collisionDetection: CollisionDetection;
  readonly rectOf: RectOf;
  readonly isSorting: () => boolean;
  /** 最後の当たり判定に渡された指の位置（列の外なら列の見えている端） */
  readonly pointerNow: () => Point | null;
  /** 掴み始め。`scroller` は並べ替えで掴んだカードの列 */
  readonly begin: (sort: boolean, scroller: HTMLElement | null) => void;
  /** 掴み終わり。留めた位置を捨てる */
  readonly end: () => void;
}

/** 掴んだときの位置で判定する当たり判定を作る */
export function useSortCollision(): SortCollision {
  // compiler はこのフックを飛ばす（`??=` を扱えない）。判定は dnd-kit に渡すので、手で固定する

  // 掴んだときの位置（並べ替えの間だけ。リンクのドラッグは今の位置で判定する）
  const frozen = useRef<Rects | null>(null);
  // 掴んだときの受け口（置き直すと掴んだものの受け口が変わるので、候補選びは留めた方で見る）
  const homes = useRef<Homes | null>(null);
  const sorting = useRef(false);
  // 並べ替えで掴んだカードの列
  const scrollerRef = useRef<HTMLElement | null>(null);
  // 最後の当たり判定に渡された指の位置（前か後ろかも同じ位置で決める）
  const pointer = useRef<CollisionArgs['pointerCoordinates']>(null);
  // 掴んだ直後はまだ測れていない（空）ので、最初に測れた位置を留める
  const freeze = useCallback((rects: Rects): Rects => {
    if (!sorting.current) return rects;
    if (frozen.current === null && rects.size > 0) frozen.current = rects;
    return frozen.current ?? rects;
  }, []);
  const rectOf = useCallback<RectOf>((id, fallback) => frozen.current?.get(id) ?? fallback, []);
  const frozenCollision = useCallback<CollisionDetection>(
    (args) => {
      if (sorting.current) homes.current ??= homesOf(args.droppableContainers);
      if (!sorting.current) return collisionDetection(args, homes.current);
      pointer.current = args.pointerCoordinates;
      return collisionDetection(
        {
          ...args,
          droppableRects: freeze(args.droppableRects),
          pointerCoordinates: pointerInView(args.pointerCoordinates, viewOf(scrollerRef.current)),
        },
        homes.current,
      );
    },
    [freeze],
  );
  const isSorting = useCallback(() => sorting.current, []);
  const pointerNow = useCallback(
    () => pointerInView(pointer.current, viewOf(scrollerRef.current)),
    [],
  );
  const begin = useCallback((sort: boolean, scroller: HTMLElement | null): void => {
    frozen.current = null;
    homes.current = null;
    sorting.current = sort;
    scrollerRef.current = scroller;
  }, []);
  const end = useCallback((): void => {
    pointer.current = null;
    frozen.current = null;
    homes.current = null;
    sorting.current = false;
    scrollerRef.current = null;
  }, []);

  return { collisionDetection: frozenCollision, rectOf, isSorting, pointerNow, begin, end };
}
