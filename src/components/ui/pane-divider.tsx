import { cva } from 'class-variance-authority';

import { useDragFrom } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';
import { KEYBOARD_RESIZE_STEP } from '@/lib/resize-step';

// ─────────────────────────────
// ダイアログの中の列を分ける線。掴むか矢印キーで列の幅（下の列なら高さ）を変える。
// **線そのものを描く**（列の側に枠線を持たせない。線と掴む所がずれないように）。
// ─────────────────────────────

// 線は 1px のまま（太らせると隣の列が動く）。掴める所だけ両側へ 4px ずつ広げる
const divider = cva(
  `bg-border hover:bg-muted-foreground/60 focus:bg-ring relative z-10 shrink-0
    outline-none before:absolute before:content-['']`,
  {
    variants: {
      orientation: {
        vertical: 'w-px cursor-col-resize before:inset-y-0 before:-right-1 before:-left-1',
        horizontal: 'h-px cursor-row-resize before:inset-x-0 before:-top-1 before:-bottom-1',
      },
    },
  },
);

/** 列を分ける線の props */
export interface PaneDividerProps {
  /** 大きさを変える列の名前（読み上げ） */
  readonly label: string;
  /** 列の幅（下の列なら高さ） */
  readonly size: number;
  /** 大きさを変える列が線のどちら側にあるか。右・下なら動かす向きが逆になる */
  readonly side: 'left' | 'right' | 'bottom';
  /** 新しい大きさ。範囲は受け取る側が丸める */
  readonly onResize: (size: number) => void;
}

/** 列を分ける線（`role="separator"`） */
export function PaneDivider({ label, size, side, onResize }: PaneDividerProps): React.ReactElement {
  const vertical = side !== 'bottom';
  const sign = side === 'left' ? 1 : -1;
  const drag = useDragFrom(
    () => size,
    (from: number, dx: number, dy: number) => onResize(from + sign * (vertical ? dx : dy)),
  );
  const [less, more] = vertical ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];

  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={t(vertical ? 'ui.divider.width' : 'ui.divider.height', { label })}
      aria-valuenow={size}
      tabIndex={0}
      title={t(vertical ? 'ui.divider.widthTitle' : 'ui.divider.heightTitle')}
      className={divider({ orientation: vertical ? 'vertical' : 'horizontal' })}
      {...drag}
      onKeyDown={(event) => {
        if (event.key === less) onResize(size - sign * KEYBOARD_RESIZE_STEP);
        else if (event.key === more) onResize(size + sign * KEYBOARD_RESIZE_STEP);
        else return;
        // 隣への送り（矢印キー）に流さない
        event.preventDefault();
        event.stopPropagation();
      }}
    />
  );
}
