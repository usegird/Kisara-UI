import { useRef } from 'react';

import { useDragFrom, type DragHandlers } from '@/hooks/ui/use-drag-from';

// ─────────────────────────────
// 中身より小さい枠を、掴んだ所が付いてくる向きに送る（実サイズの画像など、はみ出したものを見る）。
// ─────────────────────────────

interface ScrollOrigin {
  readonly element: HTMLElement;
  readonly left: number;
  readonly top: number;
}

/** これより小さい動きは押しただけとみなす（px） */
const CLICK_SLOP = 4;

/** 掴んで送る受け口と、直前の押し下げで動かしたかの問い合わせ */
interface DragScroll {
  readonly handlers: DragHandlers;
  /**
   * 直前の押し下げで動かしたか。押したときの処理の頭で確かめる
   * （動かしたあとの押下で、離した所の押す操作が走らないように）
   */
  readonly wasDragged: () => boolean;
}

/**
 * 付けた要素を掴んで送れるようにする。
 * @param enabled - 偽の間は掴まない（押した操作をそのまま通す）
 */
export function useDragScroll(enabled: boolean): DragScroll {
  const dragged = useRef(false);

  const handlers = useDragFrom(
    (event: React.PointerEvent<HTMLElement>): ScrollOrigin | null => {
      dragged.current = false;
      // 指で触れたときは素の送りに任せる（ここで掴むと二重に動く）
      if (!enabled || event.pointerType === 'touch') return null;

      const element = event.currentTarget;
      return { element, left: element.scrollLeft, top: element.scrollTop };
    },
    (from: ScrollOrigin, dx: number, dy: number) => {
      if (Math.abs(dx) + Math.abs(dy) >= CLICK_SLOP) dragged.current = true;
      from.element.scrollLeft = from.left - dx;
      from.element.scrollTop = from.top - dy;
    },
  );

  const wasDragged = (): boolean => dragged.current;
  return { handlers, wasDragged };
}
