import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';

import { recordStat } from '@/lib/perf-stats';
import type { Point } from '@/lib/point';

const MEASURE_FALLBACK_MS = 100;

export interface AnchorRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly centerY: number;
}

export type Rects = ReadonlyMap<string, AnchorRect>;

export interface AnchorPositions {
  readonly rects: Rects;
}

export interface AnchorRegistry {
  readonly attachContainer: (element: HTMLElement | null) => void;
  readonly register: (key: string) => (element: HTMLElement | null) => void;
  readonly positions: StoreApi<AnchorPositions>;
  readonly remeasure: () => void;
  readonly localPoint: (clientX: number, clientY: number) => Point | null;
}

export function leftAnchor(rect: AnchorRect): Point {
  return { x: rect.left, y: rect.centerY };
}

export function rightAnchor(rect: AnchorRect): Point {
  return { x: rect.right, y: rect.centerY };
}

function sameRects(a: Rects, b: Rects): boolean {
  if (a.size !== b.size) return false;

  for (const [key, left] of a) {
    const right = b.get(key);
    if (!right) return false;
    if (left.left !== right.left || left.right !== right.right) return false;
    if (left.top !== right.top || left.bottom !== right.bottom) return false;
  }
  return true;
}

function measureRects(base: DOMRect, elements: ReadonlyMap<string, HTMLElement>): Rects {
  const next = new Map<string, AnchorRect>();

  for (const [key, element] of elements) {
    if (!element.isConnected) continue;

    const rect = element.getBoundingClientRect();
    const top = rect.top - base.top;
    const left = rect.left - base.left;

    next.set(key, {
      left,
      right: left + rect.width,
      top,
      bottom: top + rect.height,
      centerY: top + rect.height / 2,
    });
  }
  return next;
}

function swapElement(
  elements: Map<string, HTMLElement>,
  observer: ResizeObserver | null,
  key: string,
  element: HTMLElement | null,
): void {
  const previous = elements.get(key);
  if (previous) observer?.unobserve(previous);

  if (element === null) {
    elements.delete(key);
    return;
  }
  elements.set(key, element);
  observer?.observe(element);
}

function cancelFrame(pending: { raf: number; timer: number } | null): void {
  if (!pending) return;
  cancelAnimationFrame(pending.raf);
  clearTimeout(pending.timer);
}

function watchLayoutChanges(
  element: HTMLElement,
  schedule: () => void,
  isRegistered: (node: Node) => boolean,
): () => void {
  const onScroll = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (element.contains(target) || isRegistered(target)) schedule();
  };
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('resize', schedule);
  document.addEventListener('visibilitychange', schedule);
  schedule();
  return () => {
    window.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('resize', schedule);
    document.removeEventListener('visibilitychange', schedule);
  };
}

export function useAnchorRegistry(): AnchorRegistry {
  const elements = useRef(new Map<string, HTMLElement>());
  const [callbacks] = useState(() => new Map<string, (element: HTMLElement | null) => void>());
  const observer = useRef<ResizeObserver | null>(null);
  const frame = useRef<{ raf: number; timer: number } | null>(null);

  const container = useRef<HTMLElement | null>(null);
  const [containerVersion, setContainerVersion] = useState(0);
  const [positions] = useState(() => createStore<AnchorPositions>(() => ({ rects: new Map() })));

  const attachContainer = useCallback((element: HTMLElement | null) => {
    container.current = element;
    setContainerVersion((version) => version + 1);
  }, []);

  const measure = useCallback(() => {
    const base = container.current?.getBoundingClientRect();
    if (!base) return;
    recordStat('measure:anchors');
    const next = measureRects(base, elements.current);
    positions.setState((previous) =>
      sameRects(previous.rects, next) ? previous : { rects: next },
    );
  }, [positions]);

  const registered = useCallback((node: Node): boolean => {
    for (const element of elements.current.values()) if (element === node) return true;
    return false;
  }, []);

  const schedule = useCallback(() => {
    if (frame.current !== null) return;

    const run = (): void => {
      cancelFrame(frame.current);
      frame.current = null;
      measure();
    };
    frame.current = {
      raf: requestAnimationFrame(run),
      timer: window.setTimeout(run, MEASURE_FALLBACK_MS),
    };
  }, [measure]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver(schedule);
    observer.current = resizeObserver;
    resizeObserver.observe(element);
    for (const element of elements.current.values()) resizeObserver.observe(element);
    const unwatch = watchLayoutChanges(element, schedule, registered);

    return () => {
      observer.current = null;
      resizeObserver.disconnect();
      unwatch();
      cancelFrame(frame.current);
      frame.current = null;
    };
  }, [containerVersion, schedule, registered]);

  const register = useCallback(
    (key: string) => {
      const cached = callbacks.get(key);
      if (cached) return cached;

      const callback = (element: HTMLElement | null): void => {
        swapElement(elements.current, observer.current, key, element);
        schedule();
      };
      callbacks.set(key, callback);
      return callback;
    },
    [callbacks, schedule],
  );

  const localPoint = useCallback((clientX: number, clientY: number): Point | null => {
    const base = container.current?.getBoundingClientRect();
    return base ? { x: clientX - base.left, y: clientY - base.top } : null;
  }, []);

  return useMemo(
    () => ({ attachContainer, register, positions, remeasure: schedule, localPoint }),
    [attachContainer, register, positions, schedule, localPoint],
  );
}

export const selectAllRects = (rects: Rects): Rects => rects;

const NO_POSITIONS = createStore<AnchorPositions>(() => ({ rects: new Map() }));

export function useAnchorRects<T>(anchors: AnchorRegistry | null, select: (rects: Rects) => T): T {
  return useStore(anchors?.positions ?? NO_POSITIONS, (state) => select(state.rects));
}
