import type { NodeRect } from '@/graph/node-box';

export function overlaps(a: NodeRect, b: NodeRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}
