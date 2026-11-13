import { linkIndex, readLink } from '@/graph/link-read';
import { inputSlotFor, outputSlotFor, typesMatch } from '@/graph/slot-types';
import {
  nodeInputs,
  nodeOutputs,
  slotTypeName,
  type LinkId,
  type NodeId,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { nextLinkId, nextNodeId } from '@/graph/workflow-ids';

// ─────────────────────────────
// リンク操作。すべて純関数で、入力の Workflow は変更しない。
// リンクはルートがタプル、subgraph の中がオブジェクトの形なので、書くのはルートだけ（読むのは link-read.ts）。
// ─────────────────────────────

/** id でノードを探す */
export function findNode(workflow: Workflow, id: NodeId): WorkflowNode | undefined {
  return workflow.nodes.find((node) => node.id === id);
}

/** 対象ノードだけ差し替えた nodes 配列を返す */
function replaceNode(
  nodes: readonly WorkflowNode[],
  id: NodeId,
  update: (node: WorkflowNode) => WorkflowNode,
): WorkflowNode[] {
  return nodes.map((node) => (node.id === id ? update(node) : node));
}

function clearInputLink(node: WorkflowNode, slot: number, linkId: LinkId): WorkflowNode {
  if (!Array.isArray(node.inputs)) return node;
  const inputs = nodeInputs(node);

  return {
    ...node,
    inputs: inputs.map((input, index) =>
      index === slot && input.link === linkId ? { ...input, link: null } : input,
    ),
  };
}

function removeOutputLink(node: WorkflowNode, slot: number, linkId: LinkId): WorkflowNode {
  if (!Array.isArray(node.outputs)) return node;
  const outputs = nodeOutputs(node);

  return {
    ...node,
    outputs: outputs.map((output, index) => {
      if (index !== slot || !output.links) return output;
      return { ...output, links: output.links.filter((id) => id !== linkId) };
    }),
  };
}

/** リンクを 1 本外し、両端の口の参照も外す。無ければ同じものを返す */
export function removeLink(workflow: Workflow, linkId: LinkId): Workflow {
  const target = linkIndex(workflow.links).get(linkId);
  if (!target) return workflow;

  let nodes = replaceNode(workflow.nodes, target.targetId, (node) =>
    clearInputLink(node, target.targetSlot, linkId),
  );
  nodes = replaceNode(nodes, target.originId, (node) =>
    removeOutputLink(node, target.originSlot, linkId),
  );

  return {
    ...workflow,
    nodes,
    links: workflow.links.filter((link) => readLink(link)?.id !== linkId),
  };
}

/**
 * ノードを外す。**繋がっているリンクもすべて外す**（相手側の入力・出力からも消す）。
 * 無い id なら同じものを返す
 */
export function removeNode(workflow: Workflow, nodeId: NodeId): Workflow {
  if (!findNode(workflow, nodeId)) return workflow;

  let next = workflow;
  for (const link of linkIndex(workflow.links).values()) {
    if (link.originId === nodeId || link.targetId === nodeId) next = removeLink(next, link.id);
  }

  return { ...next, nodes: next.nodes.filter((node) => node.id !== nodeId) };
}

/**
 * ノードを外し、**前後の線をつなぎ直す**（本体の既定に合わせる）。
 * 本体と同じ順で試す: 線が来ている入力ごとに ① 同じ番号の出力 ② 型が合う最初の出力。
 * 選んだ出力の先すべてへ、その入力の元から張る。先 1 本につき最初に張れた 1 回だけが効き、
 * 元の出力と先の入力の型が合わなければ張らずに次を試す。どれでも張れなかった先は外れる
 */
export function removeNodeKeepingLinks(workflow: Workflow, nodeId: NodeId): Workflow {
  const node = findNode(workflow, nodeId);
  if (!node) return workflow;

  const links = linkIndex(workflow.links);
  const inputs = nodeInputs(node);
  const outputs = nodeOutputs(node);
  const outputType = (slot: number): string => slotTypeName(outputs[slot]?.type);

  // 線が来ている入力と、その元
  const sources = inputs.flatMap((input, slot) => {
    const link = typeof input.link === 'number' ? links.get(input.link) : undefined;
    if (!link || link.targetId !== nodeId || link.originId === nodeId) return [];
    const origin = findNode(workflow, link.originId);
    const originType = slotTypeName(nodeOutputs(origin)[link.originSlot]?.type);
    return [{ slot, type: slotTypeName(input.type), link, originType }];
  });
  // 試す順（入力 → 出力の組）
  const tries = [
    ...sources.flatMap((source) =>
      source.slot < outputs.length && typesMatch(source.type, outputType(source.slot))
        ? [{ source, output: source.slot }]
        : [],
    ),
    ...sources.flatMap((source) => {
      const output = outputs.findIndex((_, slot) => typesMatch(source.type, outputType(slot)));
      return output < 0 ? [] : [{ source, output }];
    }),
  ];

  const bridges: AddLinkParams[] = [];
  for (const link of links.values()) {
    if (link.originId !== nodeId || link.targetId === nodeId) continue;
    const target = findNode(workflow, link.targetId);
    const targetType = slotTypeName(nodeInputs(target)[link.targetSlot]?.type);
    const chosen = tries.find(
      ({ source, output }) =>
        output === link.originSlot && typesMatch(source.originType, targetType),
    );
    if (!chosen) continue;
    bridges.push({
      originId: chosen.source.link.originId,
      originSlot: chosen.source.link.originSlot,
      targetId: link.targetId,
      targetSlot: link.targetSlot,
    });
  }

  return bridges.reduce(addLink, removeNode(workflow, nodeId));
}

/**
 * その**入力スロット**に入っているリンク。
 * パラメータの ▶ から「この入力の手前へ」ノードを挿し込むときの対象。
 */
export function incomingLinkTo(workflow: Workflow, targetId: NodeId, slot: number): LinkId | null {
  const link = nodeInputs(findNode(workflow, targetId))[slot]?.link;
  return typeof link === 'number' ? link : null;
}

/**
 * パラメータ（widget）を**線で受けられる入力**にする。`inputs[]` に同じ名前があればその位置、
 * 無ければ `widget` 付きの項目を末尾に足してその位置を返す（ComfyUI 本体が widget を入力に
 * 変えたときと同じ形）。値の並び（`widgets_values`）は触らない。ノードが無ければ null。
 */
export function withWidgetInput(
  workflow: Workflow,
  nodeId: NodeId,
  widget: string,
  type: string,
): { readonly workflow: Workflow; readonly slot: number } | null {
  const node = findNode(workflow, nodeId);
  if (!node) return null;

  const inputs = nodeInputs(node);
  const at = inputs.findIndex((input) => input.name === widget);
  if (at >= 0) return { workflow, slot: at };

  const added = { name: widget, type, widget: { name: widget }, link: null };
  return {
    workflow: {
      ...workflow,
      nodes: replaceNode(workflow.nodes, nodeId, (current) => ({
        ...current,
        inputs: [...inputs, added],
      })),
    },
    slot: inputs.length,
  };
}

/** 張るリンクの両端 */
interface AddLinkParams {
  readonly originId: NodeId;
  readonly originSlot: number;
  readonly targetId: NodeId;
  readonly targetSlot: number;
}

/**
 * リンクを1本張る。入力は1本しか受けられないため、既存リンクがあれば先に外す。
 * 型不一致は許容する（型不一致のバリデーションは据え置き）。
 */
export function addLink(workflow: Workflow, params: AddLinkParams): Workflow {
  const { originId, originSlot, targetId, targetSlot } = params;

  const origin = findNode(workflow, originId);
  const target = findNode(workflow, targetId);
  if (!origin || !target) return workflow;

  const existing = nodeInputs(target)[targetSlot]?.link;
  const base = typeof existing === 'number' ? removeLink(workflow, existing) : workflow;

  const id = nextLinkId(base);
  const type = slotTypeName(nodeOutputs(origin)[originSlot]?.type);

  let nodes = replaceNode(base.nodes, targetId, (node) => {
    if (!Array.isArray(node.inputs)) return node;
    const inputs = nodeInputs(node);
    return {
      ...node,
      inputs: inputs.map((input, index) => (index === targetSlot ? { ...input, link: id } : input)),
    };
  });

  nodes = replaceNode(nodes, originId, (node) => {
    if (!Array.isArray(node.outputs)) return node;
    const outputs = nodeOutputs(node);
    return {
      ...node,
      outputs: outputs.map((output, index) => {
        if (index !== originSlot) return output;
        return { ...output, links: [...(output.links ?? []), id] };
      }),
    };
  });

  return {
    ...base,
    nodes,
    links: [...base.links, [id, originId, originSlot, targetId, targetSlot, type]],
    last_link_id: id,
  };
}

/**
 * 新しいノードを、呼び出し元のスロットへ繋ぐ指定。
 *   ・`after` : そのスロット（出力）から新しいノードの入力へ
 *   ・`before`: 新しいノードの出力からそのスロット（入力）へ
 * **型が合う位置に繋ぐ**。合うものが無ければ繋がない（勝手な相手を選ばない）。
 */
export interface ConnectRequest {
  readonly kind: 'after' | 'before';
  readonly nodeId: NodeId;
  /** 呼び出し元の口。`before` でパラメータから足すとき、項目がまだ無ければ null */
  readonly slot: number | null;
  readonly type: string;
  /** `before` でパラメータから足すときの widget 名。繋ぐ前に入力へ変える */
  readonly widget?: string | undefined;
  /** 新しいノード側の口。決まっていなければ型で選ぶ */
  readonly newSlot?: number | undefined;
}

/** 足したノードを、指定どおり呼び出し元のスロットへ繋ぐ。繋げなければそのまま返す */
export function linkNewNode(
  workflow: Workflow,
  node: WorkflowNode,
  connect: ConnectRequest,
): Workflow {
  if (connect.kind === 'after') {
    if (connect.slot === null) return workflow;
    const targetSlot = connect.newSlot ?? inputSlotFor(node, connect.type);
    if (targetSlot === null) return workflow;

    return addLink(workflow, {
      originId: connect.nodeId,
      originSlot: connect.slot,
      targetId: node.id,
      targetSlot,
    });
  }

  const originSlot = connect.newSlot ?? outputSlotFor(node, connect.type);
  if (originSlot === null) return workflow;

  const target = beforeTarget(workflow, connect);
  if (target === null) return workflow;

  return addLink(target.workflow, {
    originId: node.id,
    originSlot,
    targetId: connect.nodeId,
    targetSlot: target.slot,
  });
}

/** `before` で繋ぐ先の入力。パラメータへ繋ぐときは、先に `inputs[]` へ項目を用意する */
function beforeTarget(
  workflow: Workflow,
  connect: ConnectRequest,
): { readonly workflow: Workflow; readonly slot: number } | null {
  if (connect.widget !== undefined) {
    return withWidgetInput(workflow, connect.nodeId, connect.widget, connect.type);
  }
  return connect.slot === null ? null : { workflow, slot: connect.slot };
}

/** リンクの間にノードを挟むときの、挟むノードの繋ぐ口 */
export interface InsertNodeOptions {
  /** 挿入するノードのどの入力へ繋ぐか */
  readonly inputSlot?: number;
  /** 挿入するノードのどの出力から繋ぐか */
  readonly outputSlot?: number;
}

/**
 * A→B のリンクを削除し、A→N・N→B の2本を張り直す。
 * 型不一致は許容し、ユーザーの手動修正に委ねる。
 */
export function insertNodeBetween(
  workflow: Workflow,
  linkId: LinkId,
  node: WorkflowNode,
  options: InsertNodeOptions = {},
): Workflow {
  return insertNodeAcross(workflow, [linkId], node, options);
}

/**
 * **同じ出力から出ている**リンク（A→B, A→C …）をまとめて外し、A→N と N→B, N→C … を張る
 * （出力から変数への点線の ⊕）。出どころが違うリンクが混じれば何もしない。
 */
export function insertNodeAcross(
  workflow: Workflow,
  linkIds: readonly LinkId[],
  node: WorkflowNode,
  options: InsertNodeOptions = {},
): Workflow {
  const index = linkIndex(workflow.links);
  const links = linkIds.map((id) => index.get(id));
  const first = links[0];
  if (!first || links.some((link) => link === undefined)) return workflow;
  const sameOrigin = links.every(
    (link) => link?.originId === first.originId && link.originSlot === first.originSlot,
  );
  if (!sameOrigin) return workflow;
  if (workflow.nodes.some((existing) => existing.id === node.id)) return workflow;

  const inputSlot = options.inputSlot ?? 0;
  const outputSlot = options.outputSlot ?? 0;

  const removed = linkIds.reduce((current, id) => removeLink(current, id), workflow);
  const withNode: Workflow = {
    ...removed,
    nodes: [...removed.nodes, node],
    last_node_id: Math.max(node.id, nextNodeId(removed) - 1),
  };

  const upstream = addLink(withNode, {
    originId: first.originId,
    originSlot: first.originSlot,
    targetId: node.id,
    targetSlot: inputSlot,
  });

  return links.reduce(
    (current, link) =>
      link
        ? addLink(current, {
            originId: node.id,
            originSlot: outputSlot,
            targetId: link.targetId,
            targetSlot: link.targetSlot,
          })
        : current,
    upstream,
  );
}
