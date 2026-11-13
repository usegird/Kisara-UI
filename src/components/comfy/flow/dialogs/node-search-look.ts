import { cva } from 'class-variance-authority';

// ─────────────────────────────
// ノードの検索の一覧の行の見た目
// ─────────────────────────────

export const listButton = cva(
  'hover:bg-accent flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs',
  { variants: { selected: { true: 'bg-accent', false: '' } } },
);
