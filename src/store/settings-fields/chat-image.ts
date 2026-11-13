import { normalizeInRange } from '@/lib/clamp';

// ─────────────────────────────
// 会話の画面のプリセットの画像（アバター）の置き場と大きさ。設定のストアが端末に残す。
// 読めない値は既定に落とす。
// ─────────────────────────────

/** 画像の置き場。会話の欄の左・右、会話の欄の上、入力欄の上、会話の欄の背景 */
export type ChatImagePlace = 'left' | 'right' | 'top' | 'aboveInput' | 'background';

export const CHAT_IMAGE_PLACES: readonly ChatImagePlace[] = [
  'left',
  'right',
  'top',
  'aboveInput',
  'background',
];

/** 画像の枠の縦横（px） */
export const CHAT_IMAGE_SIZE = { min: 48, max: 1600, width: 320, height: 480 } as const;

/** 会話の欄の最小幅（px）。左右の画像はこれを割らないよう縮める */
export const CHAT_MIN_WIDTH = 360;

/**
 * 上下の画像を置いても会話の欄に残す高さ（px）。会話のログの下限（200px）と、入力欄とその余白の分
 * （3 行の入力欄で約 160px）を足したもの
 */
/** 中央点の上限（%） */
const MAX_IMAGE_FOCUS = 100;
/** 中央点を丸める刻みの逆数（0.1 刻み） */
const FOCUS_STEPS_PER_PERCENT = 10;

export const CHAT_MIN_HEIGHT = 360;

/** 画像の中央点（枠に詰めたときに見せる位置。object-position の %）の既定 */
export const CHAT_IMAGE_FOCUS = 50;

/** 中央点を 0〜100 に収める。数でなければ真ん中 */
export function normalizeChatImageFocus(value: unknown): number {
  const focus = normalizeInRange(value, {
    initial: CHAT_IMAGE_FOCUS,
    min: 0,
    max: MAX_IMAGE_FOCUS,
  });
  // 0.1 刻みに丸める（既定の 50 は丸めても変わらない）
  return Math.round(focus * FOCUS_STEPS_PER_PERCENT) / FOCUS_STEPS_PER_PERCENT;
}

/** 保存値を置き場に読み戻す。知らない値なら右 */
export function normalizeChatImagePlace(value: unknown): ChatImagePlace {
  return CHAT_IMAGE_PLACES.find((place) => place === value) ?? 'right';
}

/** 範囲に収める。数でなければ `fallback` */
export function normalizeChatImageSize(value: unknown, fallback: number): number {
  // 上下限が整数なので、丸めてから収めても収めてから丸めても同じ値になる
  return normalizeInRange(
    value,
    { initial: fallback, min: CHAT_IMAGE_SIZE.min, max: CHAT_IMAGE_SIZE.max },
    { round: true },
  );
}

/** 置き場の向き。左右は縦長、上下は横長に収まる。背景は向きを持たない */
function axisOf(place: ChatImagePlace): 'side' | 'band' | null {
  if (place === 'left' || place === 'right') return 'side';
  return place === 'background' ? null : 'band';
}

/**
 * 置き場を移したあとの枠の縦横。左右と上下の間で移すと縦横を入れ替え、背景から移すときは左右なら
 * 長い方を縦に、上下なら長い方を横にする。背景へ移すとき・同じ向きの間ではそのまま
 */
export function chatImageSizeAfterMove(
  from: ChatImagePlace,
  to: ChatImagePlace,
  size: { readonly width: number; readonly height: number },
): { readonly width: number; readonly height: number } {
  const before = axisOf(from);
  const after = axisOf(to);
  const { width, height } = size;
  if (after === null || before === after) return size;
  if (before !== null) return { width: height, height: width };
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  return after === 'side' ? { width: short, height: long } : { width: long, height: short };
}
