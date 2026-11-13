import { useDragFrom, type DragHandlers } from '@/hooks/ui/use-drag-from';

// ─────────────────────────────
// 何も無い所を掴んで全体を送る。どの列か・どこが中身かは呼び出し側が決める。
// ─────────────────────────────

interface PanOrigin {
  readonly left: number;
  readonly column: HTMLElement | null;
  readonly top: number;
}

/**
 * 横は全体を、縦は掴んだ列だけを、掴んだ所に中身が付いてくる向きに送る掴みを作る。
 * @param column - 押した時点で、縦に送る列を返す
 * @param canStart - 掴んでよい所か（中身の上では掴まない）
 */
export function useDragPan(
  horizontal: () => HTMLElement | null,
  column: (target: Element, event: React.PointerEvent<HTMLElement>) => HTMLElement | null,
  canStart: (target: Element) => boolean,
): DragHandlers {
  return useDragFrom(
    (event: React.PointerEvent<HTMLElement>): PanOrigin | null => {
      // 指で触れたときは素の送りに任せる（ここで掴むと二重に動く）
      if (event.pointerType === 'touch') return null;
      const target = event.target;
      if (!(target instanceof Element)) return null;
      // 枠の外（ポップアップなど、画面上は別の場所に出ているもの）から伝わった押し下げは受けない
      if (!event.currentTarget.contains(target) || !canStart(target)) return null;

      // 押し下げの既定を止めるので（文字の選択が始まらないように）、何も無い所を押したときに
      // 起きるはずの焦点の外れをここで起こす。入力中の値はそこで確定する
      const focused = document.activeElement;
      if (focused instanceof HTMLElement) focused.blur();

      const vertical = column(target, event);
      return {
        left: horizontal()?.scrollLeft ?? 0,
        column: vertical,
        top: vertical?.scrollTop ?? 0,
      };
    },
    (from: PanOrigin, dx: number, dy: number) => {
      const scroller = horizontal();
      if (scroller) scroller.scrollLeft = from.left - dx;
      if (from.column) from.column.scrollTop = from.top - dy;
    },
  );
}
