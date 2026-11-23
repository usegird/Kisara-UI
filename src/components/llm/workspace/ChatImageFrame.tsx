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

const CHAT_TOP_ROOM = 8;

const TAP_TOLERANCE = 4;

const CHAT_LOG_WIDTH = 780;
const GHOST_MIN = 64;

export interface ImageFrameProps {
  readonly chatId: string;
  readonly url: string | null;
  readonly side: boolean;
}

export function ImageFrame({ chatId, url, side }: ImageFrameProps): React.ReactElement {
  const width = useSettingsStore((state) => state.chatImageWidth);
  const height = useSettingsStore((state) => state.chatImageHeight);
  const focusX = useSettingsStore((state) => state.chatImageFocusX);
  const focusY = useSettingsStore((state) => state.chatImageFocusY);
  const label = t('llm.image.label');
  const { setNodeRef, setActivatorNodeRef, attributes, listeners } = useDraggable({
    id: DRAG_ID,
    data: { label },
    attributes: draggableAttributes(),
  });
  const pressed = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const [tap, setTap] = useState<{
    readonly x: number;
    readonly y: number;
    readonly key: number;
  } | null>(null);
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
    panReset(image);
    setTap({ x: offsetX, y: offsetY, key: event.timeStamp });
  };
  const onTapEnd = (): void => setTap(null);
  return (
    <div
      ref={setNodeRef}
      className={frameShape({ ghost })}
      style={{
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
          alt={t('llm.image.focusPoint', {
            x: String(Math.round(focusX)),
            y: String(Math.round(focusY)),
          })}
          tabIndex={0}
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
          draggable={false}
          className="size-full object-cover"
          onKeyDown={onImageKeyDown}
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

function ResizeHandle({
  at,
  centered,
}: {
  readonly at: HandleAt;
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
      style={{ objectPosition: `${String(focusX)}% ${String(focusY)}%` }}
    />
  );
}

export interface GhostToolsProps {
  readonly chatId: string;
  readonly place: 'left' | 'right';
}

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
