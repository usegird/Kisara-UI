import { cva } from 'class-variance-authority';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useOutputSrc } from '@/hooks/run/use-output-src';
import { useDragScroll } from '@/hooks/ui/use-drag-scroll';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { pushInOffsets, pushOutOffsets, type CellOffset, type Slide } from '@/queue/viewer-slides';

const layer = cva('absolute inset-0 grid gap-1 p-1', {
  variants: {
    motion: {
      none: '',
      'from-left': 'kisara-slide-from-left',
      'from-right': 'kisara-slide-from-right',
      'out-left': 'kisara-slide-out-left',
      'out-right': 'kisara-slide-out-right',
    },
  },
});

const pushCell = cva('', {
  variants: {
    push: { none: '', in: 'kisara-push-in', out: 'kisara-push-out', stay: 'invisible' },
  },
});

const slideFrame = cva('flex min-h-0 min-w-0', {
  variants: {
    actualSize: {
      true: 'cursor-grab overflow-auto active:cursor-grabbing',
      false: 'items-center justify-center',
    },
  },
});
const slideImage = cva('', {
  variants: {
    actualSize: { true: 'm-auto max-w-none', false: 'max-h-full max-w-full object-contain' },
  },
});

const sideArrow = cva(
  'bg-background/60 text-foreground absolute top-1/2 z-10 -translate-y-1/2 rounded-full p-1.5 ' +
    'opacity-0 backdrop-blur-sm transition-opacity hover:bg-background/90 ' +
    'group-hover/viewer:opacity-100 focus-visible:opacity-100',
  { variants: { side: { left: 'left-2', right: 'right-2' } } },
);

export type Motion =
  | { readonly kind: 'slide'; readonly from: 'left' | 'right'; readonly seq: number }
  | { readonly kind: 'push'; readonly shift: number; readonly seq: number };

export type Leaving =
  | {
      readonly kind: 'slide';
      readonly slides: readonly Slide[];
      readonly to: 'left' | 'right';
      readonly seq: number;
    }
  | {
      readonly kind: 'push';
      readonly slides: readonly Slide[];
      readonly shift: number;
      readonly seq: number;
    };

export interface CellPick {
  readonly label: string;
  readonly run: () => void;
}

interface SlideStageProps {
  readonly shown: readonly Slide[];
  readonly leaving: Leaving | null;
  readonly motion: Motion;
  readonly pushing: boolean;
  readonly perPage: number;
  readonly rows: number;
  readonly cols: number;
  readonly baseUrl: string;
  readonly actualSize: boolean;
  readonly pick: (slide: Slide) => CellPick | undefined;
}

export function SlideStage({
  shown,
  leaving,
  motion,
  pushing,
  perPage,
  rows,
  cols,
  baseUrl,
  actualSize,
  pick,
}: SlideStageProps): React.ReactElement {
  const grid = {
    gridTemplateRows: `repeat(${String(rows)}, minmax(0, 1fr))`,
    gridTemplateColumns: `repeat(${String(cols)}, minmax(0, 1fr))`,
  };

  return (
    <div className="relative h-full">
      {leaving === null ? null : (
        <div
          key={`out:${String(leaving.seq)}`}
          aria-hidden
          className={layer({
            motion: leaving.kind === 'push' ? 'none' : `out-${leaving.to}`,
          })}
          style={grid}
        >
          {leaving.slides.map((slide, index) => {
            const offset =
              leaving.kind === 'push'
                ? (pushOutOffsets(leaving.shift, perPage)[index] ?? null)
                : undefined;

            return (
              <Cell
                key={slide.key}
                slide={slide}
                baseUrl={baseUrl}
                actualSize={actualSize}
                className={pushCell({
                  push: pushOf(offset),
                })}
                style={offset ? offsetStyle(offset) : undefined}
              />
            );
          })}
        </div>
      )}

      <div
        key={motion.seq}
        className={layer({
          motion: motion.kind === 'push' ? 'none' : `from-${motion.from}`,
        })}
        style={grid}
      >
        {shown.map((slide, index) => {
          const offset =
            motion.kind === 'push' && pushing
              ? pushInOffsets(motion.shift, perPage, cols)[index]
              : undefined;

          return (
            <Cell
              key={slide.key}
              slide={slide}
              baseUrl={baseUrl}
              actualSize={actualSize}
              className={pushCell({ push: offset === undefined ? 'none' : 'in' })}
              style={offset === undefined ? undefined : offsetStyle(offset)}
              onPick={pick(slide)}
            />
          );
        })}
      </div>
    </div>
  );
}

function Cell({
  slide,
  baseUrl,
  actualSize,
  className,
  style,
  onPick,
}: {
  readonly slide: Slide;
  readonly baseUrl: string;
  readonly actualSize: boolean;
  readonly className?: string | undefined;
  readonly style?: React.CSSProperties | undefined;
  readonly onPick?: CellPick | undefined;
}): React.ReactElement {
  const src = useOutputSrc(baseUrl, slide.file, { until: slide.until });
  const { handlers, wasDragged } = useDragScroll(actualSize);
  const onCellClick = (): void => {
    if (!wasDragged()) onPick?.run();
  };
  const onCellKeyDown = (event: React.KeyboardEvent): void => {
    if (onPick === undefined || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopPropagation();
    onPick.run();
  };

  return (
    <div
      className={cn(slideFrame({ actualSize }), className)}
      style={style}
      role={onPick === undefined ? undefined : 'button'}
      tabIndex={onPick === undefined ? undefined : 0}
      aria-label={onPick?.label}
      title={onPick?.label}
      {...handlers}
      onClick={onCellClick}
      onKeyDown={onCellKeyDown}
    >
      {src === false ? (
        <p className="text-muted-foreground text-sm">
          {t('queue.viewer.imageMissing', { name: slide.file.filename })}
        </p>
      ) : (
        <img
          src={src ?? undefined}
          alt={slide.file.filename}
          decoding="sync"
          draggable={false}
          className={slideImage({ actualSize })}
        />
      )}
    </div>
  );
}

export function SideArrows({
  canNewer,
  canOlder,
  move,
}: {
  readonly canNewer: boolean;
  readonly canOlder: boolean;
  readonly move: (direction: number) => void;
}): React.ReactElement {
  return (
    <>
      {canNewer ? (
        <button
          type="button"
          className={sideArrow({ side: 'left' })}
          aria-label={t('queue.viewer.newer')}
          title={t('queue.viewer.newerHint')}
          onClick={() => move(-1)}
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
      ) : null}
      {canOlder ? (
        <button
          type="button"
          className={sideArrow({ side: 'right' })}
          aria-label={t('queue.viewer.older')}
          title={t('queue.viewer.olderHint')}
          onClick={() => move(1)}
        >
          <ChevronRight className="size-6" aria-hidden />
        </button>
      ) : null}
    </>
  );
}

function offsetStyle(offset: CellOffset): React.CSSProperties {
  const vars: Record<`--${string}`, number> = { '--kx': offset.x, '--ky': offset.y };
  return vars;
}

function pushOf(offset: unknown): 'none' | 'stay' | 'out' {
  if (offset === undefined) return 'none';
  return offset === null ? 'stay' : 'out';
}
