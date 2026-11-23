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

const ARROW_STEP: Readonly<Partial<Record<string, number>>> = { ArrowDown: 1, ArrowUp: -1 };

export function sortKeyOf(id: unknown): SortKey | null {
  if (typeof id === 'number') return id;
  const group = groupKeyOfSortId(id);
  return group === null ? null : { group };
}

type KeyboardArgs = Parameters<KeyboardCoordinateGetter>[1];

interface KeyboardWalk {
  slots: ReturnType<typeof keyboardSlots> | null;
  at: number | null;
}

interface KeyboardStepper {
  readonly walk: KeyboardWalk;
  readonly show: (next: DragPreview | null) => void;
  readonly rectOf: RectOf;
}

function besideRectId(beside: DragPreview['beside']): string | number {
  return typeof beside === 'number' ? beside : `group:${beside.group}`;
}

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
  const half = collisionRect.height / 2;
  return { x, y: next.side === 'before' ? target.top - half : target.bottom - half };
}

interface FlowSensors {
  readonly sensors: SensorDescriptor<SensorOptions>[];
  readonly isKeyboard: () => boolean;
  readonly resetKeyboard: (on: boolean) => void;
}

export function useFlowSensors({
  isSorting,
  show,
  rectOf,
}: {
  readonly isSorting: () => boolean;
  readonly show: (next: DragPreview | null) => void;
  readonly rectOf: RectOf;
}): FlowSensors {
  const keyboard = useRef(false);
  const walk = useRef<KeyboardWalk>({ slots: null, at: null });
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
