import { cva } from 'class-variance-authority';

// ─────────────────────────────
// 右の列のカードの並べ方と縮小画像の枠。タスクと履歴で同じ形にする。
// ─────────────────────────────

/** カードの左の縮小画像の枠（画像が無いときの絵もこの中に置く） */
export const THUMBNAIL_FRAME = `bg-muted text-muted-foreground/60 flex size-14 shrink-0 items-center
  justify-center overflow-hidden rounded border`;

/**
 * カードの並び。右に置けば縦に積み、下に置けば折り返す。
 * 最も狭い幅は、英語の履歴のカードの 1 行目（日時と回数）が省かれない 240px（15rem）。
 */
export const cardList = cva('gap-1.5', {
  variants: {
    wrap: {
      false: 'flex flex-col',
      true: 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]',
    },
  },
});
