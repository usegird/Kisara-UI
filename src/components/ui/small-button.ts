import { cva } from 'class-variance-authority';

// ─────────────────────────────
// 欄の中に置く小さいボタンの見た目（枠付きの文字のボタンと、枠の無いアイコンのボタン）。
// 部品の中で同じ列を書き直さない
// ─────────────────────────────

/** 枠付きの小さい文字のボタン。`fade` は押せない間を淡くする */
export const smallButton = cva(
  'hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
  {
    variants: { fade: { true: 'disabled:opacity-40', false: '' } },
    defaultVariants: { fade: false },
  },
);

/** 枠の無い小さいアイコンのボタン。押せない間は淡くする */
export const SMALL_ICON_BUTTON = 'hover:bg-muted rounded p-0.5 disabled:opacity-40';
