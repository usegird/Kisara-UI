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

// ─────────────────────────────
// カードの選択とグループ。FlowCanvas から切り出した手続きで、使うのはそこだけ。
// ─────────────────────────────

/** カードの選択と、グループの所属・親・名前と、グループ化の手続き */
export interface CardGroups {
  /** 所属は位置から読む */
  readonly groupOf: Membership;
  /**
   * グループの親。
   */
  readonly groupParents: GroupParents;
  readonly groupLabels: readonly GroupLabel[];
  readonly selectedIds: ReadonlySet<NodeId>;
  readonly group: (id: NodeId) => void;
}

const NO_MEMBERSHIP: Membership = new Map();

/** ワークフローからグループの所属と名前を読み、選択とグループ化の手続きと合わせて返す */
export function useCardGroups(workflow: Workflow | null): CardGroups {
  const selected = useGraphStore((state) => state.selectedNodeIds);
  const groupNodes = useGraphStore((state) => state.groupNodes);

  const groupOf = workflow ? groupMembership(workflow) : NO_MEMBERSHIP;
  const parents = workflow ? groupParents(workflow) : NO_PARENTS;
  // 中身が同じなら列の側で前回のものを使う（グループの枠は中身で比べる）
  const groupLabels = workflow
    ? workflowGroups(workflow).map((_, index) => groupLabelAt(workflow, index))
    : [];
  const selectedIds = new Set(selected);

  const group = (id: NodeId): void => {
    // 押したときの選択だけを読む（購読はここでは要らない）。
    // 押したカードが選択に入っていなければ、そのカードだけをまとめる
    // （メニューは選んだカードにしか出さないので、届くのは守りのときだけ）
    const current = useGraphStore.getState().selectedNodeIds;
    groupNodes(current.includes(id) ? current : [id]);
  };

  return { groupOf, groupParents: parents, groupLabels, selectedIds, group };
}
