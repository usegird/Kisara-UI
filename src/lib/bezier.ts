import { clamp } from '@/lib/clamp';
import type { Point } from '@/lib/point';

const HANDLE_RATIO = 0.5;
const MIN_HANDLE = 24;
const MAX_HANDLE = 120;
const DEFAULT_BULGE = 48;
const CUBIC_WEIGHT = 3;

interface Cubic {
  readonly from: Point;
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}

function handleLength(from: Point, to: Point): number {
  const distance = Math.abs(to.x - from.x);
  return clamp(distance * HANDLE_RATIO, MIN_HANDLE, MAX_HANDLE);
}

export function bezierPath(from: Point, to: Point): string {
  const handle = handleLength(from, to);
  const direction = to.x >= from.x ? 1 : -1;

  const c1 = { x: from.x + handle * direction, y: from.y };
  const c2 = { x: to.x - handle * direction, y: to.y };

  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

export function arcPath(from: Point, to: Point, bulge = DEFAULT_BULGE): string {
  const c1 = { x: from.x + bulge, y: from.y };
  const c2 = { x: to.x + bulge, y: to.y };

  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

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

export function bezierAt(from: Point, to: Point, t: number): Point {
  const handle = handleLength(from, to);
  const direction = to.x >= from.x ? 1 : -1;
  const c1 = { x: from.x + handle * direction, y: from.y };
  const c2 = { x: to.x - handle * direction, y: to.y };
  return cubicAt({ from, c1, c2, to }, t);
}

export function arcAt(from: Point, to: Point, t: number, bulge = DEFAULT_BULGE): Point {
  const c1 = { x: from.x + bulge, y: from.y };
  const c2 = { x: to.x + bulge, y: to.y };
  return cubicAt({ from, c1, c2, to }, t);
}
