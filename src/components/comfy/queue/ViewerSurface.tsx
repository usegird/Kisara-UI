import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { SlideCount, ViewerControls, ViewerHeader } from '@/components/comfy/queue/ViewerHeader';
import {
  SideArrows,
  SlideStage,
  type CellPick,
  type Leaving,
  type Motion,
} from '@/components/comfy/queue/ViewerSlides';
import { MS_PER_SECOND } from '@/components/ui/units';
import { t } from '@/i18n';
import { preloadImages } from '@/lib/image-preload';
import { isTextEntry } from '@/lib/text-entry';
import type { QueueTask } from '@/queue/queue-tasks';
import {
  anchoredStart,
  buildSlides,
  followShift,
  moveAnchored,
  resolveSlide,
  shouldFollow,
  slideIndex,
  type Slide,
} from '@/queue/viewer-slides';
import { outputSrc, outputViewUrl, useOutputImagesStore } from '@/store/use-output-images-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useViewerStore } from '@/store/use-viewer-store';

type Bar = 'float' | 'header';

const SLIDE_MS = 360;

export interface ViewerSurfaceProps {
  readonly tasks: readonly QueueTask[];
  readonly current: string | null;
  readonly baseUrl: string;
  readonly onChange: (key: string) => void;
  readonly onClose: () => void;
  readonly keyTarget: Window | null;
  readonly extra?: React.ReactNode | undefined;
  readonly bar?: Bar | undefined;
}

export function ViewerSurface({
  tasks,
  current,
  baseUrl,
  onChange,
  onClose,
  keyTarget,
  extra,
  bar = 'float',
}: ViewerSurfaceProps): React.ReactElement {
  const [actualSize, setActualSize] = useState(false);
  const [motion, setMotion] = useState<Motion>({ kind: 'slide', from: 'left', seq: 0 });
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const savedGrid = useSettingsStore((state) => state.viewerGrid);
  const [zoomed, setZoomed] = useState(false);
  const rows = zoomed ? 1 : savedGrid.rows;
  const cols = zoomed ? 1 : savedGrid.cols;
  const setViewerGrid = useSettingsStore((state) => state.setViewerGrid);
  const [follow, setFollow] = useState(true);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const slideshowSeconds = useSettingsStore((state) => state.slideshowSeconds);

  const filter = useViewerStore((state) => state.filter);
  const setFilter = useViewerStore((state) => state.setFilter);
  const slides = useMemo(() => buildSlides(tasks, filter), [tasks, filter]);
  const perPage = rows * cols;
  const here = resolveSlide(slides, current);
  const start = anchoredStart(slides, anchor, here, perPage);
  const pageFrom = (from: number): Slide[] => slides.slice(from, from + perPage);
  const pageOf = (key: string): Slide[] => pageFrom(Math.max(0, slideIndex(slides, key)));

  const [held, setHeld] = useFollowHold(slides, current, perPage, { follow, playing, anchor });

  const changeFollow = (next: boolean): void => {
    setFollow(next);
    setAnchor(slides[start]?.key ?? null);
    if (!next && current === null && here !== null) onChange(here);
  };

  const changePlaying = (next: boolean): void => {
    setPlaying(next);
    if (next) setAnchor(slides[start]?.key ?? null);
    if (next && current === null && here !== null) onChange(here);
  };

  const shown = held?.page ?? pageFrom(start);

  const ensureImage = useOutputImagesStore((state) => state.ensure);
  const pageSources = async (page: readonly Slide[]): Promise<string[]> => {
    await Promise.all(
      page.map((slide) => ensureImage(baseUrl, slide.file, { until: slide.until })),
    );
    const images = useOutputImagesStore.getState().images;
    return page.flatMap((slide) => {
      const url = outputViewUrl(baseUrl, slide.file);
      const src = url === null ? null : outputSrc(images, url, slide.until);
      return typeof src === 'string' ? [src] : [];
    });
  };

  const show = (key: string, from: 'left' | 'right'): void => {
    void preloadImages(pageSources(pageOf(key))).then(() => {
      setLeaving({
        kind: 'slide',
        slides: shown,
        to: from === 'left' ? 'right' : 'left',
        seq: motion.seq + 1,
      });
      setMotion({ kind: 'slide', from, seq: motion.seq + 1 });
      setHeld(null);
      setAnchor(key);
      onChange(key);
    });
  };

  const pick = (slide: Slide): CellPick | undefined => {
    if (zoomed) return { label: t('queue.viewer.backToGrid'), run: () => setZoomed(false) };
    if (savedGrid.rows * savedGrid.cols <= 1) return undefined;
    return {
      label: t('queue.viewer.enlarge', { name: slide.file.filename }),
      run: () => {
        setZoomed(true);
        onChange(slide.key);
      },
    };
  };

  const move = (direction: number): void => {
    const next = moveAnchored(slides, start, perPage, direction);
    if (next === null) return;

    show(next, direction < 0 ? 'left' : 'right');
  };

  const tick = useEffectEvent((): void => move(-1));
  useEffect(() => {
    if (!playing) return;
    const clock = keyTarget ?? globalThis;
    const timer = clock.setInterval(tick, slideshowSeconds * MS_PER_SECOND);
    return () => clock.clearInterval(timer);
  }, [playing, slideshowSeconds, keyTarget, motion.seq]);

  useEffect(() => {
    if (leaving === null) return;

    const timer = setTimeout(() => setLeaving(null), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  const followRound = useRef(0);
  const pushIn = useEffectEvent((page: readonly Slide[], target: string): void => {
    const round = ++followRound.current;
    void preloadImages(pageSources(pageOf(target))).then(() => {
      if (round !== followRound.current) return;

      const shift = followShift(page, slides, perPage, Math.max(0, slideIndex(slides, target)));
      setLeaving({ kind: 'push', slides: page, shift, seq: motion.seq + 1 });
      setMotion({ kind: 'push', shift, seq: motion.seq + 1 });
      setHeld(null);
      setAnchor(target);
      onChange(target);
    });
  });

  useEffect(() => {
    if (held !== null) pushIn(held.page, held.target);
  }, [held]);

  const toggleActualSize = (): void => setActualSize((value) => !value);
  useViewerKeys(keyTarget, { move, close: onClose, toggleActualSize });

  const onGridChange: React.ComponentProps<typeof ViewerControls>['onGrid'] = (grid) => {
    setZoomed(false);
    setViewerGrid(grid);
  };

  const first = shown[0];
  const label = slideLabel(first);
  const canNewer = start > 0;
  const canOlder = start + perPage < slides.length;

  const toFirst = (): void => {
    const key = slides[0]?.key;
    if (key !== undefined && start > 0) show(key, 'left');
  };
  const count = (
    <SlideCount total={slides.length} start={start} perPage={perPage} onFirst={toFirst} />
  );

  const controls = (
    <ViewerControls
      follow={follow}
      onFollow={changeFollow}
      playing={playing}
      onPlaying={changePlaying}
      slideshowSeconds={slideshowSeconds}
      actualSize={actualSize}
      onActualSize={toggleActualSize}
      rows={savedGrid.rows}
      cols={savedGrid.cols}
      onGrid={onGridChange}
      filter={filter}
      onFilter={setFilter}
      extra={extra}
    />
  );

  const header = (
    <ViewerHeader
      first={first}
      label={label}
      count={count}
      canNewer={canNewer}
      canOlder={canOlder}
      move={move}
      controls={controls}
      onClose={onClose}
    />
  );

  return (
    <div
      className="group/viewer bg-background text-foreground relative flex h-full flex-col
        overflow-hidden"
    >
      {bar === 'header' ? header : null}
      <div className="relative min-h-0 flex-1">
        {shown.length === 0 ? (
          <p className="text-muted-foreground grid h-full place-items-center text-sm">
            {t('queue.viewer.noImagesToShow')}
          </p>
        ) : (
          <SlideStage
            shown={shown}
            leaving={leaving}
            motion={motion}
            pushing={held === null}
            perPage={perPage}
            rows={rows}
            cols={cols}
            baseUrl={baseUrl}
            actualSize={actualSize}
            pick={pick}
          />
        )}

        <SideArrows canNewer={canNewer} canOlder={canOlder} move={move} />
      </div>

      {bar === 'float' ? (
        <div
          className="absolute inset-x-0 top-0 z-20 opacity-0 transition-opacity
            group-hover/viewer:opacity-100 focus-within:opacity-100"
        >
          {header}
        </div>
      ) : null}
    </div>
  );
}

interface Held {
  readonly page: readonly Slide[];
  readonly target: string;
}

function useFollowHold(
  slides: readonly Slide[],
  current: string | null,
  perPage: number,
  mode: {
    readonly follow: boolean;
    readonly playing: boolean;
    readonly anchor: string | null;
  },
): readonly [Held | null, (held: Held | null) => void] {
  const [seen, setSeen] = useState(slides);
  const [held, setHeld] = useState<Held | null>(null);

  if (seen !== slides) {
    setSeen(slides);
    const pending = held?.target ?? null;
    const was = pending ?? resolveSlide(seen, current);
    const from = anchoredStart(seen, pending ?? mode.anchor, was, perPage);
    const chase = mode.playing ? from === 0 : mode.follow;
    const target = slides[from]?.key;
    if (chase && target !== undefined && shouldFollow(slides, seen)) {
      setHeld({ page: held?.page ?? seen.slice(from, from + perPage), target });
    }
  }
  return [held, setHeld];
}

interface ViewerKeys {
  readonly move: (direction: number) => void;
  readonly close: () => void;
  readonly toggleActualSize: () => void;
}

function useViewerKeys(keyTarget: Window | null, keys: ViewerKeys): void {
  const onKey = useEffectEvent((event: KeyboardEvent): void => {
    if (isTextEntry(event.target) || event.target instanceof HTMLSelectElement) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === 'ArrowLeft') keys.move(-1);
    else if (event.key === 'ArrowRight') keys.move(1);
    else if (event.key === 'Escape') keys.close();
    else if (event.key === 'f') keys.toggleActualSize();
    else return;

    event.preventDefault();
  });

  useEffect(() => {
    if (keyTarget === null) return;

    const handler = (event: KeyboardEvent): void => onKey(event);
    keyTarget.addEventListener('keydown', handler);
    return () => keyTarget.removeEventListener('keydown', handler);
  }, [keyTarget]);
}

function slideLabel(first: Slide | undefined): string {
  if (first === undefined) return t('queue.dialog.noImages');
  return `${first.number === null ? '' : `#${String(first.number)} `}${first.file.filename}`;
}
