import { useCallback, useEffect, useRef } from 'react';

import { holdSettingsWrites } from '@/store/use-settings-store';

export interface DragHandlers {
  readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
}

export function useDragFrom<T>(
  origin: (event: React.PointerEvent<HTMLElement>) => T | null,
  onDrag: (from: T, dx: number, dy: number) => void,
): DragHandlers {
  const start = useRef<{ readonly x: number; readonly y: number; readonly from: T } | null>(null);
  const held = useRef<{ readonly element: HTMLElement; readonly pointerId: number } | null>(null);
  const escape = useRef<((event: KeyboardEvent) => void) | null>(null);
  const resumeWrites = useRef<(() => void) | null>(null);

  const release = useCallback((): void => {
    start.current = null;
    resumeWrites.current?.();
    resumeWrites.current = null;
    if (escape.current) document.removeEventListener('keydown', escape.current, true);
    escape.current = null;
    const current = held.current;
    held.current = null;
    if (current?.element.hasPointerCapture(current.pointerId)) {
      current.element.releasePointerCapture(current.pointerId);
    }
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return;
    const from = origin(event);
    if (from === null) return;

    release();
    start.current = { x: event.clientX, y: event.clientY, from };
    resumeWrites.current = holdSettingsWrites();
    held.current = { element: event.currentTarget, pointerId: event.pointerId };

    const onEscape = (key: KeyboardEvent): void => {
      if (key.key !== 'Escape') return;
      key.preventDefault();
      key.stopPropagation();
      release();
      onDrag(from, 0, 0);
    };
    escape.current = onEscape;
    document.addEventListener('keydown', onEscape, true);

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    const current = start.current;
    if (current === null) return;
    onDrag(current.from, event.clientX - current.x, event.clientY - current.y);
  };

  const onPointerUp = (): void => {
    if (start.current !== null) release();
  };

  useEffect(() => release, [release]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}
