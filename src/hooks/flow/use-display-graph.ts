import { displayGraph, type DisplayGraph } from '@/graph/subgraph-display';
import { useGraphStore } from '@/store/use-graph-store';

export function useDisplayGraph(): DisplayGraph | null {
  const workflow = useGraphStore((state) => state.workflow);
  return workflow ? displayGraph(workflow) : null;
}
