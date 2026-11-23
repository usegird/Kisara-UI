import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { NodeId } from '@/graph/types';
import { prefersReducedMotion } from '@/lib/host';
import { MOTION_MS } from '@/lib/motion';
import { useGraphStore } from '@/store/use-graph-store';

const NONE: readonly never[] = [];

const MOTION_GRACE_MS = 100;
const MOTION_LIMIT_MS = MOTION_MS + MOTION_GRACE_MS;

const FRAME_MS = 16;

export interface ItemMotion<K> {
  readonly entering: K | null;
  readonly leaving: K | null;
  readonly leavingKeys: readonly K[];
  readonly enter: (key: K) => void;
  readonly leave: (key: K, remove: () => void) => void;
  readonly leaveAll: (keys: readonly K[], remove: () => void) => void;
  readonly finish: (key: K) => void;
}

export interface CardMotion extends ItemMotion<NodeId> {
  readonly track: (add: () => void) => void;
}

function newestNodeId(): number | null {
  const last = useGraphStore.getState().workflow?.last_node_id;
  return typeof last === 'number' ? last : null;
}

function useMotionLoop(active: boolean, remeasure: () => void, done: () => void): void {
  useEffect(() => {
    if (!active) return;

    const timer = window.setInterval(remeasure, FRAME_MS);
    const stop = window.setTimeout(done, MOTION_LIMIT_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
      remeasure();
    };
  }, [active, remeasure, done]);
}

export function useItemMotion<K>(remeasure: () => void): ItemMotion<K> {
  const [entering, setEntering] = useState<K | null>(null);
  const [leavingKeys, setLeaving] = useState<readonly K[]>(NONE);
  const leaving = leavingKeys[0] ?? null;
  const removal = useRef<(() => void) | null>(null);

  const enter = useCallback((key: K) => setEntering(key), []);
  const endEntering = useCallback(() => setEntering(null), []);
  const endLeaving = useCallback(() => {
    const remove = removal.current;
    removal.current = null;
    remove?.();
    setLeaving(NONE);
  }, []);

  const leaveAll = useCallback(
    (keys: readonly K[], remove: () => void) => {
      if (removal.current) endLeaving();
      if (keys.length === 0 || prefersReducedMotion()) {
        remove();
        return;
      }
      removal.current = remove;
      setLeaving(keys);
    },
    [endLeaving],
  );
  const leave = (key: K, remove: () => void): void => leaveAll([key], remove);

  const finish = (key: K): void => {
    if (leavingKeys.includes(key)) endLeaving();
    else if (key === entering) endEntering();
  };

  useMotionLoop(entering !== null, remeasure, endEntering);
  useMotionLoop(leaving !== null, remeasure, endLeaving);

  return { entering, leaving, leavingKeys, enter, leave, leaveAll, finish };
}

export function useCardMotion(remeasure: () => void): CardMotion {
  const motion = useItemMotion<NodeId>(remeasure);
  const { enter } = motion;

  const track = useCallback(
    (add: () => void) => {
      const before = newestNodeId();
      add();
      const after = newestNodeId();
      if (after !== null && after !== before) enter(after);
    },
    [enter],
  );

  return { ...motion, track };
}

interface SwipeIn {
  readonly entering: boolean;
  readonly end: () => void;
}

export function useSwipeIn(present: boolean): SwipeIn {
  const [previous, setPrevious] = useState(present);
  const [entering, setEntering] = useState(false);
  if (present !== previous) {
    setPrevious(present);
    setEntering(present);
  }

  const end = useCallback(() => setEntering(false), []);
  useEffect(() => {
    if (!entering) return;
    const stop = window.setTimeout(end, MOTION_LIMIT_MS);
    return () => window.clearTimeout(stop);
  }, [entering, end]);

  return { entering, end };
}

interface SwipeOut {
  readonly leaving: boolean;
  readonly start: () => void;
  readonly end: () => void;
}

export function useSwipeOut(done: () => void): SwipeOut {
  const [leaving, setLeaving] = useState(false);
  const latest = useRef(done);
  const active = useRef(false);
  useEffect(() => {
    latest.current = done;
  }, [done]);

  const end = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    setLeaving(false);
    latest.current();
  }, []);

  const start = (): void => {
    if (prefersReducedMotion()) {
      latest.current();
      return;
    }
    active.current = true;
    setLeaving(true);
  };

  useEffect(() => {
    if (!leaving) return;
    const stop = window.setTimeout(end, MOTION_LIMIT_MS);
    return () => window.clearTimeout(stop);
  }, [leaving, end]);

  return { leaving, start, end };
}

interface CollapseMotion {
  readonly bodyShown: boolean;
  readonly headerCollapsed: boolean;
  readonly bodyRef: React.RefObject<HTMLDivElement | null>;
}

export function useCollapseMotion(collapsed: boolean, remeasure: () => void): CollapseMotion {
  const [previous, setPrevious] = useState(collapsed);
  const [moving, setMoving] = useState<'open' | 'close' | null>(null);
  if (collapsed !== previous) {
    setPrevious(collapsed);
    setMoving(collapsed ? 'close' : 'open');
  }
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (moving === null) return;

    const done = (): void => setMoving(null);
    if (!body || typeof body.animate !== 'function') {
      const stop = window.setTimeout(done, 0);
      return () => window.clearTimeout(stop);
    }

    const full = `${String(body.offsetHeight)}px`;
    body.style.overflow = 'hidden';
    const closed = { height: '0px' };
    const open = { height: full };
    const animation = body.animate(moving === 'close' ? [open, closed] : [closed, open], {
      duration: prefersReducedMotion() ? 0 : MOTION_MS,
      easing: 'ease-out',
      fill: 'forwards',
    });
    animation.onfinish = done;
    const timer = window.setInterval(remeasure, FRAME_MS);
    const stop = window.setTimeout(done, MOTION_LIMIT_MS);

    return () => {
      animation.onfinish = null;
      animation.cancel();
      body.style.overflow = '';
      window.clearInterval(timer);
      window.clearTimeout(stop);
      remeasure();
    };
  }, [moving, remeasure]);

  return {
    bodyShown: !collapsed || moving === 'close',
    headerCollapsed: collapsed && moving !== 'close',
    bodyRef,
  };
}
