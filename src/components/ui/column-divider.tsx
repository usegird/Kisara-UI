import { cva } from 'class-variance-authority';

import { useDragFrom } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';
import { KEYBOARD_RESIZE_STEP } from '@/lib/resize-step';
import type { ColumnKey } from '@/store/settings-fields/column-widths';

const RESIZE_TO_END = 9999;

const divider = cva(
  `group/divider relative z-10 -mx-1 flex w-3 shrink-0 cursor-col-resize items-stretch
    self-stretch focus:outline-none`,
  { variants: { line: { center: 'justify-center', start: 'justify-start' } } },
);

export interface ColumnDividerProps<K extends string = ColumnKey> {
  readonly column: K;
  readonly label: string;
  readonly width: number;
  readonly side?: 'left' | 'right' | undefined;
  readonly offset?: number | undefined;
  readonly line?: 'center' | 'start' | undefined;
  readonly onResize: (column: K, delta: number) => void;
}

export function ColumnDivider<K extends string = ColumnKey>({
  column,
  label,
  width,
  side = 'left',
  offset = 0,
  line = 'center',
  onResize,
}: ColumnDividerProps<K>): React.ReactElement {
  const resize = (delta: number): void => onResize(column, side === 'right' ? -delta : delta);

  const drag = useDragFrom(
    () => ({ applied: 0 }),
    (from: { applied: number }, dx: number) => {
      resize(dx - from.applied);
      from.applied = dx;
    },
  );

  return (
    <div
      role="separator"
      data-column-divider={column}
      aria-orientation="vertical"
      aria-label={t('flow.resize.columnWidth', { name: label })}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      className={divider({ line })}
      style={offset === 0 ? undefined : { transform: `translateX(${String(offset)}px)` }}
      {...drag}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') resize(-KEYBOARD_RESIZE_STEP);
        else if (event.key === 'ArrowRight') resize(KEYBOARD_RESIZE_STEP);
        else if (event.key === 'Home') resize(-RESIZE_TO_END);
        else if (event.key === 'End') resize(RESIZE_TO_END);
        else return;

        event.preventDefault();
      }}
    >
      <span
        aria-hidden
        className="border-muted-foreground/60 group-focus/divider:border-ring group-hover/divider:border-l
          group-focus/divider:border-l h-full border-l-0 border-dashed"
      />
    </div>
  );
}
