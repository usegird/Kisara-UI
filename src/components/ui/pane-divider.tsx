import { cva } from 'class-variance-authority';

import { useDragFrom } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';
import { KEYBOARD_RESIZE_STEP } from '@/lib/resize-step';

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

export interface PaneDividerProps {
  readonly label: string;
  readonly size: number;
  readonly side: 'left' | 'right' | 'bottom';
  readonly onResize: (size: number) => void;
}

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
        event.preventDefault();
        event.stopPropagation();
      }}
    />
  );
}
