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

export const DRAG_ID = 'chat-image';

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

export const jumpToZone: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const direction = KEY_DIRECTION[event.code];
  if (direction === undefined) return currentCoordinates;
  const current = CHAT_IMAGE_PLACES.find((place) => place === context.over?.id);
  const [x, y] = CELL[current ?? useSettingsStore.getState().chatImagePlace];
  const [dx, dy] = direction;
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

export const centerOnCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  const point = activatorEvent === null ? null : getEventCoordinates(activatorEvent);
  if (point === null || draggingNodeRect === null) return transform;
  return {
    ...transform,
    x: transform.x + point.x - draggingNodeRect.left - draggingNodeRect.width / 2,
    y: transform.y + point.y - draggingNodeRect.top - draggingNodeRect.height / 2,
  };
};

export const collision: CollisionDetection = (args) =>
  args.pointerCoordinates === null ? closestCenter(args) : pointerWithin(args);

function placeAt(x: number, y: number): ChatImagePlace {
  if (x < 0) return 'left';
  if (x > 0) return 'right';
  if (y < 0) return 'top';
  if (y > 0) return 'aboveInput';
  return 'background';
}
