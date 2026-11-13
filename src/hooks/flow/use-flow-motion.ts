import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { NodeId } from '@/graph/types';
import { prefersReducedMotion } from '@/lib/host';
import { MOTION_MS } from '@/lib/motion';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// カード・アプリ入力の枠・チップの滑り込みと抜け出しと、折りたたみの開閉の動き。
// 開いたとき・取り消しでは動かさない（ここを通らないため）。
// ─────────────────────────────

/** 抜けていくものが無いとき（毎回同じ配列を使い、描き直さない） */
const NONE: readonly never[] = [];

/** 動きの長さに足す待ちの余裕 */
const MOTION_GRACE_MS = 100;
/** 終わりの知らせ（animationend）を待つ上限。来なくてもここで終える */
const MOTION_LIMIT_MS = MOTION_MS + MOTION_GRACE_MS;

/** 測り直しの間隔（ms）。1 フレームほど */
const FRAME_MS = 16;

/** 並びの 1 つを滑り込ませる・抜けさせる状態と手続き */
export interface ItemMotion<K> {
  /** 滑り込んでいるもの。無ければ null */
  readonly entering: K | null;
  /** 抜けていくもの。無ければ null（まとめて抜けるときは先頭） */
  readonly leaving: K | null;
  /**
   * 抜けていくもの全部（まとめて消すとき）。
   */
  readonly leavingKeys: readonly K[];
  /** 滑り込ませる（足し終わったあとに呼ぶ） */
  readonly enter: (key: K) => void;
  /** 右へ抜けさせてから `remove` を呼ぶ。動きを減らす設定ならすぐ呼ぶ */
  readonly leave: (key: K, remove: () => void) => void;
  /** まとめて右へ抜けさせてから `remove` を 1 回呼ぶ */
  readonly leaveAll: (keys: readonly K[], remove: () => void) => void;
  /** そのものの動きが終わった（`animationend`） */
  readonly finish: (key: K) => void;
}

/** カードの動きに、足す操作を包む手続きを加えたもの */
export interface CardMotion extends ItemMotion<NodeId> {
  /** 足す操作を包む。操作でノードが増えたら、その新しいカードを滑り込ませる */
  readonly track: (add: () => void) => void;
}

function newestNodeId(): number | null {
  const last = useGraphStore.getState().workflow?.last_node_id;
  return typeof last === 'number' ? last : null;
}

/**
 * 動いている間だけ測り直しを続け、上限の時間が来たら `done` を呼ぶ。
 * 測定の仕組みは大きさとスクロールの変化しか拾わないので、動く間の位置はここで追う。
 */
function useMotionLoop(active: boolean, remeasure: () => void, done: () => void): void {
  useEffect(() => {
    if (!active) return;

    // requestAnimationFrame は背面では止まることがあるので時間で回す
    const timer = window.setInterval(remeasure, FRAME_MS);
    const stop = window.setTimeout(done, MOTION_LIMIT_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
      remeasure();
    };
  }, [active, remeasure, done]);
}

/**
 * 並びの 1 つ（ノードのカード・アプリ入力の枠）を滑り込ませる・抜けさせる。
 * 同時に動かすのは入る 1 つと、抜ける 1 回（まとめて消すなら何枚でも）まで
 */
export function useItemMotion<K>(remeasure: () => void): ItemMotion<K> {
  const [entering, setEntering] = useState<K | null>(null);
  const [leavingKeys, setLeaving] = useState<readonly K[]>(NONE);
  const leaving = leavingKeys[0] ?? null;
  /** 抜け終わったら外す手続き */
  const removal = useRef<(() => void) | null>(null);

  // 終わりの手続きは動きの間の timer（effect）の依存になり、作り直すと timer が始め直しになる。
  // `leaveAll` と `enter` は、キーの受け口（effect）が依存する消す・足す手続きの元になる。
  // どれも正しさに要るので compiler に任せず手で固定する
  const enter = useCallback((key: K) => setEntering(key), []);
  const endEntering = useCallback(() => setEntering(null), []);
  const endLeaving = useCallback(() => {
    const remove = removal.current;
    removal.current = null;
    // 先に外してから動きの印を消す（印だけ先に消えて 1 コマ見えることがないように）
    remove?.();
    setLeaving(NONE);
  }, []);

  const leaveAll = useCallback(
    (keys: readonly K[], remove: () => void) => {
      // 前のものがまだ抜けている途中なら、先に外し切る
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
    // まとめて抜けるものは同時に動き出すので、最初に終わったもので全部を外す
    if (leavingKeys.includes(key)) endLeaving();
    else if (key === entering) endEntering();
  };

  useMotionLoop(entering !== null, remeasure, endEntering);
  useMotionLoop(leaving !== null, remeasure, endLeaving);

  return { entering, leaving, leavingKeys, enter, leave, leaveAll, finish };
}

/** カードの滑り込みと抜け出しを扱い、足す操作で増えた新しいカードを滑り込ませる */
export function useCardMotion(remeasure: () => void): CardMotion {
  const motion = useItemMotion<NodeId>(remeasure);
  const { enter } = motion;

  // 貼り付けの受け口（effect）が依存する手続きの元になるので、手で固定する
  const track = useCallback(
    (add: () => void) => {
      const before = newestNodeId();
      add();
      // 繋ぎ先を尋ねるときなど、まだ足していなければ何もしない
      const after = newestNodeId();
      if (after !== null && after !== before) enter(after);
    },
    [enter],
  );

  return { ...motion, track };
}

// ─────────────────────────────
// カードの中の小さな部品（パラメータのチップ）の滑り込みと抜け出し。
// チップは行の中で動くだけで線の端（行の印）は動かないので、測り直しはしない。
// ─────────────────────────────

/** 滑り込みの途中かと、終わりの知らせ */
interface SwipeIn {
  /** 滑り込んでいる途中 */
  readonly entering: boolean;
  /** 動きが終わった（`animationend`） */
  readonly end: () => void;
}

/**
 * 描いたあとで `present` が真になったら滑り込ませる。最初から真なら動かさない
 * （ワークフローを開いたときは動かさない）
 */
export function useSwipeIn(present: boolean): SwipeIn {
  const [previous, setPrevious] = useState(present);
  const [entering, setEntering] = useState(false);
  // 前の描画と比べて現れたかを描画中に決める（React の「前の値から状態を調整する」形）
  if (present !== previous) {
    setPrevious(present);
    setEntering(present);
  }

  // 上限の timer（effect）の依存。作り直すと timer が始め直しになるので手で固定する
  const end = useCallback(() => setEntering(false), []);
  // 動きを減らす設定などで animationend が来なくても終える
  useEffect(() => {
    if (!entering) return;
    const stop = window.setTimeout(end, MOTION_LIMIT_MS);
    return () => window.clearTimeout(stop);
  }, [entering, end]);

  return { entering, end };
}

/** 抜け出しの途中かと、始める・終える手続き */
interface SwipeOut {
  /** 抜けている途中 */
  readonly leaving: boolean;
  /** 抜けさせ始める。動きを減らす設定ならすぐ `done` を呼ぶ */
  readonly start: () => void;
  /** 動きが終わった（`animationend`）。`done` を呼ぶ */
  readonly end: () => void;
}

/** 右へ抜けさせてから `done` を呼ぶ（1 回だけ） */
export function useSwipeOut(done: () => void): SwipeOut {
  const [leaving, setLeaving] = useState(false);
  const latest = useRef(done);
  /** 抜けている途中か。終わりの知らせと上限の時間の両方が来ても `done` は 1 回だけ */
  const active = useRef(false);
  useEffect(() => {
    latest.current = done;
  }, [done]);

  // 上限の timer（effect）の依存。作り直すと timer が始め直しになるので手で固定する
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

// ─────────────────────────────
// 折りたたみの開閉。本体（行と下部の欄）の高さを上下に動かす。
// 高さは中身で決まる（auto）ため、CSS の遷移ではなく Web Animations で px を動かす。
// ─────────────────────────────

/**
 * 折りたたみの開閉の途中の見た目。見出しの見た目（出力を見出しへ寄せる）は閉じ終わってから
 * 切り替える（同じ出力アンカーが 2 か所に出ないように）。
 */
interface CollapseMotion {
  /** 本体を描くか（閉じている途中も描く） */
  readonly bodyShown: boolean;
  /** 見出しを折りたたみの見た目にするか（閉じ終わってから真） */
  readonly headerCollapsed: boolean;
  /** 本体の枠に付ける */
  readonly bodyRef: React.RefObject<HTMLDivElement | null>;
}

/** 折りたたみの切り替えで本体の高さを動かす。下のカードも動くので、動く間は測り直しを続ける */
export function useCollapseMotion(collapsed: boolean, remeasure: () => void): CollapseMotion {
  const [previous, setPrevious] = useState(collapsed);
  const [moving, setMoving] = useState<'open' | 'close' | null>(null);
  // 切り替わったかを描画中に決める（最初の描画では動かさない）
  if (collapsed !== previous) {
    setPrevious(collapsed);
    setMoving(collapsed ? 'close' : 'open');
  }
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (moving === null) return;

    const done = (): void => setMoving(null);
    // 動かせない（本体が無い・Web Animations が無い）ときはすぐ終える
    if (!body || typeof body.animate !== 'function') {
      const stop = window.setTimeout(done, 0);
      return () => window.clearTimeout(stop);
    }

    // 描いた高さ（はみ出しは含めない。終わったあと auto に戻しても跳ねない）
    const full = `${String(body.offsetHeight)}px`;
    body.style.overflow = 'hidden';
    const closed = { height: '0px' };
    const open = { height: full };
    const animation = body.animate(moving === 'close' ? [open, closed] : [closed, open], {
      duration: prefersReducedMotion() ? 0 : MOTION_MS,
      easing: 'ease-out',
      // 終わった形を保つ。保たないと、閉じ終わってから本体を外すまでの 1 コマだけ元の高さに戻る
      fill: 'forwards',
    });
    animation.onfinish = done;
    const timer = window.setInterval(remeasure, FRAME_MS);
    // 背面などで終わりの知らせが来なくても終える
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
