import { orderedNodeIds } from '@/graph/order';
import type { NodeId } from '@/graph/types';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// グラフのストアの今の状態を読む（操作の結果を確かめるため）。
// ─────────────────────────────

/** ストアのワークフローの表示順（横位置の順）。ワークフローが無ければ空 */
export function storedNodeOrder(): NodeId[] {
  const workflow = useGraphStore.getState().workflow;
  return workflow ? orderedNodeIds(workflow) : [];
}
