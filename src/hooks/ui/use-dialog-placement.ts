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

// ─────────────────────────────
// 自由移動のダイアログの置き方（掴んで動かす・辺と角で大きさを変える）。値の置き場は呼び出し側。
// ─────────────────────────────

/** 自由移動のダイアログの置き場所と、掴みの受け口 */
export interface DialogPlacement {
  /** DialogFrame の `size`。動かしたあとは呼び出し側の値で置く */
  readonly placed: boolean;
  readonly popupRef: (element: HTMLDivElement | null) => void;
  readonly style: React.CSSProperties | undefined;
  /** 見出しの帯に渡す掴み */
  readonly move: DragHandlers;
  /** 辺と角の掴み（`DialogResizeEdges` に渡す）。掴んだ場所は要素の `data-edge` で見分ける */
  readonly resize: DragHandlers;
  /** 今の見た目の枠（埋め込みから自由移動へ移すとき、同じ位置と大きさから始めるため） */
  readonly measure: () => DialogRect | null;
}

function viewport(): Viewport {
  return { width: globalThis.innerWidth, height: globalThis.innerHeight };
}

// 窓の大きさ。変わったら置き直す（残した値が画面より大きくなったときに縮めて出すため）
function subscribeResize(onChange: () => void): () => void {
  globalThis.addEventListener('resize', onChange);
  return () => globalThis.removeEventListener('resize', onChange);
}
const viewportKey = (): string =>
  `${String(globalThis.innerWidth)}x${String(globalThis.innerHeight)}`;

/**
 * 残した枠を画面に収めて置き、掴んで動かす・大きさを変える受け口を作る。
 * 掴んだ瞬間の枠は今の見た目から始める（既定の中央寄せのときも同じ位置から動く）。
 */
export function useDialogPlacement(
  rect: DialogRect | null,
  setRect: (rect: DialogRect) => void,
  min: DialogMinSize = DIALOG_MIN,
): DialogPlacement {
  const panel = useRef<HTMLDivElement | null>(null);
  // 窓の大きさが変わったら描き直す（値そのものは描くときに読む）
  useSyncExternalStore(subscribeResize, viewportKey, () => '');
  const shown = rect === null ? null : viewDialogRect(rect, viewport(), min);

  const measure = (): DialogRect | null => {
    const box = panel.current?.getBoundingClientRect();
    return box ? { left: box.left, top: box.top, width: box.width, height: box.height } : null;
  };
  const grabRect = (event: React.PointerEvent<HTMLElement>): DialogRect | null => {
    // ボタン・入力の上で押したときは掴まない（押した操作をそのまま通す）
    if (event.target instanceof Element && event.target.closest('button, input, select, label')) {
      return null;
    }
    return measure();
  };
  const move = useDragFrom(grabRect, (from: DialogRect, dx: number, dy: number) =>
    setRect(moveDialogRect(from, { dx, dy }, viewport(), min)),
  );
  // 辺と角の掴みは 1 つの手続きで受け、どこを掴んだかは掴みの `data-edge` から読む
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
  // ref のコールバックなので手で固定する（作り直すと付け外しが起きる）
  const popupRef = useCallback((element: HTMLDivElement | null) => {
    panel.current = element;
  }, []);

  return {
    placed: rect !== null,
    popupRef,
    // 残した値が画面より大きければ、収まる大きさで出す（残した値は動かすまで変えない）
    style:
      shown === null
        ? undefined
        : { left: shown.left, top: shown.top, width: shown.width, height: shown.height },
    move,
    resize,
    measure,
  };
}
