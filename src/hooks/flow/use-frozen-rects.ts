import {
  closestCenter,
  type ClientRect,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useMemo, useRef } from 'react';

type Rects = Map<UniqueIdentifier, ClientRect>;

export function useFrozenRects(): {
  readonly collisionDetection: CollisionDetection;
  readonly keyboardOptions: { readonly coordinateGetter: KeyboardCoordinateGetter };
  readonly release: () => void;
} {
  const frozen = useRef<Rects | null>(null);
  const freeze = useCallback((rects: Rects): Rects => {
    if (frozen.current === null && rects.size > 0) frozen.current = rects;
    return frozen.current ?? rects;
  }, []);
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => closestCenter({ ...args, droppableRects: freeze(args.droppableRects) }),
    [freeze],
  );
  const keyboardOptions = useMemo(() => {
    const coordinateGetter: KeyboardCoordinateGetter = (event, args) =>
      sortableKeyboardCoordinates(event, {
        ...args,
        context: { ...args.context, droppableRects: freeze(args.context.droppableRects) },
      });
    return { coordinateGetter };
  }, [freeze]);
  const release = (): void => {
    frozen.current = null;
  };
  return { collisionDetection, keyboardOptions, release };
}
