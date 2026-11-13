import { cva } from 'class-variance-authority';

// ─────────────────────────────
// 取り直しのボタンのアイコンの見た目。取り直している間は回す
// ─────────────────────────────

/** 取り直しのアイコン（`size` は置く帯の高さに合わせる） */
export const refreshIcon = cva('', {
  variants: {
    size: { sm: 'size-3.5', md: 'size-4' },
    loading: { true: 'motion-safe:animate-spin', false: '' },
  },
  defaultVariants: { size: 'md', loading: false },
});
