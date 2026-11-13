import { useDraggable } from '@dnd-kit/core';
import { Move, UserRound } from 'lucide-react';
import { useRef, useState } from 'react';

import { AvatarTools } from '@/components/llm/workspace/AvatarControls';
import { DRAG_ID } from '@/components/llm/workspace/chat-image-drag';
import {
  clampPercent,
  FOCUS_KEY_STEP,
  frameShape,
  ghostToolsRow,
  handle,
  HANDLE_SIGN,
  HANDLES,
  sideFrameWidth,
  WHEEL_TO_LOG,
  type HandleAt,
} from '@/components/llm/workspace/chat-image-style';
import { draggableAttributes } from '@/components/ui/drag-announcements';
import { useDragFrom } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';
import { panPercent, panReset, panTo } from '@/lib/pan';
import { KEYBOARD_RESIZE_STEP } from '@/lib/resize-step';
import { CHAT_MIN_HEIGHT } from '@/store/settings-fields/chat-image';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 会話の画面のアバターの枠と掴み。画像の枠（中央点・縦横）、背景、画像が無いときのアイコンの行。
// 置き場と枠の縦横は設定のストアが端末に残し、運ぶ操作は ChatImageLayout の DndContext が受ける。
// ─────────────────────────────

/** 上下の画像の枠の上に、会話の欄の高さの下限とは別に残す余白 */
const CHAT_TOP_ROOM = 8;

/** 押してから離すまでにこれより動いたら、押したとみなさない（ずらす操作） */
const TAP_TOLERANCE = 4;

/**
 * 会話のログと入力欄の幅（ChatWorkspace の max-w-3xl の 768px）に、ログのスクロールバー（6px）と
 * 隙間（6px）を足した幅。空の枠の左右はこの外にだけ置く（ghostSide の出す幅 908px はこれに GHOST_MIN × 2）
 */
const CHAT_LOG_WIDTH = 780;
/** 空の枠の幅の下限。右上のアイコン 2 つ（24px × 2 と間・地の余白）と、枠からの離れ・点線の太さ */
const GHOST_MIN = 64;

/** 画像の枠の props */
export interface ImageFrameProps {
  readonly chatId: string;
  /** 画像が無ければ null（空の枠） */
  readonly url: string | null;
  /** 左右のエリアに置いているか */
  readonly side: boolean;
}

/**
 * 画像の枠。掴んで置き場へ運ぶ。中はモデルのカードと同じく枠に詰めて切り取り、はみ出た所は指した位置へ
 * 寄せ、離れたら中央点へ戻す。動かさずに押すと、指した所を中央点にする。周りの 8 か所で縦横を変える。
 * 幅は会話の欄に最小幅を残す分まで（上下は欄の幅まで）で、縮めるときは縦横比を保つ。
 * 左右は高さをエリアに収める
 */
export function ImageFrame({ chatId, url, side }: ImageFrameProps): React.ReactElement {
  const width = useSettingsStore((state) => state.chatImageWidth);
  const height = useSettingsStore((state) => state.chatImageHeight);
  const focusX = useSettingsStore((state) => state.chatImageFocusX);
  const focusY = useSettingsStore((state) => state.chatImageFocusY);
  const label = t('llm.image.label');
  // 運ぶのは右上の移動のアイコンからだけ（画像の上は普通のカーソル）。枠は運ぶものの大きさに使う
  const { setNodeRef, setActivatorNodeRef, attributes, listeners } = useDraggable({
    id: DRAG_ID,
    data: { label },
    attributes: draggableAttributes(),
  });
  // 押した位置（動かしたら中央点にしない）
  const pressed = useRef<{ readonly x: number; readonly y: number } | null>(null);
  // 中央点を決めた所に出す輪（押すたびに作り直す。動きが終わったら外す）
  const [tap, setTap] = useState<{
    readonly x: number;
    readonly y: number;
    readonly key: number;
  } | null>(null);
  // 左右は会話の欄に最小幅と余白（24px）を残す。上下は欄の幅までで、会話の欄の高さの下限と上の余白
  // （8px）を残す高さを、縦横比で幅に直す
  // 画像が無い左右の枠は場所を取らないので、会話の欄の脇の空き（本文の幅 768px の外）に収める
  const room = `(100cqh - ${String(CHAT_MIN_HEIGHT + CHAT_TOP_ROOM)}px)`;
  const ghost = url === null;
  const limit = !side
    ? `100%, max(48px, calc(${room} * ${String(width)} / ${String(height)}))`
    : `max(${String(GHOST_MIN)}px, calc((100cqw - ${String(CHAT_LOG_WIDTH)}px) / 2))`;
  const onImageKeyDown = (event: React.KeyboardEvent<HTMLImageElement>): void => {
    const delta = FOCUS_KEY_STEP[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    useSettingsStore
      .getState()
      .setChatImageFocus(clampPercent(focusX + delta[0]), clampPercent(focusY + delta[1]));
  };
  const onImageMouseMove = (event: React.MouseEvent<HTMLImageElement>): void =>
    panTo(event.currentTarget, event.nativeEvent.offsetX, event.nativeEvent.offsetY);
  const onImageMouseLeave = (event: React.MouseEvent<HTMLImageElement>): void =>
    panReset(event.currentTarget);
  const onImageMouseDown = (event: React.MouseEvent<HTMLImageElement>): void => {
    pressed.current = { x: event.clientX, y: event.clientY };
  };
  const onImageClick = (event: React.MouseEvent<HTMLImageElement>): void => {
    const from = pressed.current;
    pressed.current = null;
    if (
      from === null ||
      Math.hypot(event.clientX - from.x, event.clientY - from.y) > TAP_TOLERANCE
    ) {
      return;
    }
    const image = event.currentTarget;
    const { offsetX, offsetY } = event.nativeEvent;
    useSettingsStore
      .getState()
      .setChatImageFocus(
        Number.parseFloat(panPercent(offsetX, image.clientWidth)),
        Number.parseFloat(panPercent(offsetY, image.clientHeight)),
      );
    // 押した所が中央点になったので、寄せた位置は外す
    panReset(image);
    setTap({ x: offsetX, y: offsetY, key: event.timeStamp });
  };
  const onTapEnd = (): void => setTap(null);
  return (
    <div
      ref={setNodeRef}
      className={frameShape({ ghost })}
      style={{
        // 画像のある左右の枠は、会話の欄の内側の余白と同じ幅（sideFrameWidth）
        width: side && !ghost ? sideFrameWidth(width, height) : `min(${String(width)}px, ${limit})`,
        aspectRatio: `${String(width)} / ${String(height)}`,
        maxHeight: side && ghost ? '100%' : undefined,
      }}
      role="group"
      aria-label={label}
      {...{ [WHEEL_TO_LOG]: '' }}
    >
      {url === null ? (
        <div className="text-muted-foreground flex size-full items-center justify-center">
          <UserRound className="size-5" aria-hidden />
        </div>
      ) : (
        <img
          src={url}
          // キーボードでも中央点を決められるように焦点を受ける（WCAG 2.1.1）。名前に今の中央点を含める
          alt={t('llm.image.focusPoint', {
            x: String(Math.round(focusX)),
            y: String(Math.round(focusY)),
          })}
          tabIndex={0}
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
          draggable={false}
          className="size-full object-cover"
          onKeyDown={onImageKeyDown}
          // 指していない間は中央点を見せる
          style={{
            objectPosition: `var(--pan-x, ${String(focusX)}%) var(--pan-y, ${String(focusY)}%)`,
          }}
          onMouseMove={onImageMouseMove}
          onMouseLeave={onImageMouseLeave}
          onMouseDown={onImageMouseDown}
          onClick={onImageClick}
        />
      )}
      {tap === null ? null : (
        <span
          key={tap.key}
          className="kisara-tap pointer-events-none absolute z-10 size-12 rounded-full border-2
            border-white bg-white/30 shadow-sm"
          style={{ left: tap.x, top: tap.y }}
          onAnimationEnd={onTapEnd}
          aria-hidden
        />
      )}
      {/* 右上の操作。指したときと焦点があるときだけ出す。移動は枠そのものを掴むのと同じ */}
      <div
        className="absolute top-1 right-1 z-20 rounded-md bg-background/60 p-0.5 opacity-0
          group-focus-within/frame:opacity-100 group-hover/frame:opacity-100"
      >
        <AvatarTools
          chatId={chatId}
          move={
            <button
              ref={setActivatorNodeRef}
              type="button"
              className="text-muted-foreground hover:text-foreground hover:bg-background/80
                inline-flex size-6 cursor-grab items-center justify-center rounded-sm"
              aria-label={t('llm.image.move')}
              title={t('llm.image.hint')}
              {...attributes}
              {...listeners}
            >
              <Move className="size-3.5" aria-hidden />
            </button>
          }
        />
      </div>
      {HANDLES.map((at) => (
        <ResizeHandle key={at} at={at} centered={!side} />
      ))}
    </div>
  );
}

/**
 * 枠の縦横を変える掴み。真ん中に揃えた向きは両側へ広がるので、動かした量の倍だけ変える
 * （掴んだ辺が指に付いてくる）。キーボードでは右下の掴みだけに止まり、矢印キーで変える
 */
function ResizeHandle({
  at,
  centered,
}: {
  readonly at: HandleAt;
  /** 横を真ん中に揃えているか（上下の置き場） */
  readonly centered: boolean;
}): React.ReactElement {
  const [sx, sy] = HANDLE_SIGN[at];
  const scale = centered ? 2 : 1;
  const drag = useDragFrom(
    () => {
      const { chatImageWidth, chatImageHeight } = useSettingsStore.getState();
      return { width: chatImageWidth, height: chatImageHeight };
    },
    (from, dx, dy) =>
      useSettingsStore
        .getState()
        .setChatImageSize(from.width + sx * scale * dx, from.height + sy * dy),
  );
  const keyboard = at === 'se';
  const width = useSettingsStore((state) => state.chatImageWidth);
  const height = useSettingsStore((state) => state.chatImageHeight);
  // 画像を運ぶ掴み（dnd-kit）に渡さない
  const stopPropagation = (event: React.SyntheticEvent): void => event.stopPropagation();
  const onHandleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const setSize = useSettingsStore.getState().setChatImageSize;
    if (event.key === 'ArrowLeft') setSize(width - KEYBOARD_RESIZE_STEP, height);
    else if (event.key === 'ArrowRight') setSize(width + KEYBOARD_RESIZE_STEP, height);
    else if (event.key === 'ArrowUp') setSize(width, height - KEYBOARD_RESIZE_STEP);
    else if (event.key === 'ArrowDown') setSize(width, height + KEYBOARD_RESIZE_STEP);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <div
      className={handle({ at })}
      {...(keyboard
        ? {
            role: 'group',
            tabIndex: 0,
            'aria-label': t('llm.image.frameSize', { width, height }),
            title: t('llm.image.frameHint'),
          }
        : { 'aria-hidden': true })}
      {...drag}
      onMouseDown={stopPropagation}
      onTouchStart={stopPropagation}
      onKeyDown={onHandleKeyDown}
    />
  );
}

/**
 * 会話の欄の背景。文字が読めるよう薄くし、中央点に寄せる。上端と下端はほかの表示域（左の列・右の列・
 * 入力欄の下）と揃える（上 8px・下 18px）
 */
export function BackgroundImage({ url }: { readonly url: string }): React.ReactElement {
  const focusX = useSettingsStore((state) => state.chatImageFocusX);
  const focusY = useSettingsStore((state) => state.chatImageFocusY);
  return (
    <img
      src={url}
      alt=""
      className="pointer-events-none absolute inset-x-0 top-column-top bottom-column-bottom w-full
        h-[calc(100%-var(--spacing-column-top)-var(--spacing-column-bottom))]
        rounded-md rounded-tr-none object-cover opacity-45"
      // 背景でも中央点を見せる
      style={{ objectPosition: `${String(focusX)}% ${String(focusY)}%` }}
    />
  );
}

/** 画像が無いときの、入力欄の上の端のアイコンの行の props */
export interface GhostToolsProps {
  readonly chatId: string;
  readonly place: 'left' | 'right';
}

/** 画像が無く脇の空きが狭いとき、入力欄の上の端に点線の枠とアイコン 2 つ（画像を選ぶ・移動）を出す */
export function GhostTools({ chatId, place }: GhostToolsProps): React.ReactElement {
  return (
    <div className="relative z-20 h-0 shrink-0">
      <div className={ghostToolsRow({ place })}>
        <div
          className="border-muted-foreground/60 pointer-events-auto rounded-md border-[3px]
            border-dotted p-0.5 opacity-0 transition-opacity focus-within:opacity-100
            hover:opacity-100"
          role="group"
          aria-label={t('llm.image.label')}
          {...{ [WHEEL_TO_LOG]: '' }}
        >
          <AvatarTools chatId={chatId} move={<MoveGrip id={`${DRAG_ID}-tools`} />} />
        </div>
      </div>
    </div>
  );
}

/** 背景にしている間、背景の右上のアイコンの並びに出す、置き場へ運ぶ掴み */
export function MoveGrip({ id = DRAG_ID }: { readonly id?: string }): React.ReactElement {
  const label = t('llm.image.label');
  const { setNodeRef, attributes, listeners } = useDraggable({
    id,
    data: { label },
    attributes: draggableAttributes(),
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      // 背景の上端（8px）から右と同じ 8px 空ける
      className="text-muted-foreground hover:text-foreground hover:bg-background/80 inline-flex
        size-6 cursor-grab items-center justify-center rounded-sm"
      aria-label={t('llm.image.move')}
      title={t('llm.image.hint')}
      {...attributes}
      {...listeners}
    >
      <Move className="size-3.5" aria-hidden />
    </button>
  );
}
