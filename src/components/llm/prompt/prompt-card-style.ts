import { cva } from 'class-variance-authority';

// ─────────────────────────────
// プロンプトの項目の 1 枚の行の見た目。項目とプレフィルで共通。
// 部品と別のファイルに置く（部品以外を一緒に export すると Fast Refresh が状態を保てない）。
// ─────────────────────────────

/** プロンプトの項目の 1 枚の行のクラス。送るか・掴んでいるか・動かせない行の地のつなぎ方で変える */
export const cardRow = cva('group/card flex min-w-0 flex-col rounded-md px-1 py-1 text-xs', {
  defaultVariants: { locked: false, joinUp: false, joinDown: false },
  variants: {
    /** 送らない項目（無効・本文の空）は灰色の文字 */
    enabled: { true: '', false: 'text-muted-foreground' },
    dragging: { true: 'opacity-30', false: '' },
    /** 動かせない行は帯の色を薄めた地（掴みの列の鍵と合わせて見分ける） */
    locked: { true: 'bg-band/50', false: '' },
    /**
     * 前の動かせない行と地をつなげる（間に項目を入れられないとき）。行の間（gap-1）を打ち消し、
     * その分を上の余白に足して文字の位置はほかの行と揃える
     */
    joinUp: { true: '-mt-1 rounded-t-none pt-2', false: '' },
    /** 次の動かせない行と地をつなげる */
    joinDown: { true: 'rounded-b-none', false: '' },
  },
});

/** 動かせない行の地のつなぎ方 */
export interface BandJoin {
  readonly joinUp: boolean;
  readonly joinDown: boolean;
}

/** 上下どちらともつなげない */
export const NO_JOIN: BandJoin = { joinUp: false, joinDown: false };
