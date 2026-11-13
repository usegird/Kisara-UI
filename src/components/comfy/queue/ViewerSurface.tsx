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

// ─────────────────────────────
// 結果画像の見せ方そのもの。別ウィンドウにも、タブへの重ねにも同じものを使う（帯の置き方だけ `bar` で変える）。
// 動きを減らす設定は CSS 側で尊重する。
// ─────────────────────────────

/** 見出しの帯の置き方。`float` は画像の上に重ねて指すまで沈め、`header` は場所を取る */
type Bar = 'float' | 'header';

/** 送りの動きの長さ。CSS 側と揃える（過ぎたら古い方を片付ける） */
const SLIDE_MS = 360;

/** ビューワーの中身の受け取り物 */
export interface ViewerSurfaceProps {
  /** キュー列と同じ並び（新しいものが先頭） */
  readonly tasks: readonly QueueTask[];
  /** 今見ている位置（画像 1 枚を指す鍵）。null なら先頭から */
  readonly current: string | null;
  readonly baseUrl: string;
  readonly onChange: (key: string) => void;
  readonly onClose: () => void;
  /** キーを受ける窓。別ウィンドウならその窓 */
  readonly keyTarget: Window | null;
  /** 帯の右端に足す操作（別ウィンドウで開く など） */
  readonly extra?: React.ReactNode | undefined;
  /** 操作の帯の出し方。既定は画像の上に重ねる */
  readonly bar?: Bar | undefined;
}

/**
 * 画像を行×列の枠に並べ、送り・追従・スライドショー・実サイズを持つビューワーの中身
 */
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
  /** 入れ替わりの動きと回数。回数を鍵にして描き直し、動きをやり直させる */
  const [motion, setMotion] = useState<Motion>({ kind: 'slide', from: 'left', seq: 0 });
  /** 出ていく側。入れ替えのあいだだけ重ねて残す */
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  // 行×列は端末に残す（次に開いたときも同じ枠）。別窓でも同じストアを見る
  const savedGrid = useSettingsStore((state) => state.viewerGrid);
  /**
   * 並べているうちの 1 枚を大きく見ているか。押した画像を 1×1 で出し、もう一度押すと戻す
   * （行と列の設定は変えない）
   */
  const [zoomed, setZoomed] = useState(false);
  const rows = zoomed ? 1 : savedGrid.rows;
  const cols = zoomed ? 1 : savedGrid.cols;
  const setViewerGrid = useSettingsStore((state) => state.setViewerGrid);
  /** 新しい画像が出たら送るか。遡って見たいときは外す */
  const [follow, setFollow] = useState(true);
  /**
   * 追従を切っているときの錨（出しているページの先頭の画像）。画像が増えても並びを変えず、
   * 送ったときだけ置き直す（勝手に描き直さない）
   */
  const [anchor, setAnchor] = useState<string | null>(null);
  /**
   * スライドショー中か。決まった間隔で新しい方へ送る。その間は追従を効かせず、
   * 先頭に追い付いたら追従と同じに振る舞う（追従の入り切りは変えない）
   */
  const [playing, setPlaying] = useState(false);
  const slideshowSeconds = useSettingsStore((state) => state.slideshowSeconds);

  // 出す種別（すべて・temp・output）。別窓と重ねで同じ値を見る
  const filter = useViewerStore((state) => state.filter);
  const setFilter = useViewerStore((state) => state.setFilter);
  // この部品では compiler が並びを前回の物にしない（外すと描くたびに組み直す）ので、手で書く
  const slides = useMemo(() => buildSlides(tasks, filter), [tasks, filter]);
  const perPage = rows * cols;
  // 見ていた画像が差し替わっても、勝手に新しい方へ飛ばない
  const here = resolveSlide(slides, current);
  // ページは錨（出しているページの先頭の画像）から数える。画像が増えても勝手に並べ直さず、
  // 動かすのは送ったときと追従したときだけ（1 枚で見ているときは見ている画像そのもの）
  const start = anchoredStart(slides, anchor, here, perPage);
  /** `from` から 1 ページ分 */
  const pageFrom = (from: number): Slide[] => slides.slice(from, from + perPage);
  /** その鍵から始まるページ */
  const pageOf = (key: string): Slide[] => pageFrom(Math.max(0, slideIndex(slides, key)));

  // 追いかけるかは、増える前の並びで決める（スライドショー中は増える前に先頭へ追い付いていたか）
  const [held, setHeld] = useFollowHold(slides, current, perPage, { follow, playing, anchor });

  /**
   * 追従の入り切り。外すときは今出している画像に留める。見る画像を決めずに最新を出している
   * （`current` が null の）ままだと、新しい画像が先頭に来たときにそちらへ移ってしまう
   */
  const changeFollow = (next: boolean): void => {
    setFollow(next);
    // 今出しているページの先頭を錨にする（切っていれば、以後は画像が増えても並びを変えない）
    setAnchor(slides[start]?.key ?? null);
    if (!next && current === null && here !== null) onChange(here);
  };

  /** スライドショーの入り切り。始めるときは今出しているページの先頭を錨にする */
  const changePlaying = (next: boolean): void => {
    setPlaying(next);
    if (next) setAnchor(slides[start]?.key ?? null);
    if (next && current === null && here !== null) onChange(here);
  };

  const shown = held?.page ?? pageFrom(start);

  // 先読みは**手元へ写してから**、その中身で行う（`img` に渡すものと同じにする）
  const ensureImage = useOutputImagesStore((state) => state.ensure);
  const pageSources = async (page: readonly Slide[]): Promise<string[]> => {
    await Promise.all(
      page.map((slide) => ensureImage(baseUrl, slide.file, { until: slide.until })),
    );
    const images = useOutputImagesStore.getState().images;
    return page.flatMap((slide) => {
      const url = outputViewUrl(baseUrl, slide.file);
      const src = url === null ? null : outputSrc(images, url, slide.until);
      // 取れていない・接続先に無い画像は先読みしない
      return typeof src === 'string' ? [src] : [];
    });
  };

  /** **読み込みと復号を待ってから**入れ替える（空白を挟まない） */
  const show = (key: string, from: 'left' | 'right'): void => {
    void preloadImages(pageSources(pageOf(key))).then(() => {
      // 今出ている分は、入ってくる向きの反対へ送り出す
      setLeaving({
        kind: 'slide',
        slides: shown,
        to: from === 'left' ? 'right' : 'left',
        seq: motion.seq + 1,
      });
      setMotion({ kind: 'slide', from, seq: motion.seq + 1 });
      setHeld(null);
      // 送ったときだけ錨を置き直す（並びの区切りはここで決め直す）
      setAnchor(key);
      onChange(key);
    });
  };

  // 並べているときに押すと、その 1 枚を大きく出す。大きく出しているときに押すと並びに戻る
  // （戻る先は、その画像を含むページ）
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

  // スライドショー: 決まった間隔で新しい方へ 1 ページ送る（先頭では送らず、追従に任せる）。
  // **送るたびに数え直す**（手で送った・追従した直後に次が来ない。どのページも秒数だけ出す）。
  // 時計は**出している窓**のものを使う（別窓で見ている間は元の窓が隠れ、その時計は間引かれる）
  const tick = useEffectEvent((): void => move(-1));
  useEffect(() => {
    if (!playing) return;
    const clock = keyTarget ?? globalThis;
    const timer = clock.setInterval(tick, slideshowSeconds * MS_PER_SECOND);
    return () => clock.clearInterval(timer);
  }, [playing, slideshowSeconds, keyTarget, motion.seq]);

  // 動きが終わったら古い方を片付ける。**動きを減らす設定でも消える**よう時間で切る
  useEffect(() => {
    if (leaving === null) return;

    const timer = setTimeout(() => setLeaving(null), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  // 押さえた並びを、新しい画像の読み込みを待ってから押しのける。
  // 待つ間にさらに出たら、古い方の待ちは捨てる（最後の 1 回だけ動かす）
  const followRound = useRef(0);
  const pushIn = useEffectEvent((page: readonly Slide[], target: string): void => {
    const round = ++followRound.current;
    void preloadImages(pageSources(pageOf(target))).then(() => {
      if (round !== followRound.current) return;

      const shift = followShift(page, slides, perPage, Math.max(0, slideIndex(slides, target)));
      setLeaving({ kind: 'push', slides: page, shift, seq: motion.seq + 1 });
      setMotion({ kind: 'push', shift, seq: motion.seq + 1 });
      setHeld(null);
      // スライドショー中は錨も新しい先頭へ移す（追い付いたまま次も追いかける）
      setAnchor(target);
      onChange(target);
    });
  });

  useEffect(() => {
    if (held !== null) pushIn(held.page, held.target);
  }, [held]);

  const toggleActualSize = (): void => setActualSize((value) => !value);
  useViewerKeys(keyTarget, { move, close: onClose, toggleActualSize });

  // 行と列を変えたら、大きく見ていた 1 枚から並びに戻す
  const onGridChange: React.ComponentProps<typeof ViewerControls>['onGrid'] = (grid) => {
    setZoomed(false);
    setViewerGrid(grid);
  };

  const first = shown[0];
  const label = slideLabel(first);
  const canNewer = start > 0;
  const canOlder = start + perPage < slides.length;

  // 何枚目を見ているか。見出しの帯の送りの右に置く
  // 分母を押すと先頭（最新）のページへ送る
  const toFirst = (): void => {
    const key = slides[0]?.key;
    if (key !== undefined && start > 0) show(key, 'left');
  };
  const count = (
    <SlideCount total={slides.length} start={start} perPage={perPage} onFirst={toFirst} />
  );

  // 帯の操作。重ねでも別窓でも見出しの帯に並べる（中身は同じ）
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

  // 見出しの帯。埋め込みでも別窓でも同じものを出す（置き方だけが違う）
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
    // 画像を指している間は帯と送りの矢印を出す（`group/viewer`）
    <div
      className="group/viewer bg-background text-foreground relative flex h-full flex-col
        overflow-hidden"
    >
      {bar === 'header' ? header : null}
      {/* 画像と送りの矢印。見出しの帯があるときはその下の残りを使う */}
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

        {/* 送りの矢印。左右の端の縦の中ほどに重ね、帯と同じく指している間だけ出す。
         **送る先が無い向きは出さない** */}
        <SideArrows canNewer={canNewer} canOlder={canOlder} move={move} />
      </div>

      {/* 別窓は画像の上に重ね、画像を指すか焦点があるまでは沈めて表示の邪魔をしない */}
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

// ─────────────────────────────
// 追従・キー・見出しの文字。状態は `ViewerSurface` が持つ
// ─────────────────────────────

interface Held {
  readonly page: readonly Slide[];
  readonly target: string;
}

/**
 * 追従。新しい画像が出たら、**読み込み終わるまで今の並びを出しておく**（held）。
 * 先に並びへ入れてしまうと、一度出てから動き出すように見える。
 * 前の並びと比べるので、描画中に前回の値を持ち替える（副作用で追いかけない）
 */
function useFollowHold(
  slides: readonly Slide[],
  current: string | null,
  perPage: number,
  mode: {
    readonly follow: boolean;
    /** スライドショー中。追従は効かせず、先頭に追い付いていたときだけ追いかける */
    readonly playing: boolean;
    /** 出しているページの先頭の画像 */
    readonly anchor: string | null;
  },
): readonly [Held | null, (held: Held | null) => void] {
  const [seen, setSeen] = useState(slides);
  const [held, setHeld] = useState<Held | null>(null);

  if (seen !== slides) {
    setSeen(slides);
    // 追いかけている途中（読み込み待ち）なら、錨と見ている画像はまだ前のまま。
    // **行き先から数える**（前のままだと、続けて出たときに先頭の手前で止まる）
    const pending = held?.target ?? null;
    const was = pending ?? resolveSlide(seen, current);
    // 増える前に出していたページの先頭の位置。**同じ位置のまま**にすると、増えた枚数だけ送られる
    const from = anchoredStart(seen, pending ?? mode.anchor, was, perPage);
    const chase = mode.playing ? from === 0 : mode.follow;
    const target = slides[from]?.key;
    if (chase && target !== undefined && shouldFollow(slides, seen)) {
      // 続けて出たときは、最初に出していた並びを保ったまま行き先だけ差し替える
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

/** キーは**出している窓**で受ける（別ウィンドウならその窓） */
function useViewerKeys(keyTarget: Window | null, keys: ViewerKeys): void {
  const onKey = useEffectEvent((event: KeyboardEvent): void => {
    // 文字を打っている最中はキーを取らない（重ねて出すと入力欄が隣にある）
    if (isTextEntry(event.target) || event.target instanceof HTMLSelectElement) return;
    // 修飾キー付きはブラウザに任せる（Ctrl+F の検索・Ctrl+← の戻るなど）
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

/** 先頭の画像の番号と名前（読み上げ・指したときの説明） */
function slideLabel(first: Slide | undefined): string {
  if (first === undefined) return t('queue.dialog.noImages');
  return `${first.number === null ? '' : `#${String(first.number)} `}${first.file.filename}`;
}
