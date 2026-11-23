import type { ClientRect, CollisionDetection, UniqueIdentifier } from '@dnd-kit/core';
import { useCallback, useRef } from 'react';

import {
  collisionDetection,
  homesOf,
  pointerInView,
  type Homes,
} from '@/components/comfy/flow/flow-dnd';
import type { Point } from '@/lib/point';

type Rects = Map<UniqueIdentifier, ClientRect>;

export type RectOf = (id: UniqueIdentifier, fallback: ClientRect | null) => ClientRect | null;

type CollisionArgs = Parameters<CollisionDetection>[0];

function viewOf(scroller: HTMLElement | null): { top: number; bottom: number } | null {
  return scroller?.getBoundingClientRect() ?? null;
}

export interface SortCollision {
  readonly collisionDetection: CollisionDetection;
  readonly rectOf: RectOf;
  readonly isSorting: () => boolean;
  readonly pointerNow: () => Point | null;
  readonly begin: (sort: boolean, scroller: HTMLElement | null) => void;
  readonly end: () => void;
}

export function useSortCollision(): SortCollision {
  const frozen = useRef<Rects | null>(null);
  const homes = useRef<Homes | null>(null);
  const sorting = useRef(false);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const pointer = useRef<CollisionArgs['pointerCoordinates']>(null);
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
