import { cva } from 'class-variance-authority';

// ─────────────────────────────
// 入力欄の見た目。枠線・地の色・角の丸み・内側の余白は 1 つで、大きさと幅だけを段で選ぶ
// ─────────────────────────────

/** 打ち込む欄・選ぶ欄 */
export const field = cva('border-input bg-background rounded-md border px-2 py-1', {
  variants: {
    size: { inherit: '', xs: 'text-xs', sm: 'text-sm' },
    width: { auto: '', full: 'w-full', control: 'max-w-(--control-max)' },
  },
  defaultVariants: { size: 'inherit', width: 'auto' },
});

/** 小さい文字の欄（会話のタブのダイアログと右の列の欄） */
export const FIELD_XS = field({ size: 'xs' });
