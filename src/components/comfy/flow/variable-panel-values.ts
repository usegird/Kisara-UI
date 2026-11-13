import {
  groupLabelOf,
  segmentByGroup,
  type GroupLabel,
  type GroupParents,
  type Membership,
} from '@/graph/groups';
import type { NodeId } from '@/graph/types';
import { VARIABLE_PANEL_METRICS } from '@/graph/variable-panel-metrics';
import type { VariableGroup } from '@/graph/variables';

// ─────────────────────────────
// 変数の列の余白とカードのグループの帯を求める
// ─────────────────────────────

const { GROUP_PADDING, BOX_GAP } = VARIABLE_PANEL_METRICS;

/**
 * まとまりの枠の内側の余白。デモは倍にする
 */
export function groupPadding(roomy: boolean): number {
  return roomy ? GROUP_PADDING * 2 : GROUP_PADDING;
}

/**
 * 変数どうしの間。デモは少し空ける
 */
export function boxGap(roomy: boolean): number {
  return roomy ? BOX_GAP * 2 : BOX_GAP;
}

/**
 * カードのグループの帯 1 つ。先頭と末尾のまとまりで範囲を決める
 */
export interface FrameSpan {
  readonly label: GroupLabel;
  readonly firstId: NodeId;
  readonly lastId: NodeId;
}

/**
 * まとまりの並びを所属で区切り、続いている同じグループを帯 1 つにする（カードの列の枠と同じ区切り）。
 * 帯は外側のグループだけ（子のグループは帯にしない）
 */
export function frameSpans(
  groups: readonly VariableGroup[],
  groupOf: Membership,
  parents: GroupParents,
  labels: readonly GroupLabel[],
): FrameSpan[] {
  const wrapped = groups.map((group) => ({ id: group.nodeId, group }));
  return segmentByGroup(wrapped, groupOf, parents).flatMap((segment) => {
    if (segment.kind !== 'group') return [];
    const first = segment.items[0];
    const last = segment.items[segment.items.length - 1];
    if (!first || !last) return [];
    return [{ label: groupLabelOf(labels, segment.index), firstId: first.id, lastId: last.id }];
  });
}
