import { cva } from 'class-variance-authority';

// ─────────────────────────────
// 会話の画面の上に重ねるカードの並びと、滑り込む欄。構成の相談とプレイブックが同じ置き場と出方を使う。
// ─────────────────────────────

/**
 * カードの並び。アバターの左右のエリアの上端と揃える。幅は利用者が内側の縁で変える（呼び出し側が
 * `style` で渡す）。内側の縁（右に置けば左、左に置けば右）に幅を変える仕切りを置く
 */
export const cardStack = cva(
  'top-column-top absolute z-20 flex max-w-[calc(100%-1rem)] flex-row items-start',
  { variants: { side: { left: 'left-2 flex-row-reverse', right: 'right-4' } } },
);

/**
 * 欄。上端と下端はほかの表示域と揃え、置いたときに端から滑り込ませる（モデルの情報の欄と同じ出方）
 */
export const sideDrawer = cva(
  `top-column-top bottom-column-bottom bg-background animate-in pointer-events-auto absolute flex
    max-w-[calc(100%-1rem)] rounded-md border shadow-lg animation-duration-200 ease-out
    motion-reduce:animate-none`,
  {
    variants: {
      side: {
        left: 'slide-in-from-left left-2 flex-row-reverse',
        right: 'slide-in-from-right right-4',
      },
    },
  },
);
