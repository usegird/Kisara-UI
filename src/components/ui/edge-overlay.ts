import { cva } from 'class-variance-authority';

import { edgeOverlayCovers, type EdgeDock } from '@/lib/edge-overlay';
import type { Point } from '@/lib/point';

// ─────────────────────────────
// 一覧に重ねて端から滑り込む情報の欄の、出方と待ち方。重ねる側は `relative` の囲みに置き、
// 中身の列（`SidePane`）と閉じ方は置く側が持つ。
// ─────────────────────────────

/**
 * 押した所に情報が被るとき、情報を出すまでの待ち（ms）。ダブルクリックなら出さずに済む。
 * 被らなければ待たない（置き場が右でも下でも同じ）
 */
export const EDGE_OVERLAY_DELAY = 400;

/**
 * 情報の置き場。端に寄せ、はみ出さない。右なら一覧に、下なら置く側が決めた全幅に重ねる
 */
export const edgeOverlay = cva(
  `bg-popover animate-in absolute z-20 flex max-h-full max-w-full overflow-hidden shadow-lg
    animation-duration-200 ease-out motion-reduce:animate-none`,
  {
    variants: {
      dock: {
        right: 'slide-in-from-right inset-y-0 right-0',
        bottom: 'slide-in-from-bottom inset-x-0 bottom-0 flex-col',
      },
    },
  },
);

/** 情報の置き場の切り替え。右に置いたときは情報の右下に浮かせる（縦の帯の残りを空ける） */
export const edgeDockToggle = cva('', {
  variants: {
    dock: {
      right: 'bg-popover absolute right-3 bottom-3 border shadow-sm',
      bottom: '',
    },
  },
});

/** 押した所に情報が被るか。押した瞬間に囲みの位置を 1 回だけ読む */
export function edgeOverlayCoversPoint(
  area: HTMLElement | null,
  dock: EdgeDock,
  size: number,
  point: Point,
): boolean {
  const rect = area?.getBoundingClientRect();
  return rect !== undefined && edgeOverlayCovers(rect, dock, size, point);
}
