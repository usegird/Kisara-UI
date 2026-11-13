import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type KeyboardCoordinateGetter,
  type SensorDescriptor,
  type SensorOptions,
} from '@dnd-kit/core';
import { useCallback, useMemo, useRef } from 'react';

import { keyboardSlots, type DragPreview } from '@/components/comfy/flow/card-outline';
import { coordinateGetter, groupKeyOfSortId, sortListsOf } from '@/components/comfy/flow/flow-dnd';
import type { RectOf } from '@/components/comfy/flow/use-sort-collision';
import { MOUSE_ACTIVATION, TOUCH_ACTIVATION } from '@/components/ui/drag-activation';
import type { SortKey } from '@/graph/level-edit';

// ─────────────────────────────
// フロー画面のドラッグの感知。キーボードの並べ替えは当たり判定ではなく並びで数えて進める。
// ─────────────────────────────

/** キーボードの並べ替えで、上下キー 1 回に進める向き */
const ARROW_STEP: Readonly<Partial<Record<string, number>>> = { ArrowDown: 1, ArrowUp: -1 };

/** 並べ替えの id をストアの鍵にする。カードでもグループでもなければ null */
export function sortKeyOf(id: unknown): SortKey | null {
  if (typeof id === 'number') return id;
  const group = groupKeyOfSortId(id);
  return group === null ? null : { group };
}

type KeyboardArgs = Parameters<KeyboardCoordinateGetter>[1];

/** キーボードで進めている落とす先（掴んだときに並びから作る） */
interface KeyboardWalk {
  slots: ReturnType<typeof keyboardSlots> | null;
  at: number | null;
}

/** キーボードで落とす先を進める手立て（進め具合・見せ方・位置の引き方） */
interface KeyboardStepper {
  readonly walk: KeyboardWalk;
  readonly show: (next: DragPreview | null) => void;
  readonly rectOf: RectOf;
}

/** 落とす先の目安の位置（写しを近くへ動かす。判定には使わない） */
function besideRectId(beside: DragPreview['beside']): string | number {
  return typeof beside === 'number' ? beside : `group:${beside.group}`;
}

/**
 * 上下キー 1 回で、落とす先を並びの上で 1 つ進める。進めた先を `show` で見せ、
 * 写しを動かす先の座標を返す。位置で次の相手を探すと、背の高いカードを飛ばし、枠の先頭に止まれない
 */
function keyboardStep(
  event: KeyboardEvent,
  args: KeyboardArgs,
  { walk, show, rectOf }: KeyboardStepper,
): { x: number; y: number } | undefined {
  const step = ARROW_STEP[event.code] ?? 0;
  if (!event.code.startsWith('Arrow')) return undefined;
  event.preventDefault();
  const { active, collisionRect } = args.context;
  const id = sortKeyOf(active?.id);
  if (step === 0 || !active || !collisionRect || id === null) return undefined;

  walk.slots ??= keyboardSlots(sortListsOf(args.context), id);
  const { slots, home } = walk.slots;
  const at = Math.min(slots.length - 1, Math.max(0, (walk.at ?? home) + step));
  walk.at = at;
  const next = slots[at] ?? null;
  show(next);

  const target =
    next === null
      ? rectOf(active.id, active.rect.current.initial)
      : rectOf(besideRectId(next.beside), null);
  if (!target) return undefined;
  const x = collisionRect.left;
  if (next === null) return { x, y: target.top };
  // 落とす先の前なら相手の上端に、後ろなら下端に写しの中ほどを合わせる
  const half = collisionRect.height / 2;
  return { x, y: next.side === 'before' ? target.top - half : target.bottom - half };
}

/** 感知の設定と、キーボードで掴んでいるかの控え */
interface FlowSensors {
  readonly sensors: SensorDescriptor<SensorOptions>[];
  readonly isKeyboard: () => boolean;
  /** 掴み始め（`on` はキーボードで掴んだか）と掴み終わり（false）で、進め具合を空にする */
  readonly resetKeyboard: (on: boolean) => void;
}

/** フロー画面の DndContext に渡す感知を作る。受け取る手続きはどれも作り直さないもの */
export function useFlowSensors({
  isSorting,
  show,
  rectOf,
}: {
  readonly isSorting: () => boolean;
  readonly show: (next: DragPreview | null) => void;
  readonly rectOf: RectOf;
}): FlowSensors {
  // キーボードの並べ替えは、当たり判定ではなく並びで数えて進める（`keyboardStep`）
  const keyboard = useRef(false);
  const walk = useRef<KeyboardWalk>({ slots: null, at: null });
  // 感知の設定は作り直さない（どれも変わらない）
  const keyboardOptions = useMemo(() => {
    const getter: KeyboardCoordinateGetter = (event, args) =>
      isSorting()
        ? keyboardStep(event, args, { walk: walk.current, show, rectOf })
        : coordinateGetter(event, args);
    return { coordinateGetter: getter };
  }, [isSorting, show, rectOf]);

  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_ACTIVATION),
    useSensor(TouchSensor, TOUCH_ACTIVATION),
    useSensor(KeyboardSensor, keyboardOptions),
  );
  const isKeyboard = useCallback(() => keyboard.current, []);
  const resetKeyboard = useCallback((on: boolean): void => {
    keyboard.current = on;
    walk.current = { slots: null, at: null };
  }, []);

  return { sensors, isKeyboard, resetKeyboard };
}
