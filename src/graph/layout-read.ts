import { fixedLayoutOf } from '@/graph/fixed-layout';
import { groupMembership, groupParents, itemAt, type Membership } from '@/graph/groups';
import { lanes, laneSuccessors } from '@/graph/lane';
import { DEFAULT_ORDER_LAYOUT, rectOf, type OrderLayout } from '@/graph/node-box';
import type { NodeId, Workflow, WorkflowNode } from '@/graph/types';

// ─────────────────────────────
// 位置から並びを読み戻す。置く側は `layout-place.ts`。
// ─────────────────────────────

/** 同じ列とみなす左端の差（px）。ComfyUI で少し動かしても並びが変わらないよう、ゆとりを持たせる */
export const COLUMN_TOLERANCE = 20;

/** 読み戻す 1 つ（グループの外のノード、またはグループの箱） */
interface ReadItem {
  /** 中の並び（ノードなら自分だけ） */
  readonly ids: readonly NodeId[];
  readonly left: number;
  readonly top: number;
}

function nodeItem(node: WorkflowNode, layout: OrderLayout): ReadItem {
  const rect = rectOf(node, layout);
  return { ids: [node.id], left: rect.left, top: rect.top };
}

/** 左端の順に列へ分け、列の中は上からの順で並べる */
function readItems(items: readonly ReadItem[]): NodeId[] {
  const byLeft = [...items].sort(
    (a, b) => a.left - b.left || a.top - b.top || (a.ids[0] ?? 0) - (b.ids[0] ?? 0),
  );
  const columns: ReadItem[][] = [];
  for (const item of byLeft) {
    const column = columns.at(-1);
    const start = column?.[0]?.left;
    if (column && start !== undefined && item.left - start <= COLUMN_TOLERANCE) column.push(item);
    else columns.push([item]);
  }
  return columns.flatMap((column) =>
    [...column]
      .sort((a, b) => a.top - b.top || a.left - b.left || (a.ids[0] ?? 0) - (b.ids[0] ?? 0))
      .flatMap((item) => item.ids),
  );
}

/**
 * 現在の pos から表示順を導く。ComfyUI 本家も左から右へ流れるので、X 軸の順にすると
 * 素のエディタで開いたときに読みやすい。
 */
export function orderedNodeIds(
  workflow: Workflow,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): NodeId[] {
  // 表示用のワークフローは、作ったときに求めた並びを使う（位置の座標が混ざっている）
  const fixed = fixedLayoutOf(workflow);
  if (fixed) return [...fixed.order];

  const membership = groupMembership(workflow, layout);
  const parents = groupParents(workflow);

  // 階層ごとに読む。子のグループは 1 つの箱として、中のノードの左端と上端で読む
  const level = (nodes: readonly WorkflowNode[], container: number | null): ReadItem => {
    const children = new Map<number, WorkflowNode[]>();
    const items: ReadItem[] = [];
    for (const node of nodes) {
      const at = itemAt(node.id, container, membership, parents);
      if (at?.kind === 'group') children.set(at.index, [...(children.get(at.index) ?? []), node]);
      else items.push(nodeItem(node, layout));
    }
    for (const [group, inside] of children) items.push(level(inside, group));
    return {
      ids: readItems(items),
      left: Math.min(...items.map((item) => item.left)),
      top: Math.min(...items.map((item) => item.top)),
    };
  };
  return liftLanes([...level(workflow.nodes, null).ids], workflow, membership, layout);
}

/**
 * 本流の下に回り込んだ支流を、X 軸の順で読んだあと入る先の直前へ移す。同じ段とみなす上端の差は
 * `COLUMN_TOLERANCE` 以内
 */
function liftLanes(
  order: readonly NodeId[],
  workflow: Workflow,
  membership: Membership,
  layout: OrderLayout,
): NodeId[] {
  const rects = new Map(workflow.nodes.map((node) => [node.id, rectOf(node, layout)]));
  let result = [...order];

  for (const { ids, target } of lanes(
    laneSuccessors(new Set(order), workflow.links, membership),
    workflow.links,
  )) {
    const boxes = ids.flatMap((id) => rects.get(id) ?? []);
    const first = boxes[0];
    const last = boxes.at(-1);
    const end = rects.get(target);
    if (!first || !last || !end || boxes.length !== ids.length || last.right > end.left) continue;
    const inRow = boxes.every(
      (box, at) =>
        Math.abs(box.top - first.top) <= COLUMN_TOLERANCE &&
        (at === 0 || (boxes[at - 1]?.right ?? Infinity) <= box.left),
    );
    if (!inRow) continue;
    const tucked = [...rects].some(
      ([id, box]) =>
        !ids.includes(id) &&
        box.left < last.right &&
        first.left < box.right &&
        box.bottom <= first.top,
    );
    if (!tucked) continue;

    const rest = result.filter((id) => !ids.includes(id));
    const at = rest.indexOf(target);
    if (at >= 0) result = [...rest.slice(0, at), ...ids, ...rest.slice(at)];
  }
  return result;
}
