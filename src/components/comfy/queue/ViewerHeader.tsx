import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Rows3,
  Sparkles,
  Triangle,
} from 'lucide-react';

import { SlideshowSecondsField } from '@/components/comfy/queue/SlideshowSecondsField';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { dialogControl } from '@/components/ui/dialog-control';
import {
  DIALOG_TOGGLE_ON_CLASS,
  DialogCloseButton,
  DialogHeader,
} from '@/components/ui/dialog-header';
import { t, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';
import { pageNumbers, SLIDE_FILTERS, type Slide, type SlideFilter } from '@/queue/viewer-slides';
import { VIEWER_GRID_MAX } from '@/store/settings-fields/viewer-grid';

interface ViewerHeaderProps {
  readonly first: Slide | undefined;
  readonly label: string;
  readonly count: React.ReactNode;
  readonly canNewer: boolean;
  readonly canOlder: boolean;
  readonly move: (direction: number) => void;
  readonly controls: React.ReactNode;
  readonly onClose: () => void;
}

export function ViewerHeader({
  first,
  label,
  count,
  canNewer,
  canOlder,
  move,
  controls,
  onClose,
}: ViewerHeaderProps): React.ReactElement {
  return (
    <DialogHeader
      leading={
        <>
          <button
            type="button"
            className={cn(DIALOG_ICON_CLASS, 'p-1')}
            aria-label={t('queue.viewer.newer')}
            title={t('queue.viewer.newerHint')}
            disabled={!canNewer}
            onClick={() => move(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className={cn(DIALOG_ICON_CLASS, 'p-1')}
            aria-label={t('queue.viewer.older')}
            title={t('queue.viewer.olderHint')}
            disabled={!canOlder}
            onClick={() => move(1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
          {count}
        </>
      }
      heading={
        <h2 className="flex min-w-0 items-baseline gap-2 text-sm font-semibold" title={label}>
          {first === undefined || first.number === null ? null : (
            <span className="bg-muted rounded px-1.5 tabular-nums">#{first.number}</span>
          )}
          <span className="truncate">{first?.file.filename ?? t('queue.dialog.noImages')}</span>
        </h2>
      }
      actions={controls}
      close={<DialogCloseButton onClose={onClose} title={t('queue.dialog.closeEsc')} />}
    />
  );
}

interface SlideCountProps {
  readonly total: number;
  readonly start: number;
  readonly perPage: number;
  readonly onFirst: () => void;
}

export function SlideCount({
  total,
  start,
  perPage,
  onFirst,
}: SlideCountProps): React.ReactElement | null {
  if (total === 0) return null;
  const numbers = pageNumbers(total, start, perPage);
  return (
    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
      {numbers.from === numbers.to ? numbers.to : `${numbers.from}–${numbers.to}`} /{' '}
      <button
        type="button"
        className="hover:text-foreground rounded underline-offset-2 hover:underline
          disabled:pointer-events-none"
        aria-label={t('queue.viewer.toFirst', { total: String(total) })}
        title={t('queue.viewer.toFirstHint')}
        disabled={start === 0}
        onClick={onFirst}
      >
        {total}
      </button>
    </span>
  );
}

interface ViewerControlsProps {
  readonly follow: boolean;
  readonly onFollow: (follow: boolean) => void;
  readonly playing: boolean;
  readonly onPlaying: (playing: boolean) => void;
  readonly slideshowSeconds: number;
  readonly actualSize: boolean;
  readonly onActualSize: () => void;
  readonly rows: number;
  readonly cols: number;
  readonly onGrid: (grid: { readonly rows?: number; readonly cols?: number }) => void;
  readonly filter: SlideFilter;
  readonly onFilter: (filter: SlideFilter) => void;
  readonly extra: React.ReactNode;
}

const FILTER_LABELS = {
  all: 'queue.viewer.filter.all',
  temp: 'queue.viewer.filter.temp',
  output: 'queue.viewer.filter.output',
} as const satisfies Record<SlideFilter, MessageKey>;

export function ViewerControls({
  follow,
  onFollow,
  playing,
  onPlaying,
  slideshowSeconds,
  actualSize,
  onActualSize,
  rows,
  cols,
  onGrid,
  filter,
  onFilter,
  extra,
}: ViewerControlsProps): React.ReactElement {
  const onFilterChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const picked = SLIDE_FILTERS.find((entry) => entry === event.target.value);
    if (picked !== undefined) onFilter(picked);
  };
  return (
    <>
      {playing ? (
        <span className="text-muted-foreground flex shrink-0 items-center gap-0.5 text-xs">
          <SlideshowSecondsField
            className={cn(dialogControl({ kind: 'field' }), 'h-7 w-6 text-right tabular-nums')}
          />
          {t('queue.viewer.slideshow.unit')}
        </span>
      ) : (
        <button
          type="button"
          className={cn(DIALOG_ICON_CLASS, DIALOG_TOGGLE_ON_CLASS)}
          aria-label={t('queue.viewer.follow')}
          aria-pressed={follow}
          title={t('queue.viewer.followHint')}
          onClick={() => onFollow(!follow)}
        >
          <Sparkles className="size-4" aria-hidden />
        </button>
      )}
      <button
        type="button"
        className={cn(DIALOG_ICON_CLASS, DIALOG_TOGGLE_ON_CLASS)}
        aria-label={t('queue.viewer.slideshow.label')}
        aria-pressed={playing}
        title={t('queue.viewer.slideshow.title', { seconds: String(slideshowSeconds) })}
        onClick={() => onPlaying(!playing)}
      >
        {playing ? (
          <Pause className="size-4" aria-hidden />
        ) : (
          <Play className="size-4" aria-hidden />
        )}
      </button>
      <button
        type="button"
        className={cn(DIALOG_ICON_CLASS, 'ml-1.5')}
        aria-label={actualSize ? t('queue.viewer.fit') : t('queue.viewer.actualSize')}
        title={actualSize ? t('queue.viewer.fitHint') : t('queue.viewer.actualSizeHint')}
        onClick={onActualSize}
      >
        {actualSize ? (
          <Minimize2 className="size-4" aria-hidden />
        ) : (
          <Maximize2 className="size-4" aria-hidden />
        )}
      </button>
      <GridStepper
        label={t('queue.viewer.grid.rows')}
        hint={t('queue.viewer.grid.rowsHint')}
        icon={<Rows3 className="size-3.5" aria-hidden />}
        value={rows}
        onChange={(value) => onGrid({ rows: value })}
      />
      <GridStepper
        label={t('queue.viewer.grid.cols')}
        hint={t('queue.viewer.grid.colsHint')}
        icon={<Columns3 className="size-3.5" aria-hidden />}
        value={cols}
        onChange={(value) => onGrid({ cols: value })}
      />
      <select
        className={cn(dialogControl({ kind: 'choice' }), 'mr-1.5 ml-[3px] h-7')}
        value={filter}
        aria-label={t('queue.viewer.filter.label')}
        title={t('queue.viewer.filter.label')}
        onChange={onFilterChange}
      >
        {SLIDE_FILTERS.map((entry) => (
          <option key={entry} value={entry}>
            {t(FILTER_LABELS[entry])}
          </option>
        ))}
      </select>

      {extra}
    </>
  );
}

const STEP_CLASS =
  'hover:text-foreground flex h-2 w-3 items-center justify-center disabled:opacity-30';

interface GridStepperProps {
  readonly label: string;
  readonly hint: string;
  readonly icon: React.ReactNode;
  readonly value: number;
  readonly onChange: (value: number) => void;
}

function GridStepper({ label, hint, icon, value, onChange }: GridStepperProps): React.ReactElement {
  return (
    <div
      role="group"
      aria-label={`${label} ${String(value)}`}
      title={t('queue.viewer.grid.title', { label, value: String(value), hint })}
      className="text-muted-foreground flex shrink-0 items-center gap-0.5"
    >
      {icon}
      <div className="flex flex-col">
        <button
          type="button"
          className={STEP_CLASS}
          aria-label={t('queue.viewer.grid.increase', { label })}
          disabled={value >= VIEWER_GRID_MAX}
          onClick={() => onChange(value + 1)}
        >
          <Triangle className="size-1.5 fill-current" aria-hidden />
        </button>
        <button
          type="button"
          className={STEP_CLASS}
          aria-label={t('queue.viewer.grid.decrease', { label })}
          disabled={value <= 1}
          onClick={() => onChange(value - 1)}
        >
          <Triangle className="size-1.5 rotate-180 fill-current" aria-hidden />
        </button>
      </div>
    </div>
  );
}
