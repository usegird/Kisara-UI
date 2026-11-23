import {
  boundingOf,
  groupParents,
  workflowGroups,
  type GroupParents,
  type Membership,
} from '@/graph/groups';
import {
  DEFAULT_ORDER_LAYOUT,
  rectOf,
  TITLE_HEIGHT,
  type NodeRect,
  type OrderLayout,
} from '@/graph/node-box';
import type { Workflow } from '@/graph/types';
import { isRecord } from '@/lib/guards';

export const GROUP_PADDING = 10;

export const GROUP_TITLE_HEIGHT = TITLE_HEIGHT;

const SAME_NUMBER_TOLERANCE = 0.5;

function sameNumber(a: unknown, b: number): boolean {
  return typeof a === 'number' && Math.abs(a - b) < SAME_NUMBER_TOLERANCE;
}

function sameBounding(group: unknown, next: readonly number[]): boolean {
  const rect = boundingOf(group);
  if (!rect) return false;
  return [rect.x, rect.y, rect.width, rect.height].every((value, at) =>
    sameNumber(value, next[at] ?? Number.NaN),
  );
}

export function frameAround(inside: readonly NodeRect[]): NodeRect {
  return {
    left: Math.min(...inside.map((box) => box.left)) - GROUP_PADDING,
    top: Math.min(...inside.map((box) => box.top)) - GROUP_PADDING - GROUP_TITLE_HEIGHT,
    right: Math.max(...inside.map((box) => box.right)) + GROUP_PADDING,
    bottom: Math.max(...inside.map((box) => box.bottom)) + GROUP_PADDING,
  };
}

export function withGroupBounds(
  workflow: Workflow,
  membership: Membership,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
  parents: GroupParents = groupParents(workflow),
): Workflow {
  const groups = workflowGroups(workflow);
  if (groups.length === 0) return workflow;

  const boxes = new Map<number, NodeRect[]>();
  let rightmost = layout.startX;
  let topmost = Number.POSITIVE_INFINITY;
  for (const node of workflow.nodes) {
    const box = rectOf(node, layout);
    rightmost = Math.max(rightmost, box.right);
    topmost = Math.min(topmost, box.top);
    const group = membership.get(node.id);
    if (group !== undefined) boxes.set(group, [...(boxes.get(group) ?? []), box]);
  }
  const children = new Map<number, number[]>();
  for (const [child, parent] of parents) {
    children.set(parent, [...(children.get(parent) ?? []), child]);
  }

  const frames = new Map<number, NodeRect | null>();
  const frameOf = (index: number): NodeRect | null => {
    const known = frames.get(index);
    if (known !== undefined) return known;
    frames.set(index, null);
    const inside = [
      ...(boxes.get(index) ?? []),
      ...(children.get(index) ?? []).flatMap((child) => frameOf(child) ?? []),
    ];
    const frame = inside.length === 0 ? null : frameAround(inside);
    frames.set(index, frame);
    return frame;
  };
  const fitted = new Map<number, number[]>();
  for (let index = 0; index < groups.length; index += 1) {
    const frame = frameOf(index);
    if (frame === null) continue;
    fitted.set(index, [frame.left, frame.top, frame.right - frame.left, frame.bottom - frame.top]);
    rightmost = Math.max(rightmost, frame.right);
  }

  const parkX = rightmost + layout.gap;
  let parkY = Number.isFinite(topmost) ? topmost : 0;
  let changed = false;
  const next = groups.map((group, index) => {
    let bounding = fitted.get(index);
    if (bounding === undefined) {
      const rect = boundingOf(group);
      if (!rect) return group;
      bounding = [parkX, parkY, rect.width, rect.height];
      parkY += rect.height + layout.stackGap;
    }
    if (!isRecord(group) || sameBounding(group, bounding)) return group;
    changed = true;
    return { ...group, bounding };
  });
  return changed ? { ...workflow, groups: next } : workflow;
}
