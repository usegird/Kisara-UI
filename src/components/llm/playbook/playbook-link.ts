import { cva } from 'class-variance-authority';

// ─────────────────────────────
// プレイブックのカードの操作のリンク・アイコンのボタンと、カードの中で打ち込む欄の見た目。
// ─────────────────────────────

/** カードの見出しと段の行のアイコンのボタン */
export const ICON_BUTTON = `text-muted-foreground hover:text-foreground hover:bg-muted inline-flex
  size-6 shrink-0 items-center justify-center rounded-md disabled:pointer-events-none
  disabled:opacity-40`;

/** カードの中で打ち込む欄（コマンドの続き・重要なメモ・アウトラインの段） */
export const PLAYBOOK_FIELD =
  'bg-background w-full rounded-md border px-2 py-1 text-xs outline-none focus:border-ring';

/** 「› コマンド」と同じ書式の行（› と名前）。開閉の行と、構成の相談を開く操作に使う */
export const PLAYBOOK_TOGGLE =
  'text-muted-foreground hover:text-foreground flex items-center gap-1 self-start text-xs';

/** プレイブックのカードの操作をリンクの見た目で描くクラス。`primary` で主の操作にする */
export const playbookLink = cva(
  `text-primary self-start text-left text-xs underline-offset-2 hover:underline
    disabled:pointer-events-none disabled:opacity-40`,
  {
    variants: { primary: { true: 'font-medium', false: '' } },
    defaultVariants: { primary: false },
  },
);
