import { linkIndex } from '@/graph/link-read';
import type { LinkId, NodeId, Workflow, WorkflowNode } from '@/graph/types';

// ─────────────────────────────
// Workflow JSON のノードを、リンク操作や設定の読み書きなど**形だけあればよい**検証のために組み立てる
// （実データは fixtures.ts）。`WorkflowNode` の形が変わったら**ここだけ**直す。
// ─────────────────────────────

/** IMAGE を1つ受けて1つ返すノード。リンクを張る検証で使う */
export function node(
  id: number,
  type: string,
  overrides: Partial<WorkflowNode> = {},
): WorkflowNode {
  return {
    id,
    type,
    pos: [0, 0],
    inputs: [{ name: 'in', type: 'IMAGE', link: null }],
    outputs: [{ name: 'out', type: 'IMAGE', links: [] }],
    ...overrides,
  };
}

/**
 * `id` / `type` / `pos` だけの素のノード。
 * **入出力を持たせない**（「カードに出していないキー」を数える検証で数が変わるため）。
 */
export function bareNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return { id: 1, type: 'A', pos: [0, 0], ...overrides };
}

/** 2 つのノードを結ぶ最初のリンクの id（読み込んだ実データから線を探す）。無ければ null */
export function linkBetween(workflow: Workflow, originId: NodeId, targetId: NodeId): LinkId | null {
  for (const link of linkIndex(workflow.links).values()) {
    if (link.originId === originId && link.targetId === targetId) return link.id;
  }
  return null;
}
