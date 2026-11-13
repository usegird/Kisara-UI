import {
  closestCenter,
  type ClientRect,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useMemo, useRef } from 'react';

// ─────────────────────────────
// アプリ入力の並べ替えで、落とす先の判定に使う位置を掴んだときの並びに留める
// ─────────────────────────────

// dnd-kit の型が書き換えられる Map なので合わせる（中身は書き換えない）
type Rects = Map<UniqueIdentifier, ClientRect>;

/**
 * 落とす先の判定に使う位置を、掴んだときの並びに留める。置き直しで項目が動くと dnd-kit は
 * 測り直すが、動いた後の位置で判定すると、別の枠の後ろへ回った項目がすぐ前へ戻り、行ったり来たりする。
 * 掴んだときの位置で判定すれば、落とす先は置き直す前と同じ規則で決まる
 */
export function useFrozenRects(): {
  readonly collisionDetection: CollisionDetection;
  readonly keyboardOptions: { readonly coordinateGetter: KeyboardCoordinateGetter };
  readonly release: () => void;
} {
  const frozen = useRef<Rects | null>(null);
  // 判定と感知の設定は dnd-kit に渡す。作り直すと感知を作り直すので、compiler に任せず手で固定する。
  // 掴んだ直後はまだ測れていない（空）ので、最初に測れた位置を留める
  const freeze = useCallback((rects: Rects): Rects => {
    if (frozen.current === null && rects.size > 0) frozen.current = rects;
    return frozen.current ?? rects;
  }, []);
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => closestCenter({ ...args, droppableRects: freeze(args.droppableRects) }),
    [freeze],
  );
  // 感知の設定は作り直さない（`freeze` は変わらない）
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
