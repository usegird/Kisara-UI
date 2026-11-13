import { cva } from 'class-variance-authority';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useOutputSrc } from '@/hooks/run/use-output-src';
import { useDragScroll } from '@/hooks/ui/use-drag-scroll';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { pushInOffsets, pushOutOffsets, type CellOffset, type Slide } from '@/queue/viewer-slides';

// ─────────────────────────────
// ビューワーの画像の層。行×列の枠に画像を並べ、入れ替わり（送り・追従の押しのけ）の動きを当てる。
// 状態と送り・追従の手順は `ViewerSurface` が持ち、ここは描くだけ
// ─────────────────────────────

/** 入れ替わりの層ごとの動き。送りはページごと滑らせる */
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

/** 追従の押しのけの、枠ごとの動き。残る画像は出ていく側では描かない */
const pushCell = cva('', {
  variants: {
    push: { none: '', in: 'kisara-push-in', out: 'kisara-push-out', stay: 'invisible' },
  },
});

/** 画像 1 枚の枠。実サイズのときは掴んで送れるようにする */
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

/** 左右の端に重ねる送りの矢印。帯と同じく、画像を指している間か焦点がある間だけ見せる */
const sideArrow = cva(
  'bg-background/60 text-foreground absolute top-1/2 z-10 -translate-y-1/2 rounded-full p-1.5 ' +
    'opacity-0 backdrop-blur-sm transition-opacity hover:bg-background/90 ' +
    'group-hover/viewer:opacity-100 focus-visible:opacity-100',
  { variants: { side: { left: 'left-2', right: 'right-2' } } },
);

/** 入れ替わりの動き。送りはページごと滑らせ、追従は枠ごとに押しのける */
export type Motion =
  | { readonly kind: 'slide'; readonly from: 'left' | 'right'; readonly seq: number }
  | { readonly kind: 'push'; readonly shift: number; readonly seq: number };

/** 出ていく側。入れ替えのあいだだけ重ねて残す */
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

/** 枠を押したときの動き（1 枚を大きく見る・並びに戻る） */
export interface CellPick {
  readonly label: string;
  readonly run: () => void;
}

interface SlideStageProps {
  readonly shown: readonly Slide[];
  readonly leaving: Leaving | null;
  readonly motion: Motion;
  /** 押さえた並びを出していない（押しのけの動きを当ててよい） */
  readonly pushing: boolean;
  readonly perPage: number;
  readonly rows: number;
  readonly cols: number;
  readonly baseUrl: string;
  readonly actualSize: boolean;
  readonly pick: (slide: Slide) => CellPick | undefined;
}

/** 画像の層。出ていく側（入れ替えのあいだだけ）と、入ってくる側を重ねる */
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
      {/* 出ていく側。入れ替えのあいだだけ重ねる */}
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
            // 押しのけでは、あふれて出ていく画像だけを動かす（残る画像は入る側が描く）
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
          // 押しのけでは、枠ごとに前の枠（新しい画像は左の外）から入る
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
  /** 押したときの動き（1 枚を大きく見る・並びに戻る）。無ければ押せない */
  readonly onPick?: CellPick | undefined;
}): React.ReactElement {
  const src = useOutputSrc(baseUrl, slide.file, { until: slide.until });
  // 実サイズで枠からはみ出したときは、掴んで動かして送る
  const { handlers, wasDragged } = useDragScroll(actualSize);
  const onCellClick = (): void => {
    // 動かして離したときは押したことにしない
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
        // 接続先が無いと答えた画像は取りに行かず、名前だけ出す
        <p className="text-muted-foreground text-sm">
          {t('queue.viewer.imageMissing', { name: slide.file.filename })}
        </p>
      ) : (
        <img
          src={src ?? undefined}
          alt={slide.file.filename}
          // 先読みで復号済みなので、他の描画と同じ拍で出す（差し替えで白く抜けない）
          decoding="sync"
          // 掴んで送るとき、画像そのものを持ち出さない
          draggable={false}
          // 実サイズでも中央に置く。`m-auto` なら枠より大きいときに左上が欠けない（送って見る）
          className={slideImage({ actualSize })}
        />
      )}
    </div>
  );
}

/**
 * 送りの矢印。左右の端の縦の中ほどに重ね、帯と同じく指している間だけ出す。
 * **送る先が無い向きは出さない**
 */
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

/** 枠ごとのずれを CSS に渡す（`kisara-push-in` / `kisara-push-out` が読む） */
function offsetStyle(offset: CellOffset): React.CSSProperties {
  const vars: Record<`--${string}`, number> = { '--kx': offset.x, '--ky': offset.y };
  return vars;
}

/** 押しのけで出ていく側の画像の動き。押しのけでなければ動かさず、残る画像は隠す */
function pushOf(offset: unknown): 'none' | 'stay' | 'out' {
  if (offset === undefined) return 'none';
  return offset === null ? 'stay' : 'out';
}
