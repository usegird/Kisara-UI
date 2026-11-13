import {
  closestCenter,
  KeyboardCode,
  pointerWithin,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type Modifier,
} from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';

import { CHAT_IMAGE_PLACES, type ChatImagePlace } from '@/store/settings-fields/chat-image';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 会話の画面のアバターを置き場へ運ぶ操作の決まり（dnd-kit に渡す、キーボードで隣の置き場へ跳ぶ・
// 運ぶ札をカーソルに合わせる・指している置き場を選ぶ）。
// ─────────────────────────────

/** 運ぶものの id（画像の枠と、背景の右下の掴み） */
export const DRAG_ID = 'chat-image';

/** 落とし先の並び（キーボードで隣へ跳ぶため）。真ん中が背景 */
const CELL: Readonly<Record<ChatImagePlace, readonly [number, number]>> = {
  left: [-1, 0],
  right: [1, 0],
  top: [0, -1],
  aboveInput: [0, 1],
  background: [0, 0],
};

const KEY_DIRECTION: Readonly<Partial<Record<string, readonly [number, number]>>> = {
  [KeyboardCode.Left]: [-1, 0],
  [KeyboardCode.Right]: [1, 0],
  [KeyboardCode.Up]: [0, -1],
  [KeyboardCode.Down]: [0, 1],
};

const step = (value: number, delta: number): number => Math.max(-1, Math.min(1, value + delta));

/** 矢印キーで、今いる落とし先の隣の落とし先の真ん中へ動かす */
export const jumpToZone: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const direction = KEY_DIRECTION[event.code];
  if (direction === undefined) return currentCoordinates;
  const current = CHAT_IMAGE_PLACES.find((place) => place === context.over?.id);
  const [x, y] = CELL[current ?? useSettingsStore.getState().chatImagePlace];
  const [dx, dy] = direction;
  // 縦に動くときは真ん中の列へ、横に動くときは真ん中の行へ寄せる
  const next = dx === 0 ? placeAt(0, step(y, dy)) : placeAt(step(x, dx), 0);
  const rect = context.droppableRects.get(next);
  if (rect === undefined) return currentCoordinates;
  event.preventDefault();
  const active = context.active?.rect.current.translated;
  return {
    x: rect.left + rect.width / 2 - (active?.width ?? 0) / 2,
    y: rect.top + rect.height / 2 - (active?.height ?? 0) / 2,
  };
};

/**
 * 運んでいる札の真ん中をカーソルに合わせる。札は画像の枠より小さく、そのままでは枠の左上を基準に
 * 動いてカーソルから離れる。キーボードで掴んだときは位置を持たないので動かさない
 */
export const centerOnCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  const point = activatorEvent === null ? null : getEventCoordinates(activatorEvent);
  if (point === null || draggingNodeRect === null) return transform;
  return {
    ...transform,
    x: transform.x + point.x - draggingNodeRect.left - draggingNodeRect.width / 2,
    y: transform.y + point.y - draggingNodeRect.top - draggingNodeRect.height / 2,
  };
};

/** ポインタなら指している落とし先、キーボードなら真ん中が近い落とし先 */
export const collision: CollisionDetection = (args) =>
  args.pointerCoordinates === null ? closestCenter(args) : pointerWithin(args);

function placeAt(x: number, y: number): ChatImagePlace {
  if (x < 0) return 'left';
  if (x > 0) return 'right';
  if (y < 0) return 'top';
  if (y > 0) return 'aboveInput';
  return 'background';
}
