import { cva } from 'class-variance-authority';

// ─────────────────────────────
// ワークフローの呼び出しのカードの見た目のうち、状態の行と畳んだ中身が共に使うもの。
// ─────────────────────────────

/** 状態の見出し。合わない・失敗は失敗の色 */
export const stateLine = cva('inline-flex items-center gap-1.5 text-left', {
  variants: { failed: { true: 'text-destructive', false: 'text-muted-foreground' } },
});

/** 開閉の三角。開いたら下を向く */
export const disclosure = cva('size-2 shrink-0 fill-current transition-transform', {
  variants: { open: { true: 'rotate-90', false: '' } },
});

/** 実行し直すアイコン。受け取り中・実行中は回して、薄くしない（押せないことは disabled で伝える） */
export const rerunButton = cva(
  `text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-5 shrink-0
  items-center justify-center rounded disabled:pointer-events-none`,
  { variants: { busy: { true: '', false: 'disabled:opacity-40' } } },
);

/** 実行し直すアイコンの絵。受け取り中・実行中は回す */
export const rerunIcon = cva('size-3', {
  variants: { busy: { true: 'motion-safe:animate-spin', false: '' } },
});
