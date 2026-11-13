import { useDndMonitor, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core';
import { useEffect } from 'react';

// ─────────────────────────────
// 掴んでいる位置（画面座標）。掴んでいる間の線と、端での送りが同じ値を見る。
// ─────────────────────────────

// ポインタの位置は実際のポインタから読む。dnd-kit が渡す移動量（`delta`）は、落とし先の上に入ると
// その落とし先を包む列の送り量まで足した値になる（掴んだ元ではなく落とし先の祖先を数えるため）。
// そのままだとカードの列を送った分だけずれ、線が上へ飛んだり、端の送りが止まったりする。
let tracked: { x: number; y: number } | null = null;

function onPointerMove(event: PointerEvent): void {
  tracked = { x: event.clientX, y: event.clientY };
}

/**
 * 掴んでいる間だけポインタの位置を控える。DndContext の中で **1 か所だけ**呼ぶ
 * （DragEdgeScroll）。dnd-kit より先に控えるよう、捕捉の段で受ける
 */
export function useTrackedDragPointer(): void {
  const stop = (): void => {
    document.removeEventListener('pointermove', onPointerMove, true);
    tracked = null;
  };
  useDndMonitor({
    onDragStart: () => {
      tracked = null;
      document.addEventListener('pointermove', onPointerMove, true);
    },
    onDragEnd: stop,
    onDragCancel: stop,
  });
  useEffect(() => stop, []);
}

/**
 * 掴んでいる位置を返す。ポインタで掴んでいれば控えた位置、キーボードで動かしているときは
 * 動かしたものの左端の中ほど
 */
export function dragPointer(
  event: DragStartEvent | DragMoveEvent,
): { readonly x: number; readonly y: number } | null {
  const activator = event.activatorEvent;
  if (activator instanceof MouseEvent) {
    // 動き始める前は、掴んだところ
    return tracked ?? { x: activator.clientX, y: activator.clientY };
  }

  const rect = event.active.rect.current.translated ?? event.active.rect.current.initial;
  return rect ? { x: rect.left, y: rect.top + rect.height / 2 } : null;
}
