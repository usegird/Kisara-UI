import { useCallback, useRef, useSyncExternalStore } from 'react';

import { useDragFrom, type DragHandlers } from '@/hooks/ui/use-drag-from';
import {
  DIALOG_MIN,
  moveDialogRect,
  RESIZE_EDGES,
  resizeDialogRect,
  viewDialogRect,
  type DialogMinSize,
  type DialogRect,
  type ResizeEdge,
  type Viewport,
} from '@/lib/dialog-rect';

export interface DialogPlacement {
  readonly placed: boolean;
  readonly popupRef: (element: HTMLDivElement | null) => void;
  readonly style: React.CSSProperties | undefined;
  readonly move: DragHandlers;
  readonly resize: DragHandlers;
  readonly measure: () => DialogRect | null;
}

function viewport(): Viewport {
  return { width: globalThis.innerWidth, height: globalThis.innerHeight };
}

function subscribeResize(onChange: () => void): () => void {
  globalThis.addEventListener('resize', onChange);
  return () => globalThis.removeEventListener('resize', onChange);
}
const viewportKey = (): string =>
  `${String(globalThis.innerWidth)}x${String(globalThis.innerHeight)}`;

export function useDialogPlacement(
  rect: DialogRect | null,
  setRect: (rect: DialogRect) => void,
  min: DialogMinSize = DIALOG_MIN,
): DialogPlacement {
  const panel = useRef<HTMLDivElement | null>(null);
  useSyncExternalStore(subscribeResize, viewportKey, () => '');
  const shown = rect === null ? null : viewDialogRect(rect, viewport(), min);

  const measure = (): DialogRect | null => {
    const box = panel.current?.getBoundingClientRect();
    return box ? { left: box.left, top: box.top, width: box.width, height: box.height } : null;
  };
  const grabRect = (event: React.PointerEvent<HTMLElement>): DialogRect | null => {
    if (event.target instanceof Element && event.target.closest('button, input, select, label')) {
      return null;
    }
    return measure();
  };
  const move = useDragFrom(grabRect, (from: DialogRect, dx: number, dy: number) =>
    setRect(moveDialogRect(from, { dx, dy }, viewport(), min)),
  );
  const grabEdge = (
    event: React.PointerEvent<HTMLElement>,
  ): { readonly rect: DialogRect; readonly edge: ResizeEdge } | null => {
    const edge = RESIZE_EDGES.find((name) => name === event.currentTarget.dataset.edge);
    const rect = grabRect(event);
    return edge === undefined || rect === null ? null : { rect, edge };
  };
  const resize = useDragFrom(
    grabEdge,
    (from: { readonly rect: DialogRect; readonly edge: ResizeEdge }, dx: number, dy: number) =>
      setRect(resizeDialogRect(from.rect, { dx, dy, edge: from.edge }, viewport(), min)),
  );
  const popupRef = useCallback((element: HTMLDivElement | null) => {
    panel.current = element;
  }, []);

  return {
    placed: rect !== null,
    popupRef,
    style:
      shown === null
        ? undefined
        : { left: shown.left, top: shown.top, width: shown.width, height: shown.height },
    move,
    resize,
    measure,
  };
}
