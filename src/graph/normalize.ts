import { linkIndex, readLink } from '@/graph/link-read';
import {
  nodeInputs,
  nodeOutputs,
  type LinkId,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { t } from '@/i18n';
import { isRecord, isUnknownArray } from '@/lib/guards';

// ─────────────────────────────
// 読み込み時の検証と正規化。外部入力は unknown で受け、必要な形だけ確認する。未知キーは素通しで
// 保持する（落とすと素の ComfyUI との往復で情報が欠ける）。
// ─────────────────────────────

/** Workflow JSON として読めないときに、理由の文言を持って投げる */
class WorkflowParseError extends Error {}

function isNode(value: unknown): value is WorkflowNode {
  return isRecord(value) && typeof value.id === 'number' && typeof value.type === 'string';
}

/** ノードも線も無い Workflow JSON（本体が空のグラフを書き出すのと同じ項目） */
export function emptyWorkflow(): Workflow {
  return {
    last_node_id: 0,
    last_link_id: 0,
    nodes: [],
    links: [],
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
  };
}

/**
 * Workflow JSON として最小限の形を満たすか検証する。
 * 満たさない場合は理由付きで throw する（黙って空グラフにしない）。
 */
export function parseWorkflow(value: unknown): Workflow {
  if (!isRecord(value)) {
    throw new WorkflowParseError(t('graph.parse.notObject'));
  }
  if (!isUnknownArray(value.nodes)) {
    throw new WorkflowParseError(t('graph.parse.noNodes'));
  }
  if (!isUnknownArray(value.links)) {
    throw new WorkflowParseError(t('graph.parse.noLinks'));
  }
  const invalid = value.nodes.findIndex((node) => !isNode(node));
  if (invalid >= 0) {
    throw new WorkflowParseError(t('graph.parse.invalidNode', { index: String(invalid) }));
  }
  // 同じ id のノードが 2 つあると、線の行き先・置き換え・実行の形でどちらを指すか決まらない。
  // 黙って振り直すと線がどちらに付くか分からないので、読み込まずに断る
  const seen = new Set<number>();
  for (const [index, node] of value.nodes.entries()) {
    const id = isNode(node) ? node.id : null;
    if (id === null) continue;
    if (seen.has(id)) {
      throw new WorkflowParseError(
        t('graph.parse.duplicateNode', { id: String(id), index: String(index) }),
      );
    }
    seen.add(id);
  }

  return value as unknown as Workflow;
}

/** 定義の一覧は型の置き場にある（線の採番が読むため。ここから読む所のために名前を残す） */
export { subgraphDefinitions } from '@/graph/types';

/**
 * 参照先が存在しないリンクと、存在しないリンクを指す入力/出力の参照を落とす。
 * subgraph 内の「境界リンク」は links[] に実体を持たないため対象にしない。
 */
export function removeDanglingLinks(workflow: Workflow): Workflow {
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  const index = linkIndex(workflow.links);

  const aliveLinks = new Set<LinkId>();
  for (const [id, link] of index) {
    if (nodeIds.has(link.originId) && nodeIds.has(link.targetId)) aliveLinks.add(id);
  }

  if (aliveLinks.size === index.size) {
    const untouched = workflow.nodes.every(
      (node) =>
        nodeInputs(node).every((input) => input.link === null || aliveLinks.has(input.link)) &&
        nodeOutputs(node).every((output) => (output.links ?? []).every((id) => aliveLinks.has(id))),
    );
    if (untouched) return workflow;
  }

  const nodes = workflow.nodes.map((node) => {
    // 形を確かめて読む。口が無いノードには足さない
    const inputs = !Array.isArray(node.inputs)
      ? undefined
      : nodeInputs(node).map((input) =>
          input.link !== null && !aliveLinks.has(input.link) ? { ...input, link: null } : input,
        );
    const outputs = !Array.isArray(node.outputs)
      ? undefined
      : nodeOutputs(node).map((output) => {
          if (!output.links) return output;
          const links = output.links.filter((id) => aliveLinks.has(id));
          return links.length === output.links.length ? output : { ...output, links };
        });

    return {
      ...node,
      ...(inputs ? { inputs } : {}),
      ...(outputs ? { outputs } : {}),
    };
  });

  return {
    ...workflow,
    nodes,
    links: workflow.links.filter((link) => {
      const resolved = readLink(link);
      return resolved !== null && aliveLinks.has(resolved.id);
    }),
  };
}
