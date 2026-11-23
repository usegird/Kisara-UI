import {
  groupLabelAt,
  groupMembership,
  groupParents,
  NO_PARENTS,
  workflowGroups,
  type GroupLabel,
  type GroupParents,
  type Membership,
} from '@/graph/groups';
import type { NodeId, Workflow } from '@/graph/types';
import { useGraphStore } from '@/store/use-graph-store';

export interface CardGroups {
  readonly groupOf: Membership;
  readonly groupParents: GroupParents;
  readonly groupLabels: readonly GroupLabel[];
  readonly selectedIds: ReadonlySet<NodeId>;
  readonly group: (id: NodeId) => void;
}

const NO_MEMBERSHIP: Membership = new Map();

export function useCardGroups(workflow: Workflow | null): CardGroups {
  const selected = useGraphStore((state) => state.selectedNodeIds);
  const groupNodes = useGraphStore((state) => state.groupNodes);

  const groupOf = workflow ? groupMembership(workflow) : NO_MEMBERSHIP;
  const parents = workflow ? groupParents(workflow) : NO_PARENTS;
  const groupLabels = workflow
    ? workflowGroups(workflow).map((_, index) => groupLabelAt(workflow, index))
    : [];
  const selectedIds = new Set(selected);

  const group = (id: NodeId): void => {
    const current = useGraphStore.getState().selectedNodeIds;
    groupNodes(current.includes(id) ? current : [id]);
  };

  return { groupOf, groupParents: parents, groupLabels, selectedIds, group };
}
