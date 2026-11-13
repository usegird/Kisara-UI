import { displayGraph, type DisplayGraph } from '@/graph/subgraph-display';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// 表示用のワークフロー（開いた subgraph の中を差し込んだもの）の入口。
// カード・変数・線はこれを読む。編集はストアの操作を通す（ここからは書かない）。
// ─────────────────────────────

/** 今のワークフローから、開いた subgraph の中を差し込んだ表示用のワークフローを返す */
export function useDisplayGraph(): DisplayGraph | null {
  const workflow = useGraphStore((state) => state.workflow);
  return workflow ? displayGraph(workflow) : null;
}
