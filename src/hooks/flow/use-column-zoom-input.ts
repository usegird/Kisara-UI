import { useEffect, useRef } from 'react';

import {
  accumulateWheel,
  insideOwnZoom,
  wheelPixels,
  zoomKey,
  type WheelHeld,
} from '@/lib/zoom-input';
import type { ZoomColumn } from '@/store/settings-fields/column-zoom';
import { useSettingsStore } from '@/store/use-settings-store';

export interface ColumnZoomInput {
  readonly optionsNow: () => {
    readonly columnOf: (target: Element) => ZoomColumn | null;
    readonly columnAt: (clientX: number, clientY: number) => ZoomColumn | null;
    readonly unified: boolean;
  };
  readonly change: (column: ZoomColumn, clientY: number | null, apply: () => void) => void;
}

interface PointerSpot {
  readonly target: Element;
  readonly x: number;
  readonly y: number;
}

export function stepFor(unified: boolean, column: ZoomColumn, direction: number): void {
  const store = useSettingsStore.getState();
  if (unified) store.stepNarrowZoom(direction);
  else store.stepColumnZoom(column, direction);
}

function resetFor(unified: boolean, column: ZoomColumn): void {
  const store = useSettingsStore.getState();
  if (unified) store.resetNarrowZoom();
  else store.resetColumnZoom(column);
}

export function useZoomWheel(
  host: HTMLElement | null,
  { optionsNow, change }: ColumnZoomInput,
): void {
  const wheel = useRef<WheelHeld<ZoomColumn> | null>(null);

  useEffect(() => {
    if (host === null) return;

    const columnFor = (target: EventTarget | null, x: number, y: number): ZoomColumn | null => {
      if (!(target instanceof Element) || insideOwnZoom(target)) return null;
      return optionsNow().columnOf(target) ?? optionsNow().columnAt(x, y);
    };

    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      const column = columnFor(event.target, event.clientX, event.clientY);
      if (column === null) return;
      event.preventDefault();

      const { direction, held } = accumulateWheel(wheel.current, column, wheelPixels(event));
      wheel.current = held;
      if (direction === 0) return;
      change(column, event.clientY, () => stepFor(optionsNow().unified, column, direction));
    };

    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [host, optionsNow, change]);
}

export function useZoomKeys(
  host: HTMLElement | null,
  { optionsNow, change }: ColumnZoomInput,
): void {
  const pointer = useRef<PointerSpot | null>(null);

  useEffect(() => {
    if (host === null) return;

    const onPointerMove = (event: PointerEvent): void => {
      if (event.target instanceof Element) {
        pointer.current = { target: event.target, x: event.clientX, y: event.clientY };
      }
    };
    const onPointerLeave = (): void => {
      pointer.current = null;
    };

    host.addEventListener('pointermove', onPointerMove, { passive: true });
    host.addEventListener('pointerleave', onPointerLeave);
    return () => {
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [host]);

  useEffect(() => {
    if (host === null) return;

    const targetColumn = (): ZoomColumn | null => {
      const focused = document.activeElement;
      const focusedInside = focused instanceof Element && host.contains(focused);
      if (focused instanceof Element && focused !== document.body && !focusedInside) return null;

      if (focusedInside && insideOwnZoom(focused)) return null;
      const byFocus = focusedInside ? optionsNow().columnOf(focused) : null;
      if (byFocus !== null) return byFocus;

      const at = pointer.current;
      if (at === null || insideOwnZoom(at.target)) return null;
      return optionsNow().columnOf(at.target) ?? optionsNow().columnAt(at.x, at.y);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const key = zoomKey(event);
      if (key === null) return;

      const column = targetColumn();
      if (column === null) return;
      event.preventDefault();
      const unifiedNow = optionsNow().unified;
      change(column, null, () =>
        key === 'reset' ? resetFor(unifiedNow, column) : stepFor(unifiedNow, column, key),
      );
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [host, optionsNow, change]);
}
