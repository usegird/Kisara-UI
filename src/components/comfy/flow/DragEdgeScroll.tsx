import { useDndContext, useDndMonitor, type DragMoveEvent } from '@dnd-kit/core';
import { useEffect, useRef } from 'react';

import { dragPointer, useTrackedDragPointer } from '@/components/comfy/flow/drag-pointer';
import { isOutputDrag } from '@/components/comfy/flow/link-dnd';
import { edgeScrollStep } from '@/lib/edge-scroll';

// ─────────────────────────────
// 出力チップ・変数ボックスを掴んだまま列の上端・下端へ寄せたときの送り。
// ─────────────────────────────

/** 端での送りの受け取り物 */
export interface DragEdgeScrollProps {
  /** 送る候補の列（アプリ入力・カード・変数）。描画のたびに変わらない関数を渡す */
  readonly columns: () => readonly (HTMLElement | null)[];
}

/**
 * 出力を掴んでいる間、カーソルのある列を送る。dnd-kit の自動スクロールは掴んだ元の祖先しか送らず、
 * 横の位置も見ないので（カードの列の下端へ寄せても変数の列が動く）、その間は dnd-kit 側を止めて
 * （FlowCanvas）ここで送る
 */
export function DragEdgeScroll({ columns }: DragEdgeScrollProps): null {
  const context = useDndContext();
  // 掴んでいる位置の控え（線も同じ値を読む）
  useTrackedDragPointer();
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<number | null>(null);
  // 送りの繰り返しは描画と無関係に回るので、最新の測り直しを参照で持つ
  const measure = useRef(() => {});
  useEffect(() => {
    measure.current = () =>
      context.measureDroppableContainers(
        context.droppableContainers.getEnabled().map((entry) => entry.id),
      );
  }, [context]);

  const stop = (): void => {
    pointer.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  const tick = (): void => {
    frame.current = null;
    const at = pointer.current;
    if (at === null) return;

    const column = columns().find((element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return at.x >= rect.left && at.x <= rect.right;
    });
    const step = column ? edgeScrollStep(column.getBoundingClientRect(), at.y) : 0;
    if (column && step !== 0) {
      const before = column.scrollTop;
      column.scrollBy({ top: step, behavior: 'instant' });
      // 掴んだ元の祖先でない列は dnd-kit が追わないので、送ったら落とし先の位置を測り直す
      if (column.scrollTop !== before) measure.current();
    }

    frame.current = requestAnimationFrame(tick);
  };

  const follow = (event: DragMoveEvent): void => {
    if (!isOutputDrag(event.active.data.current)) return;

    pointer.current = dragPointer(event);
    frame.current ??= requestAnimationFrame(tick);
  };

  useDndMonitor({ onDragMove: follow, onDragEnd: stop, onDragCancel: stop });
  // 掴んだまま画面を離れたときに、送りを残さない
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return null;
}
