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

// ─────────────────────────────
// 列の倍率のホイールとキーの受け口。どこの列かの判定と送り直しの基準は `useColumnZoom` が受ける。
// ─────────────────────────────

/** 受け口が読む判定。`optionsNow` は最新の判定を返す（購読し直さない） */
export interface ColumnZoomInput {
  readonly optionsNow: () => {
    readonly columnOf: (target: Element) => ZoomColumn | null;
    readonly columnAt: (clientX: number, clientY: number) => ZoomColumn | null;
    readonly unified: boolean;
  };
  /** 倍率を変える。`clientY` が null ならキーからの操作 */
  readonly change: (column: ZoomColumn, clientY: number | null, apply: () => void) => void;
}

interface PointerSpot {
  readonly target: Element;
  readonly x: number;
  readonly y: number;
}

/** 1 刻み動かす。3 列で 1 つなら、列によらず同じ値を動かす */
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

/**
 * ホイールを受ける（列を並べた枠の中だけ）。
 * 列の上ではページ全体の拡大縮小を止めるので、受け身でない購読で受ける（React の `onWheel` は
 * 受け身で既定の動きを止められない）。受け身でない購読は送りを待たせるので、列を並べた枠にだけ付ける
 */
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

      // 少しずつ届くもの（トラックパッド）を貯めて、一定量で 1 刻み
      const { direction, held } = accumulateWheel(wheel.current, column, wheelPixels(event));
      wheel.current = held;
      if (direction === 0) return;
      change(column, event.clientY, () => stepFor(optionsNow().unified, column, direction));
    };

    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [host, optionsNow, change]);
}

/** キーを受ける。対象は焦点がある列 → ポインタがある列 */
export function useZoomKeys(
  host: HTMLElement | null,
  { optionsNow, change }: ColumnZoomInput,
): void {
  /** 最後にポインタがあった所。キーの操作で対象の列を決めるのに使う */
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
      // 列の外（右の列など）に焦点があるなら、そちらの操作として素通しする
      if (focused instanceof Element && focused !== document.body && !focusedInside) return null;

      // ダイアログに焦点があるなら、ダイアログが自分で受ける
      if (focusedInside && insideOwnZoom(focused)) return null;
      const byFocus = focusedInside ? optionsNow().columnOf(focused) : null;
      if (byFocus !== null) return byFocus;

      const at = pointer.current;
      if (at === null || insideOwnZoom(at.target)) return null;
      return optionsNow().columnOf(at.target) ?? optionsNow().columnAt(at.x, at.y);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      // 広げ縮めは Alt＋`+` / `-`（Ctrl＋`+` / `-` はブラウザのものなので使わない）
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
