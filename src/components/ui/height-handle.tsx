import { cva } from 'class-variance-authority';

import { useDragFrom } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';
import { KEYBOARD_RESIZE_STEP } from '@/lib/resize-step';
import { unzoom } from '@/store/settings-fields/column-zoom';

const handle = cva(
  `group/height absolute inset-x-0 z-[15] flex h-2 cursor-ns-resize items-center
    focus:outline-none`,
  { variants: { edge: { bottom: '-bottom-1', top: '-top-1' } } },
);

export interface HeightHandleProps {
  readonly label: string;
  readonly height: number;
  readonly min: number;
  readonly max?: number | undefined;
  readonly edge?: 'top' | 'bottom' | undefined;
  readonly onChange: (height: number) => void;
  readonly menuAction?: boolean | undefined;
  readonly zoom?: number | undefined;
}

export function HeightHandle({
  label,
  height,
  min,
  max = Number.POSITIVE_INFINITY,
  edge = 'bottom',
  onChange,
  menuAction = false,
  zoom = 1,
}: HeightHandleProps): React.ReactElement {
  const sign = edge === 'top' ? -1 : 1;
  const clamp = (value: number): number => Math.min(max, Math.max(min, Math.round(value)));
  const drag = useDragFrom(
    () => height,
    (from: number, _dx: number, dy: number) => onChange(clamp(from + sign * unzoom(dy, zoom))),
  );

  return (
    <div
      role="separator"
      {...(menuAction ? MENU_ACTION : { tabIndex: 0 })}
      aria-orientation="horizontal"
      aria-label={t('flow.resize.height', { name: label })}
      aria-valuenow={height}
      aria-valuemin={min}
      aria-valuemax={Number.isFinite(max) ? max : undefined}
      title={t('flow.resize.heightTitle')}
      className={handle({ edge })}
      {...drag}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') onChange(clamp(height - sign * KEYBOARD_RESIZE_STEP));
        else if (event.key === 'ArrowDown') onChange(clamp(height + sign * KEYBOARD_RESIZE_STEP));
        else return;

        event.preventDefault();
      }}
    >
      <span
        aria-hidden
        className="bg-ring h-0.5 w-full rounded-full opacity-0 transition-opacity
          group-hover/height:opacity-100 group-focus/height:opacity-100"
      />
    </div>
  );
}
