// ─────────────────────────────
// 箱（NodeRect）の重なりの判定。置き直し・入れ子の確認で、箱どうしが重ならないことを主張するのに使う
// ─────────────────────────────

import type { NodeRect } from '@/graph/node-box';

/** 2 つの箱が重なるか（辺が接するだけなら重ならない） */
export function overlaps(a: NodeRect, b: NodeRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}
