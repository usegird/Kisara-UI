import { cva } from 'class-variance-authority';

// ─────────────────────────────
// 会話の左の列の行の見た目（新しい会話・ファイルから開く・一覧の行で共通）。
// ─────────────────────────────

/** 列の 1 行。今の会話は地の色と太字で示す */
export const chatRow = cva(
  'flex w-full min-w-0 items-center gap-1.5 rounded px-2 py-1 text-left text-sm',
  {
    variants: {
      active: { true: 'bg-background font-medium', false: 'hover:bg-background/60' },
    },
  },
);
