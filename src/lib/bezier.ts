import { clamp } from '@/lib/clamp';
import type { Point } from '@/lib/point';

// ─────────────────────────────
// 接続線のパス生成。SVG のベジェ曲線を 1 箇所で組み立てる。
// ─────────────────────────────

/** 制御点の長さを、両端の水平の距離の何割にするか */
const HANDLE_RATIO = 0.5;
const MIN_HANDLE = 24;
const MAX_HANDLE = 120;
/** 弧を外側へ膨らませる既定の幅（px） */
const DEFAULT_BULGE = 48;
/** 3 次ベジェの係数（二項係数の 3） */
const CUBIC_WEIGHT = 3;

/** 3 次ベジェの始点・制御点 2 つ・終点 */
interface Cubic {
  readonly from: Point;
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}

/** 水平方向に張り出す制御点の長さ。距離に応じて伸ばすが上限を設ける */
function handleLength(from: Point, to: Point): number {
  const distance = Math.abs(to.x - from.x);
  return clamp(distance * HANDLE_RATIO, MIN_HANDLE, MAX_HANDLE);
}

/**
 * 3次ベジェ。**進行方向に合わせて制御点を張り出す**。
 * 右から左へ戻る線（変数ボックス → 左のカードの入力行）で向きを固定すると、
 * 制御点が逆向きに伸びて線が回り込んでしまう。
 */
export function bezierPath(from: Point, to: Point): string {
  const handle = handleLength(from, to);
  const direction = to.x >= from.x ? 1 : -1;

  const c1 = { x: from.x + handle * direction, y: from.y };
  const c2 = { x: to.x - handle * direction, y: to.y };

  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

/**
 * 同じ側にある2点を結ぶ弧。真下のカードへ直接引くときに使う。
 * 直線だと縦に重なって見えないので、**外側へ膨らませて**弧にする。
 */
export function arcPath(from: Point, to: Point, bulge = DEFAULT_BULGE): string {
  const c1 = { x: from.x + bulge, y: from.y };
  const c2 = { x: to.x + bulge, y: to.y };

  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

/** 3 次ベジェの t の点 */
function cubicAt({ from, c1, c2, to }: Cubic, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = CUBIC_WEIGHT * u * u * t;
  const c = CUBIC_WEIGHT * u * t * t;
  const d = t * t * t;
  return {
    x: a * from.x + b * c1.x + c * c2.x + d * to.x,
    y: a * from.y + b * c1.y + c * c2.y + d * to.y,
  };
}

/** `bezierPath` の線の上の点（t = 0 が始点、1 が終点） */
export function bezierAt(from: Point, to: Point, t: number): Point {
  const handle = handleLength(from, to);
  const direction = to.x >= from.x ? 1 : -1;
  const c1 = { x: from.x + handle * direction, y: from.y };
  const c2 = { x: to.x - handle * direction, y: to.y };
  return cubicAt({ from, c1, c2, to }, t);
}

/** `arcPath` の弧の上の点 */
export function arcAt(from: Point, to: Point, t: number, bulge = DEFAULT_BULGE): Point {
  const c1 = { x: from.x + bulge, y: from.y };
  const c2 = { x: to.x + bulge, y: to.y };
  return cubicAt({ from, c1, c2, to }, t);
}
