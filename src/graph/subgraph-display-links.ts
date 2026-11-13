import { linkIndex, readLink } from '@/graph/link-read';
import {
  nodeInputs,
  nodeOutputs,
  SUBGRAPH_IO_NODE_ID,
  type LinkId,
  type NodeId,
  type ResolvedLink,
  type SubgraphDefinition,
  type Workflow,
  type WorkflowLink,
  type WorkflowNode,
} from '@/graph/types';

// ─────────────────────────────
// 開いた subgraph の境界をまたぐ線を、表示用のワークフローの線へ解く。
// ─────────────────────────────

interface End {
  readonly id: NodeId;
  readonly slot: number;
}

/** 開いた subgraph の階層と、その中の線 */
export interface OpenLevel {
  readonly definition: SubgraphDefinition;
  readonly level: Workflow;
  readonly links: readonly ResolvedLink[];
}

/** 線の行き先を透かす（入口・出口と、開いたインスタンスを通り抜ける） */
function resolver(
  workflow: Workflow,
  levels: ReadonlyMap<NodeId, OpenLevel>,
): {
  readonly outerSource: (instanceId: NodeId, inputName: string) => End | null;
  readonly innerOrigin: (instanceId: NodeId, slot: number) => End | null;
} {
  const rootById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const rootLinks = linkIndex(workflow.links);
  // 入口と出口を行き来して輪になる形でも止まるように、深さを区切る
  const LIMIT = 16;

  const outerSource = (instanceId: NodeId, inputName: string, depth = 0): End | null => {
    if (depth > LIMIT) return null;
    const input = nodeInputs(rootById.get(instanceId)).find((slot) => slot.name === inputName);
    const link = input === undefined || input.link === null ? undefined : rootLinks.get(input.link);
    if (!link) return null;
    return levels.has(link.originId)
      ? innerOrigin(link.originId, link.originSlot, depth + 1)
      : { id: link.originId, slot: link.originSlot };
  };

  const innerOrigin = (instanceId: NodeId, slot: number, depth = 0): End | null => {
    const open = levels.get(instanceId);
    if (!open || depth > LIMIT) return null;
    const link = open.links.find(
      (candidate) =>
        candidate.targetId === SUBGRAPH_IO_NODE_ID.output && candidate.targetSlot === slot,
    );
    if (!link) return null;
    if (link.originId !== SUBGRAPH_IO_NODE_ID.input) {
      return { id: link.originId, slot: link.originSlot };
    }
    // 入口から出口へ素通しの線
    const name = open.definition.inputs?.[link.originSlot]?.name;
    return name === undefined ? null : outerSource(instanceId, name, depth + 1);
  };

  return { outerSource, innerOrigin };
}

/** 透かした線を作る（id と受け手はそのまま、出どころだけ差し替える） */
function rerouted(link: ResolvedLink, origin: End): WorkflowLink {
  return [link.id, origin.id, origin.slot, link.targetId, link.targetSlot, link.type];
}

/**
 * 表示の線。外の線は、開いたインスタンスへ入るものを落とし、開いたインスタンスから出るものを
 * 中の出どころから張り直す。中の線は、出口へのものを落とし、入口からのものを外の出どころから張る
 */
export function displayLinks(
  workflow: Workflow,
  levels: ReadonlyMap<NodeId, OpenLevel>,
): WorkflowLink[] {
  const { outerSource, innerOrigin } = resolver(workflow, levels);
  const result: WorkflowLink[] = [];

  for (const raw of workflow.links) {
    const link = readLink(raw);
    if (!link || levels.has(link.targetId)) continue;
    if (!levels.has(link.originId)) {
      result.push(raw);
      continue;
    }
    const origin = innerOrigin(link.originId, link.originSlot);
    if (origin) result.push(rerouted(link, origin));
  }

  for (const [instanceId, open] of levels) {
    for (const link of open.links) {
      if (link.targetId === SUBGRAPH_IO_NODE_ID.output) continue;
      if (link.originId !== SUBGRAPH_IO_NODE_ID.input) {
        result.push(rerouted(link, { id: link.originId, slot: link.originSlot }));
        continue;
      }
      const name = open.definition.inputs?.[link.originSlot]?.name;
      const origin = name === undefined ? null : outerSource(instanceId, name);
      if (origin) result.push(rerouted(link, origin));
    }
  }
  return result;
}

/** 入出力の口の線を、表示の線に合わせる。変わらなければ同じノードを返す */
export function withDisplayLinks(
  node: WorkflowNode,
  links: ReadonlyMap<LinkId, ResolvedLink>,
  outgoing: ReadonlyMap<string, readonly LinkId[]>,
): WorkflowNode {
  let changed = false;
  const inputs = Array.isArray(node.inputs)
    ? nodeInputs(node).map((input, slot) => {
        const link = input.link === null ? undefined : links.get(input.link);
        const keep = link?.targetId === node.id && link.targetSlot === slot;
        if (keep || input.link === null) return input;
        changed = true;
        return { ...input, link: null };
      })
    : undefined;
  const outputs = Array.isArray(node.outputs)
    ? nodeOutputs(node).map((output, slot) => {
        const ids = outgoing.get(`${String(node.id)}:${String(slot)}`) ?? [];
        const current = output.links ?? [];
        const kept = current.filter((id) => ids.includes(id));
        const next = [...kept, ...ids.filter((id) => !kept.includes(id))];
        if (next.length === current.length && next.every((id, at) => current[at] === id)) {
          return output;
        }
        changed = true;
        return { ...output, links: next };
      })
    : undefined;
  if (!changed) return node;
  return {
    ...node,
    ...(inputs ? { inputs } : {}),
    ...(outputs ? { outputs } : {}),
  };
}
