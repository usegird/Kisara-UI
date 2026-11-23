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

const { GROUP_PADDING, BOX_GAP } = VARIABLE_PANEL_METRICS;

export function groupPadding(roomy: boolean): number {
  return roomy ? GROUP_PADDING * 2 : GROUP_PADDING;
}

export function boxGap(roomy: boolean): number {
  return roomy ? BOX_GAP * 2 : BOX_GAP;
}

export interface FrameSpan {
  readonly label: GroupLabel;
  readonly firstId: NodeId;
  readonly lastId: NodeId;
}

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
