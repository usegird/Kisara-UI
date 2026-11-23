import { APP_INPUT_SPANS } from '@/graph/app-inputs';
import { useDragFrom } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';
import { clamp } from '@/lib/clamp';
import { MENU_ACTION } from '@/lib/menu-actions';

export interface SpanHandleProps {
  readonly label: string;
  readonly span: number;
  readonly unit: number | null;
  readonly guide?: boolean | undefined;
  readonly onChange: (span: number) => void;
}

export function SpanHandle({
  label,
  span,
  unit,
  guide = false,
  onChange,
}: SpanHandleProps): React.ReactElement {
  const step = (delta: number): void => onChange(clamp(span + delta, 1, APP_INPUT_SPANS));
  const drag = useDragFrom(
    () => span,
    (from: number, dx: number) => {
      if (unit === null || unit <= 0) return;
      onChange(clamp(from + Math.round(dx / unit), 1, APP_INPUT_SPANS));
    },
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('flow.resize.spanWidth', { name: label })}
      aria-valuenow={span}
      aria-valuemin={1}
      aria-valuemax={APP_INPUT_SPANS}
      {...MENU_ACTION}
      className="group/span absolute inset-y-0 -right-1 z-10 flex w-2 cursor-col-resize
        items-stretch justify-center focus:outline-none"
      {...drag}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') step(-1);
        else if (event.key === 'ArrowRight') step(1);
        else if (event.key === 'Home') onChange(1);
        else if (event.key === 'End') onChange(APP_INPUT_SPANS);
        else return;

        event.preventDefault();
      }}
    >
      {guide ? (
        <span
          aria-hidden
          className="border-muted-foreground/40 absolute inset-y-0 border-l border-dotted"
        />
      ) : null}
      <span
        aria-hidden
        className="bg-ring h-full w-0.5 rounded-full opacity-0 transition-opacity
          group-hover/span:opacity-100 group-focus/span:opacity-100"
      />
    </div>
  );
}
