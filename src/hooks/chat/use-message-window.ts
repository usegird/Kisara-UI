import { useEffect, useState } from 'react';

// ─────────────────────────────
// 長い会話のログで、一度に描く発言の範囲を決める。
// 目印の監視を持たない環境では全部描く（機能を落として動かす）。
// ─────────────────────────────

/** 一度に描き足す発言の件数の既定 */
const DEFAULT_WINDOW_STEP = 20;

/** 先読みの余白（px）。端に着く少し手前で足し、ブラウザの位置の保持が効くうちに入れ替える */
const NEAR_PX = 400;
const ROOT_MARGIN = `${String(NEAR_PX)}px 0px`;
/** 外した後の目印を先読みの外へどれだけ残すか（px）。並びの余白の分で先読みに入らないように */
const TRIM_SLACK_PX = 100;

/** 描く範囲の始まりと終わり */
interface Shown {
  /** 描く範囲の始まり（含む） */
  readonly start: number;
  /** 描く範囲の終わり（含まない） */
  readonly end: number;
}

/** 描く発言の範囲と、両端の目印の受け口 */
export interface MessageWindow extends Shown {
  /** 先頭に置く目印。見えたら古い側へ足す。端まで描いていても置く */
  readonly attachTopMark: (element: HTMLElement | null) => void;
  /** 末尾に置く目印。見えたら新しい側へ足す。端まで描いていても置く */
  readonly attachBottomMark: (element: HTMLElement | null) => void;
  /** 発言を直に並べる要素。外してよい発言を確かめるのに使う */
  readonly attachList: (element: HTMLElement | null) => void;
}

interface Range {
  readonly key: string;
  /** 始まり。発言がまだ無い間は決めない（読み込んでから数える） */
  readonly start: number | null;
  readonly end: number;
  /** 最新を描いているか（届いた発言も描く） */
  readonly latest: boolean;
}

/** 描く範囲の広げ方 */
export interface WindowGrowth {
  /** 一度に描く発言の目安 */
  readonly size: number;
  /** 一度に描き足す件数 */
  readonly step?: number | undefined;
}

/** 両端の目印が見えているか */
interface SeenMarks {
  top: boolean;
  bottom: boolean;
}

/** 範囲を動かすときの決まり */
interface WindowLimits {
  readonly total: number;
  readonly size: number;
  readonly step: number;
}

/** 外しても端の目印が先読みの外に残る発言の数（古い側・新しい側） */
interface FarItems {
  readonly older: number;
  readonly newer: number;
}

/**
 * 新しい `step` 件から描き始め、端の目印が見えるたびにその向きへ `step` 件ずつ足し、`size` 件を
 * 超えた分は反対の端から外す範囲を返す。外すのは目印が先読みの外に残る発言だけなので、
 * 短い発言が続くと `size` 件を超えて描く。
 */
export function useMessageWindow(
  total: number,
  { size, step = DEFAULT_WINDOW_STEP }: WindowGrowth,
  /** 会話を替えたら初めからやり直す鍵 */
  resetKey: string,
  /** 見張りの基準にする送りの欄。null は欄がまだ無い（置かれるまで見張らない） */
  root: Element | null,
): MessageWindow {
  const [range, setRange] = useState<Range>({ key: resetKey, start: null, end: 0, latest: true });
  const [top, setTop] = useState<HTMLElement | null>(null);
  const [bottom, setBottom] = useState<HTMLElement | null>(null);
  const [list, setList] = useState<HTMLElement | null>(null);

  // 会話を替えた・発言が初めて入ったら、新しい `step` 件から始める（描画中に決める）
  if (range.key !== resetKey || (range.start === null && total > 0)) {
    setRange({ key: resetKey, start: Math.max(0, total - step), end: total, latest: true });
  }

  const watchable = typeof globalThis.IntersectionObserver === 'function';
  const { start, end } = watchable ? current(range, total, step) : { start: 0, end: total };

  useEffect(() => {
    if (!watchable || root === null) return;
    const seen: SeenMarks = { top: false, bottom: false };
    const observer = new globalThis.IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === top) seen.top = entry.isIntersecting;
          if (entry.target === bottom) seen.bottom = entry.isIntersecting;
        }
        const next = nextWindow({ start, end }, { total, size, step }, seen, () =>
          farItems(list, root, end - start),
        );
        if (next.start === start && next.end === end) return;
        setRange((now) =>
          now.start === null ? now : { ...now, ...next, latest: next.end === total },
        );
      },
      { root, rootMargin: ROOT_MARGIN },
    );
    // 端まで描いていても見張る（反対の端が見えているかの判定に使う）
    if (top !== null) observer.observe(top);
    if (bottom !== null) observer.observe(bottom);
    return () => observer.disconnect();
  }, [watchable, root, top, bottom, list, start, end, total, size, step]);

  return { start, end, attachTopMark: setTop, attachBottomMark: setBottom, attachList: setList };
}

/** 今の総数に合わせた範囲。最新を描いている間は末尾に付いていく */
function current(range: Range, total: number, step: number): Shown {
  if (range.start === null) return { start: Math.max(0, total - step), end: total };
  if (range.latest) return { start: Math.min(range.start, total), end: total };
  const end = Math.min(range.end, total);
  return { start: Math.min(range.start, end), end };
}

/**
 * 見えた目印の向きへ足し、超えた分を足していない側から外した範囲。外した端の目印は先読みの外に
 * 残るので見えず、外した分を足し直して往復することがない
 */
function nextWindow(
  at: Shown,
  { total, size, step }: WindowLimits,
  seen: SeenMarks,
  far: () => FarItems,
): Shown {
  const older = at.start > 0 && seen.top;
  const newer = !older && at.end < total && seen.bottom;
  const start = older ? Math.max(0, at.start - step) : at.start;
  const end = newer ? Math.min(total, at.end + step) : at.end;
  const excess = end - start - size;
  if (excess <= 0) return { start, end };

  const items = far();
  const fromOlder = older ? 0 : Math.min(excess, items.older);
  const fromNewer = newer ? 0 : Math.min(excess - fromOlder, items.newer);
  return { start: start + fromOlder, end: end - fromNewer };
}

/**
 * 描いている発言のうち、両端から続けて先読みの外にある数。行や出力アンカーの座標の測定ではなく、
 * 超えた分を外すときに 1 回読むだけ（測定の仕組みの対象外）
 */
function farItems(list: Element | null, root: Element, count: number): FarItems {
  // 発言の数と合わなければ、どれがどの発言か分からないので外さない
  if (list === null || list.children.length !== count) return { older: 0, newer: 0 };
  const view = root.getBoundingClientRect();
  const margin = NEAR_PX + TRIM_SLACK_PX;
  const rects = Array.from(list.children, (item) => item.getBoundingClientRect());
  const older = rects.findIndex((rect) => rect.bottom >= view.top - margin);
  const newer = rects.toReversed().findIndex((rect) => rect.top <= view.bottom + margin);
  return { older: older < 0 ? count : older, newer: newer < 0 ? count : newer };
}
