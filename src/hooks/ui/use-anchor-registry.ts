import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';

import { recordStat } from '@/lib/perf-stats';
import type { Point } from '@/lib/point';

// ─────────────────────────────
// 座標測定の唯一の仕組み。入力行・出力アンカー・変数ボックスを同じ台帳で測り、まとめて知らせる。
// input 用・output 用に別実装を作らない。
// ─────────────────────────────

/** requestAnimationFrame が来ないときに代わりに測るまでの待ち */
const MEASURE_FALLBACK_MS = 100;

/** 測った要素 1 つの位置 */
export interface AnchorRect {
  /** コンテナ左上を原点とした座標 */
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly centerY: number;
}

/** 登録の鍵ごとの測った位置 */
export type Rects = ReadonlyMap<string, AnchorRect>;

/**
 * 測った位置の入れ物。描画中は `useAnchorRects`、手続きの中では `getState()` で読む。
 * 位置はスクロールのたびに変わるので、登録の入口と分けて持つ（登録するだけの部品を描き直させない）。
 */
export interface AnchorPositions {
  readonly rects: Rects;
}

/** 入口はどれも作り直さない（受け取った部品を描き直させない） */
export interface AnchorRegistry {
  /** 測定の原点になる要素に付けるコールバック ref */
  readonly attachContainer: (element: HTMLElement | null) => void;
  /** 測りたい要素に付ける ref コールバックを返す */
  readonly register: (key: string) => (element: HTMLElement | null) => void;
  readonly positions: StoreApi<AnchorPositions>;
  readonly remeasure: () => void;
  /** 画面上の位置（`clientX` / `clientY`）を、測定の原点からの位置に直す。原点が無ければ null */
  readonly localPoint: (clientX: number, clientY: number) => Point | null;
}

/** 線を付ける左端の中央の点 */
export function leftAnchor(rect: AnchorRect): Point {
  return { x: rect.left, y: rect.centerY };
}

/** 線を付ける右端の中央の点 */
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

/** 要素を原点からの位置で測る。測れなくなった要素は飛ばす */
function measureRects(base: DOMRect, elements: ReadonlyMap<string, HTMLElement>): Rects {
  const next = new Map<string, AnchorRect>();

  for (const [key, element] of elements) {
    if (!element.isConnected) continue;

    // コンテナと要素は一緒に動くので、差分だけ取ればスクロールに影響されない
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

/** 鍵の要素を差し替え、見張りも付け替える */
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
  // 後から現れた要素（並べ替え・ノード追加）も測定対象に含める
  observer?.observe(element);
}

/** 予約した 1 回分の測定を取り消す */
function cancelFrame(pending: { raf: number; timer: number } | null): void {
  if (!pending) return;
  cancelAnimationFrame(pending.raf);
  clearTimeout(pending.timer);
}

/**
 * 送り・大きさの変化・表示に戻ったときに測り直しを予約する。戻り値で外す
 * @param isRegistered - 測っている要素か（送りの枠を測っているとき、その送りで測り直すため）
 */
function watchLayoutChanges(
  element: HTMLElement,
  schedule: () => void,
  isRegistered: (node: Node) => boolean,
): () => void {
  // 原点の中のどこでスクロールしても測り直せるようキャプチャ段階で拾う。
  // 原点の外（右の列・ダイアログの一覧・ページ全体）のスクロールでは相対位置が変わらないので測らない。
  // ただし**測っている要素そのものが送られた**ときは測る（狭い画面では原点を包む送りの枠が
  // 線の見える範囲になり、送るたびに原点との位置がずれる）
  const onScroll = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (element.contains(target) || isRegistered(target)) schedule();
  };
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('resize', schedule);
  // 非表示中は測定が遅れるので、表示に戻ったら測り直す
  document.addEventListener('visibilitychange', schedule);
  schedule();
  return () => {
    window.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('resize', schedule);
    document.removeEventListener('visibilitychange', schedule);
  };
}

/** 原点の要素と測る要素を登録させ、まとめて測った位置を返す台帳を作る */
export function useAnchorRegistry(): AnchorRegistry {
  const elements = useRef(new Map<string, HTMLElement>());
  // 描画中に参照するので ref ではなく state で保持する（ref の描画中読み取りは禁止）
  const [callbacks] = useState(() => new Map<string, (element: HTMLElement | null) => void>());
  const observer = useRef<ResizeObserver | null>(null);
  const frame = useRef<{ raf: number; timer: number } | null>(null);

  // 原点の要素は ref で持つ（measure を再生成させないため）。
  // state は「要素が入れ替わったので購読し直す」合図としてだけ使う。
  const container = useRef<HTMLElement | null>(null);
  const [containerVersion, setContainerVersion] = useState(0);
  const [positions] = useState(() => createStore<AnchorPositions>(() => ({ rects: new Map() })));

  // 原点はコールバック ref で受ける（描画後に現れる場合でも測り始められるように）。
  // このフックの手続きと戻り値はすべて手で固定する。ref のコールバックと、ここと使う側の effect の
  // 依存になるため（作り直すと付け外しと見張りの張り直しが起き、測り直しの輪に入る）
  const attachContainer = useCallback((element: HTMLElement | null) => {
    container.current = element;
    setContainerVersion((version) => version + 1);
  }, []);

  const measure = useCallback(() => {
    const base = container.current?.getBoundingClientRect();
    if (!base) return;
    // 測った回数。要らない測り直しはここに表れる
    recordStat('measure:anchors');
    const next = measureRects(base, elements.current);
    // 結果が同じなら知らせない（変わっていない測定で描き直しを起こさない）
    positions.setState((previous) =>
      sameRects(previous.rects, next) ? previous : { rects: next },
    );
  }, [positions]);

  /** 測っている要素か（送りの枠を測っているとき、その送りで測り直すため） */
  const registered = useCallback((node: Node): boolean => {
    for (const element of elements.current.values()) if (element === node) return true;
    return false;
  }, []);

  /**
   * 1フレームに1回だけ測る（スクロール中に測り直しが積み上がらないように）。
   *
   * requestAnimationFrame は**発火しないことがある**（非表示タブ・背面タブ・省電力）。
   * 発火待ちのフラグで次の予約を止めているので、来なかったときに測定が永久に止まる。
   * そこで rAF とタイマーを**両方**仕掛け、先に来たほうで測ってもう一方を捨てる。
   */
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

  // 要素ごとの ref コールバックは鍵ごとに使い回す（毎回作ると React が付け外しを繰り返し、
  // 測定と描き直しの輪に入る）
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

  // 押した位置を線と同じ座標で扱うため（測る仕組みはここ 1 本に留める）
  const localPoint = useCallback((clientX: number, clientY: number): Point | null => {
    const base = container.current?.getBoundingClientRect();
    return base ? { x: clientX - base.left, y: clientY - base.top } : null;
  }, []);

  return useMemo(
    () => ({ attachContainer, register, positions, remeasure: schedule, localPoint }),
    [attachContainer, register, positions, schedule, localPoint],
  );
}

/** 全部の位置を受け取る（線と変数の列のように、位置の変化にすべて追従する部品だけ） */
export const selectAllRects = (rects: Rects): Rects => rects;

const NO_POSITIONS = createStore<AnchorPositions>(() => ({ rects: new Map() }));

/**
 * 測った位置を絞って購読する。**選んだ値が変わったときだけ**描き直す。
 * 配列やオブジェクトを返すときは `useShallow` で包む
 */
export function useAnchorRects<T>(anchors: AnchorRegistry | null, select: (rects: Rects) => T): T {
  return useStore(anchors?.positions ?? NO_POSITIONS, (state) => select(state.rects));
}
