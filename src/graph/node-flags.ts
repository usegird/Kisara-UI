import { subgraphDefinitions } from '@/graph/normalize';
import type { NodeId, Workflow, WorkflowNode } from '@/graph/types';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// ノードの `flags`（LiteGraph の標準キー）の折りたたみとピン留めの読み書きと、ピン留めを外す操作。
// ─────────────────────────────

/** 扱う `flags` の印。ピン留めは並びを位置で持つこのアプリでは使わず、外すだけ */
export type NodeFlag = 'collapsed' | 'pinned';

/** ノードに印が入っているか */
export function hasFlag(node: WorkflowNode, flag: NodeFlag): boolean {
  return isRecord(node.flags) && node.flags[flag] === true;
}

/**
 * 印を入れた・外した新しいノード。外すとキーを落とす。
 * 元から `flags` があったノードは空でもキーを残す（読み込んだ形をそのまま返す）
 */
export function withFlag(node: WorkflowNode, flag: NodeFlag, on: boolean): WorkflowNode {
  if (hasFlag(node, flag) === on) return node;
  const had = isRecord(node.flags);
  const flags: Record<string, unknown> = had ? { ...(node.flags as Record<string, unknown>) } : {};
  if (on) flags[flag] = true;
  else delete flags[flag];

  if (!had && Object.keys(flags).length === 0) {
    const next: WorkflowNode = { ...node };
    delete next.flags;
    return next;
  }
  return { ...node, flags };
}

/** 階層の直下のノードすべてのピン留めを外す（処理順に並べるとき）。無ければ同じものを返す */
export function withoutPins(workflow: Workflow): Workflow {
  if (!workflow.nodes.some((node) => hasFlag(node, 'pinned'))) return workflow;
  return { ...workflow, nodes: workflow.nodes.map((node) => withFlag(node, 'pinned', false)) };
}

function posKey(node: WorkflowNode | undefined): string {
  const pos: unknown = node?.pos;
  return Array.isArray(pos) ? `${String(pos[0])},${String(pos[1])}` : '';
}

/** `after` のうち、`before` から位置が変わったピン留めのノードを外す。無ければ同じものを返す */
function unpinNodes(
  before: readonly WorkflowNode[],
  after: readonly WorkflowNode[],
): WorkflowNode[] | null {
  if (!after.some((node) => hasFlag(node, 'pinned'))) return null;
  const was = new Map<NodeId, WorkflowNode>(before.map((node) => [node.id, node]));
  let changed = false;
  const nodes = after.map((node) => {
    const previous = was.get(node.id);
    if (!hasFlag(node, 'pinned') || previous === undefined) return node;
    if (posKey(previous) === posKey(node)) return node;
    changed = true;
    return withFlag(node, 'pinned', false);
  });
  return changed ? nodes : null;
}

/**
 * 編集の前後で位置が変わったノードのピン留めを外す（subgraph の中も）。
 * 前に無かったノード（足したもの）は外さない。何も外さなければ `after` をそのまま返す
 */
export function unpinMoved(before: Workflow, after: Workflow): Workflow {
  if (before === after) return after;
  const nodes = unpinNodes(before.nodes, after.nodes);

  const oldDefinitions = new Map(subgraphDefinitions(before).map((sub) => [sub.id, sub]));
  let subgraphsChanged = false;
  const subgraphs = subgraphDefinitions(after).map((sub) => {
    const old = oldDefinitions.get(sub.id);
    if (old === undefined || old === sub) return sub;
    const inner = unpinNodes(old.nodes, sub.nodes);
    if (inner === null) return sub;
    subgraphsChanged = true;
    return { ...sub, nodes: inner };
  });

  if (nodes === null && !subgraphsChanged) return after;
  return {
    ...after,
    ...(nodes === null ? {} : { nodes }),
    ...(subgraphsChanged ? { definitions: { ...after.definitions, subgraphs } } : {}),
  };
}
