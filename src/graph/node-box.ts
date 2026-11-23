import type { WorkflowNode } from '@/graph/types';
import { isRecord } from '@/lib/guards';

export interface OrderLayout {
  readonly startX: number;
  readonly gap: number;
  readonly stackGap: number;
  readonly defaultWidth: number;
  readonly defaultHeight: number;
}

export const DEFAULT_ORDER_LAYOUT: OrderLayout = {
  startX: 0,
  gap: 80,
  stackGap: 40,
  defaultWidth: 240,
  defaultHeight: 120,
};

export const TITLE_HEIGHT = 30;

export function widthOf(node: WorkflowNode, layout: OrderLayout): number {
  const size = node.size;
  if (Array.isArray(size) && typeof size[0] === 'number' && size[0] > 0) return size[0];
  return layout.defaultWidth;
}

export function heightOf(node: WorkflowNode, layout: OrderLayout): number {
  if (isRecord(node.flags) && node.flags.collapsed === true) return 0;
  const size = node.size;
  if (Array.isArray(size) && typeof size[1] === 'number' && size[1] > 0) return size[1];
  return layout.defaultHeight;
}

export function boxOf(node: WorkflowNode, layout: OrderLayout): number {
  return heightOf(node, layout) + TITLE_HEIGHT;
}

export function positionOf(node: WorkflowNode): [number, number] {
  const pos = node.pos;
  if (Array.isArray(pos) && typeof pos[0] === 'number' && typeof pos[1] === 'number') {
    return [pos[0], pos[1]];
  }
  return [0, 0];
}

export interface NodeRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function rectOf(node: WorkflowNode, layout: OrderLayout): NodeRect {
  const [x, y] = positionOf(node);
  return {
    left: x,
    top: y - TITLE_HEIGHT,
    right: x + widthOf(node, layout),
    bottom: y + heightOf(node, layout),
  };
}
