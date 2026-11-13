import type { NodeId, Workflow } from '@/graph/types';

// ─────────────────────────────
// 表示用のワークフロー（`subgraph-display`）に添える、位置から読まない並び・所属・通し番号。
// 編集の対象には添えない。
// ─────────────────────────────

/**
 * 表示用のワークフローに添える並び・所属・通し番号。開いた subgraph の中は外と別の座標で
 * 置かれているので、混ぜたワークフローの位置から読むと崩れる。`orderedNodeIds` /
 * `groupMembership` / `groupParents` / カードの番号は、添えてあればこれを返す。
 */
interface FixedLayout {
  /** 表示の並び（外の並びの中に、開いた中の並びを差し込んだもの） */
  readonly order: readonly NodeId[];
  /** グループの所属（`groups[]` の添字） */
  readonly membership: ReadonlyMap<NodeId, number>;
  /**
   * グループの親（`groups[]` の添字）
   */
  readonly parents: ReadonlyMap<number, number>;
  /** カードの通し番号（中は `3.1` の形） */
  readonly numbers: ReadonlyMap<NodeId, string>;
}

const fixed = new WeakMap<Workflow, FixedLayout>();

/** 並びを添える。同じワークフローを返す */
export function withFixedLayout(workflow: Workflow, layout: FixedLayout): Workflow {
  fixed.set(workflow, layout);
  return workflow;
}

/** 添えた並び。位置から読むワークフローなら undefined */
export function fixedLayoutOf(workflow: Workflow): FixedLayout | undefined {
  return fixed.get(workflow);
}
