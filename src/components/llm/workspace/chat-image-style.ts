import { cva } from 'class-variance-authority';

import { PERCENT } from '@/components/ui/units';
import type { MessageKey } from '@/i18n';
import { CHAT_MIN_WIDTH, type ChatImagePlace } from '@/store/settings-fields/chat-image';

// ─────────────────────────────
// 会話の画面のアバターの置き場と枠の見た目・大きさ。縮める大きさはコンテナの単位（cqw・cqh）で決め、
// 測る仕組みは足さない。
// ─────────────────────────────

/** 矢印キー 1 回で中央点を動かす量（%） */
const FOCUS_STEP = 5;

/** 左右の画像の枠の脇に、会話の欄の最小幅とは別に残す余白 */
const CHAT_SIDE_ROOM = 24;

/** 行で数えるホイールの 1 行の高さ */
const WHEEL_LINE_HEIGHT = 16;

/** 置き場の名前（落とし先の読み上げ） */
export const PLACE_LABEL: Readonly<Record<ChatImagePlace, MessageKey>> = {
  left: 'llm.image.place.left',
  right: 'llm.image.place.right',
  top: 'llm.image.place.top',
  aboveInput: 'llm.image.place.aboveInput',
  background: 'llm.image.place.background',
};

/** 画像の上の矢印キーで中央点を動かす量（%） */
export const FOCUS_KEY_STEP: Readonly<Partial<Record<string, readonly [number, number]>>> = {
  ArrowLeft: [-FOCUS_STEP, 0],
  ArrowRight: [FOCUS_STEP, 0],
  ArrowUp: [0, -FOCUS_STEP],
  ArrowDown: [0, FOCUS_STEP],
};

/** 画像・空の枠・アイコンの印。この上で回したホイールは会話のログに渡す */
export const WHEEL_TO_LOG = 'data-wheel-to-log';

// 落とし先の枠の上端と下端も、ほかの表示域と揃える（上 8px・下 18px）
export const zone = cva(
  'pointer-events-none absolute z-30 overflow-hidden rounded-lg border-2 border-dashed',
  {
    variants: {
      place: {
        left: 'top-column-top bottom-column-bottom left-2 w-1/5',
        right: 'top-column-top right-2 bottom-column-bottom w-1/5',
        top: 'top-column-top right-[22%] left-[22%] h-1/4',
        aboveInput: 'right-[22%] bottom-column-bottom left-[22%] h-1/4',
        background: 'top-[calc(25%+16px)] right-[22%] bottom-[calc(25%+16px)] left-[22%]',
      },
      over: {
        true: 'border-primary bg-primary/10',
        false: 'border-muted-foreground/40 bg-background/60',
      },
      shown: { true: '', false: 'invisible' },
    },
  },
);

/**
 * 左右のエリア。会話の欄の上に重ね（場所は会話のログと入力欄の内側の余白で空ける）、枠を下に揃える。
 * 上の余白は左の列の上端（8px）、下の余白は入力欄の下（18px）と揃える
 */
export const sideArea = cva(
  `pointer-events-none absolute inset-y-0 z-20 hidden flex-col justify-end pt-column-top
  pb-column-bottom md:flex`,
  {
    variants: { place: { left: 'left-0 items-start pl-2', right: 'right-0 items-end pr-4' } },
  },
);

/**
 * 左右に画像を置いたとき、会話のログと入力欄の内側に取る余白（画像の枠の幅と、外枠からの離れ）。
 * 幅の足りない画面（md 未満）では画像を出さないので取らない
 */
export const sidePad = cva('', {
  variants: {
    place: {
      left: 'md:[--chat-pad-l:calc(var(--chat-avatar-w)+0.5rem)]',
      right: 'md:[--chat-pad-r:calc(var(--chat-avatar-w)+1rem)]',
      none: '',
    },
  },
});

/**
 * 画像が無いときの左右の置き場。場所を取らずに会話の欄の上へ重ね、枠だけが指せる（下に揃える）。
 * 枠は本文と入力欄の脇の空きに収める（重ねない）。空きが右上のアイコン 2 つの幅（GHOST_MIN）を割る幅
 * では出さず、入力欄の上に枠とアイコンだけを出す（GhostTools）
 */
export const ghostSide = cva(
  `pointer-events-none absolute top-column-top bottom-column-bottom z-20 hidden flex-col justify-end
  @min-[908px]:flex`,
  { variants: { place: { left: 'left-2 items-start', right: 'right-4 items-end' } } },
);

/**
 * 画像の枠。角の丸みは会話の右の列（タスクペイン）の枠と同じ。画像が無いときは指したとき
 * （焦点があるとき）だけ太い点線で出す
 */
export const frameShape = cva('group/frame relative shrink-0 overflow-hidden rounded-md', {
  variants: {
    ghost: {
      true: `border-muted-foreground/60 pointer-events-auto border-[3px] border-dotted opacity-0
        transition-opacity focus-within:opacity-100 hover:opacity-100`,
      false: 'pointer-events-auto',
    },
  },
});

/** 枠の周りの掴み（上下左右と斜め）。指したときだけ見せる。キーで止まる右下は焦点の輪を出す */
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

/** 掴みの向き */
export type HandleAt = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** 掴みを動かした向きと、縦横の増える向き（右・下へ動かして広がるなら 1） */
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

/** 掴みの並び */
export const HANDLES = Object.keys(HANDLE_SIGN) as readonly HandleAt[];

/**
 * 画像が無く、左右の脇の空きが右上のアイコン 2 つを置けない幅のとき（GHOST_MIN）、入力欄の上の端に
 * 置く。指したとき（焦点があるとき）だけ、点線の枠とアイコン 2 つ（画像を選ぶ・移動）を出す。
 * 左右の枠は隠れても置いたままなので、運ぶものの id を分ける
 */
export const ghostToolsRow = cva(
  'pointer-events-none absolute inset-x-0 bottom-0 mx-auto flex max-w-3xl px-4 @min-[908px]:hidden',
  { variants: { place: { left: 'justify-start', right: 'justify-end' } } },
);

/** 中央点を 0〜100% に収める */
export const clampPercent = (value: number): number => Math.max(0, Math.min(PERCENT, value));

/**
 * 会話のログと入力欄の内側に余白を取る側。左右に画像を置いていればその側、無くてもカードを重ねて
 * いればカードの側（左に置いていれば左、ほかは右）
 */
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

/** 左右に置いた画像の枠の幅を、余白とカードの幅に使う変数にする */
export function avatarWidth(width: number, height: number): React.CSSProperties {
  return { '--chat-avatar-w': sideFrameWidth(width, height) } as React.CSSProperties;
}

/**
 * 左右に置いた画像の枠の幅。会話の欄に最小幅と余白（24px）を残し、高さはエリア（上下の余白を除く）に
 * 収める。外枠を大きさのコンテナにして、cqw・cqh で決める
 */
export function sideFrameWidth(width: number, height: number): string {
  const room = `(100cqh - var(--spacing-column-top) - var(--spacing-column-bottom))`;
  const byWidth = `max(48px, calc(100cqw - ${String(CHAT_MIN_WIDTH + CHAT_SIDE_ROOM)}px))`;
  const byHeight = `calc(${room} * ${String(width)} / ${String(height)})`;
  return `min(${String(width)}px, ${byWidth}, ${byHeight})`;
}

/** 画像・空の枠・アイコンの上で回したホイールを、会話のログに渡す（ログの外に重ねているため） */
export function forwardWheel(event: React.WheelEvent<HTMLElement>): void {
  if (!(event.target instanceof Element) || event.target.closest(`[${WHEEL_TO_LOG}]`) === null) {
    return;
  }
  const log = event.currentTarget.querySelector('[role="log"]');
  // 行で数えるホイールは 1 行を 16px とみなす
  const unit = event.deltaMode === 1 ? WHEEL_LINE_HEIGHT : 1;
  log?.scrollBy({ top: event.deltaY * unit, left: 0 });
}
