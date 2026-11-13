import { cva } from 'class-variance-authority';

// ─────────────────────────────
// ダイアログの本体の下端のボタンの見た目。枠の部品とは別ファイルに置く
// （部品以外を一緒に export すると Fast Refresh が状態を保てない）。
// ─────────────────────────────

/** 本体の下端のボタン */
export const dialogButton = cva('rounded-md px-3 py-1 text-sm disabled:opacity-50', {
  variants: {
    tone: {
      primary: 'bg-primary text-primary-foreground',
      secondary: 'border-input border',
    },
  },
});
