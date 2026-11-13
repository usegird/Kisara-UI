import type { WorkflowNode } from '@/graph/types';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// ノードの箱（位置・幅・高さ）。並べ直し（order.ts）とグループの所属（groups.ts）が同じ測り方を使う。
// ─────────────────────────────

/** 並べ直しの間隔と、`size` を持たないノードの想定の大きさ */
export interface OrderLayout {
  readonly startX: number;
  /** 列と列の横の隙間 */
  readonly gap: number;
  /** 列の中で縦に並べるときの隙間（横の半分） */
  readonly stackGap: number;
  /** size を持たないノードの想定幅 */
  readonly defaultWidth: number;
  /** size を持たないノードの想定高さ */
  readonly defaultHeight: number;
}

/** 並べ直しの既定の間隔と想定の大きさ */
export const DEFAULT_ORDER_LAYOUT: OrderLayout = {
  startX: 0,
  gap: 80,
  stackGap: 40,
  defaultWidth: 240,
  defaultHeight: 120,
};

/**
 * ComfyUI の見出しの高さ。`pos` は本体の左上を指し、見出しはその上にはみ出す
 * （下に置くノードの見出しが上のノードに重ならないよう、隙間に足す）
 */
export const TITLE_HEIGHT = 30;

/** ノードの幅。素の ComfyUI で開いたときに重ならないよう、実際の幅を使う */
export function widthOf(node: WorkflowNode, layout: OrderLayout): number {
  const size = node.size;
  if (Array.isArray(size) && typeof size[0] === 'number' && size[0] > 0) return size[0];
  return layout.defaultWidth;
}

/** 本体の高さ。**折りたたんだノードは見出しだけ**なので 0 と数える */
export function heightOf(node: WorkflowNode, layout: OrderLayout): number {
  if (isRecord(node.flags) && node.flags.collapsed === true) return 0;
  const size = node.size;
  if (Array.isArray(size) && typeof size[1] === 'number' && size[1] > 0) return size[1];
  return layout.defaultHeight;
}

/** 箱の高さ（見出しを含む） */
export function boxOf(node: WorkflowNode, layout: OrderLayout): number {
  return heightOf(node, layout) + TITLE_HEIGHT;
}

/** ノードの位置。読めない形なら原点 */
export function positionOf(node: WorkflowNode): [number, number] {
  const pos = node.pos;
  if (Array.isArray(pos) && typeof pos[0] === 'number' && typeof pos[1] === 'number') {
    return [pos[0], pos[1]];
  }
  return [0, 0];
}

/** 見出しを含む箱の左・上・右・下 */
export interface NodeRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** ノードの、見出しを含む箱 */
export function rectOf(node: WorkflowNode, layout: OrderLayout): NodeRect {
  const [x, y] = positionOf(node);
  return {
    left: x,
    top: y - TITLE_HEIGHT,
    right: x + widthOf(node, layout),
    bottom: y + heightOf(node, layout),
  };
}
