import { orderedNodeIds } from '@/graph/order';
import type { NodeId } from '@/graph/types';
import { useGraphStore } from '@/store/use-graph-store';

export function storedNodeOrder(): NodeId[] {
  const workflow = useGraphStore.getState().workflow;
  return workflow ? orderedNodeIds(workflow) : [];
}
