import { cva } from 'class-variance-authority';

import { PERCENT } from '@/components/ui/units';
import type { MessageKey } from '@/i18n';
import {
  CHAT_MIN_HEIGHT,
  CHAT_MIN_WIDTH,
  type ChatImagePlace,
} from '@/store/settings-fields/chat-image';

const FOCUS_STEP = 5;

const CHAT_SIDE_ROOM = 24;

const CHAT_TOP_ROOM = 8;

const CHAT_LOG_WIDTH = 780;
const GHOST_MIN = 64;

const WHEEL_LINE_HEIGHT = 16;

export const PLACE_LABEL: Readonly<Record<ChatImagePlace, MessageKey>> = {
  left: 'llm.image.place.left',
  right: 'llm.image.place.right',
  top: 'llm.image.place.top',
  aboveInput: 'llm.image.place.aboveInput',
  background: 'llm.image.place.background',
};

export const FOCUS_KEY_STEP: Readonly<Partial<Record<string, readonly [number, number]>>> = {
  ArrowLeft: [-FOCUS_STEP, 0],
  ArrowRight: [FOCUS_STEP, 0],
  ArrowUp: [0, -FOCUS_STEP],
  ArrowDown: [0, FOCUS_STEP],
};

export const WHEEL_TO_LOG = 'data-wheel-to-log';

export const STACKED_ROW = `flex shrink-0 justify-center pt-2 pr-[calc(var(--chat-pad-r,0px)+1rem)]
  pl-[calc(var(--chat-pad-l,0px)+1rem)]`;

export const ZONE_FRAME = 'pointer-events-none absolute inset-0 z-30 flex';
export const ZONE_SIDE_STYLE: Readonly<Record<'left' | 'right', React.CSSProperties>> = {
  left: { position: 'relative', flex: '1 0 calc(var(--chat-pad-l, 0px) + 1rem)', minWidth: '40px' },
  right: {
    position: 'relative',
    flex: '1 0 calc(var(--chat-pad-r, 0px) + 1rem)',
    minWidth: '40px',
  },
};
export const SIDE_ZONE_STYLE: React.CSSProperties = { top: '20%' };
export const ZONE_CENTER_STYLE: React.CSSProperties = {
  position: 'relative',
  flex: '0 1 46rem',
  minWidth: 0,
};

export const zone = cva(
  'pointer-events-none absolute overflow-hidden rounded-lg border-2 border-dashed',
  {
    variants: {
      place: {
        left: 'bottom-column-bottom left-2 right-1',
        right: 'bottom-column-bottom left-1 right-2',
        top: 'top-column-top inset-x-0 h-1/4',
        aboveInput: 'bottom-column-bottom inset-x-0 h-1/4',
        background: 'top-[calc(25%+16px)] bottom-[calc(25%+16px)] inset-x-0',
      },
      over: {
        true: 'border-primary bg-primary/10',
        false: 'border-muted-foreground/40 bg-background/60',
      },
      shown: { true: '', false: 'invisible' },
    },
  },
);

export const sideArea = cva(
  `pointer-events-none absolute inset-y-0 z-20 hidden flex-col justify-end pt-column-top
  pb-column-bottom md:flex`,
  {
    variants: { place: { left: 'left-0 items-start pl-2', right: 'right-0 items-end pr-4' } },
  },
);

export const sidePad = cva('', {
  variants: {
    place: {
      left: 'md:[--chat-pad-l:calc(var(--chat-side-w)+0.5rem)]',
      right: 'md:[--chat-pad-r:calc(var(--chat-side-w)+1rem)]',
      none: '',
    },
  },
});

export const ghostSide = cva(
  `pointer-events-none absolute top-column-top bottom-column-bottom z-20 hidden flex-col justify-end
  @min-[908px]:flex`,
  { variants: { place: { left: 'left-2 items-start', right: 'right-4 items-end' } } },
);

export const frameShape = cva('group/frame relative shrink-0 overflow-hidden rounded-md', {
  variants: {
    ghost: {
      true: `border-muted-foreground/60 pointer-events-auto border-[3px] border-dotted opacity-0
        transition-opacity focus-within:opacity-100 hover:opacity-100`,
      false: 'pointer-events-auto',
    },
  },
});

export const handle = cva('absolute z-10', {
  variants: {
    at: {
      n: 'inset-x-3 top-0 h-2 cursor-ns-resize',
      s: 'inset-x-3 bottom-0 h-2 cursor-ns-resize',
      e: 'inset-y-3 right-0 w-2 cursor-ew-resize',
      w: 'inset-y-3 left-0 w-2 cursor-ew-resize',
      ne: 'top-0 right-0 size-3 cursor-nesw-resize',
      nw: 'top-0 left-0 size-3 cursor-nwse-resize',
      se: 'right-0 bottom-0 size-3 cursor-nwse-resize',
      sw: 'bottom-0 left-0 size-3 cursor-nesw-resize',
    },
  },
});

export type HandleAt = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLE_SIGN: Readonly<Record<HandleAt, readonly [number, number]>> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
  ne: [1, -1],
  nw: [-1, -1],
  se: [1, 1],
  sw: [-1, 1],
};

export const HANDLES = Object.keys(HANDLE_SIGN) as readonly HandleAt[];

export const ghostToolsRow = cva(
  'pointer-events-none absolute inset-x-0 bottom-0 mx-auto flex max-w-3xl px-4 @min-[908px]:hidden',
  { variants: { place: { left: 'justify-start', right: 'justify-end' } } },
);

export const clampPercent = (value: number): number => Math.max(0, Math.min(PERCENT, value));

export function padSide(
  hasImage: boolean,
  place: ChatImagePlace,
  cards: boolean,
): 'left' | 'right' | 'none' {
  const side = place === 'left' || place === 'right' ? place : null;
  if (hasImage && side !== null) return side;
  if (!cards) return 'none';
  return place === 'left' ? 'left' : 'right';
}

export function sidePadWidth(
  byImage: boolean,
  frame: { readonly width: number; readonly height: number },
  cardWidth: number,
): React.CSSProperties {
  const width = byImage ? sideFrameWidth(frame.width, frame.height) : `${String(cardWidth)}px`;
  return { '--chat-side-w': width } as React.CSSProperties;
}

export function frameStyle({
  side,
  ghost,
  width,
  height,
}: {
  readonly side: boolean;
  readonly ghost: boolean;
  readonly width: number;
  readonly height: number;
}): React.CSSProperties {
  const room = `(100cqh - ${String(CHAT_MIN_HEIGHT + CHAT_TOP_ROOM)}px)`;
  const limit = !side
    ? `100%, max(48px, calc(${room} * ${String(width)} / ${String(height)}))`
    : `max(${String(GHOST_MIN)}px, calc((100cqw - ${String(CHAT_LOG_WIDTH)}px) / 2))`;
  return {
    width: side && !ghost ? sideFrameWidth(width, height) : `min(${String(width)}px, ${limit})`,
    aspectRatio: `${String(width)} / ${String(height)}`,
    maxHeight: side && ghost ? '100%' : undefined,
  };
}

export function sideFrameWidth(width: number, height: number): string {
  const room = `(100cqh - var(--spacing-column-top) - var(--spacing-column-bottom))`;
  const byWidth = `max(48px, calc(100cqw - ${String(CHAT_MIN_WIDTH + CHAT_SIDE_ROOM)}px))`;
  const byHeight = `calc(${room} * ${String(width)} / ${String(height)})`;
  return `min(${String(width)}px, ${byWidth}, ${byHeight})`;
}

export function forwardWheel(event: React.WheelEvent<HTMLElement>): void {
  if (!(event.target instanceof Element) || event.target.closest(`[${WHEEL_TO_LOG}]`) === null) {
    return;
  }
  const log = event.currentTarget.querySelector('[role="log"]');
  const unit = event.deltaMode === 1 ? WHEEL_LINE_HEIGHT : 1;
  log?.scrollBy({ top: event.deltaY * unit, left: 0 });
}
