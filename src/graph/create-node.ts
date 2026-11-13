import type {
  InputDefinition,
  NodeDefinition,
  NodeId,
  Workflow,
  WorkflowNode,
} from '@/graph/types';
import { widgetSlots } from '@/graph/widgets';
import { nextNodeId } from '@/graph/workflow-ids';

// ─────────────────────────────
// ノード定義から新しいノードを作る。widgets_values は位置で値を対応させるので、スロット数ぴったりに埋める。
// ─────────────────────────────

function defaultFor(definition: NodeDefinition, inputName: string): unknown {
  const input = definition.inputs.find((candidate) => candidate.name === inputName);
  if (!input) return null;

  const configured = input.config.default;
  if (configured !== undefined) return configured;

  if (input.type === 'COMBO') return input.options?.[0] ?? '';
  if (input.type === 'INT' || input.type === 'FLOAT') return 0;
  if (input.type === 'BOOLEAN') return false;
  return '';
}

/**
 * ソケットとして並ぶ入力（widget にならないもの）。
 * **ノードの `inputs` の並びと同じ**なので、繋ぎ先を選ぶ側もこれを使う。
 */
export function socketInputs(definition: NodeDefinition): readonly InputDefinition[] {
  return definition.inputs.filter((input) => !input.isWidget);
}

/**
 * ノード定義から、既定の値を埋めた新しいノードを作る。
 * @param blank - 空にしておく入力（モデルを選ぶ選択肢）
 */
export function createNode(
  definition: NodeDefinition,
  id: NodeId,
  pos: [number, number] = [0, 0],
  blank: ReadonlySet<string> = new Set(),
): WorkflowNode {
  return {
    id,
    type: definition.name,
    pos,
    mode: 0,
    // widget にならない入力だけがソケットとして並ぶ
    inputs: socketInputs(definition).map((input) => ({
      name: input.name,
      type: input.type,
      link: null,
    })),
    outputs: definition.outputs.map((output) => ({
      name: output.name,
      type: output.type,
      links: [],
    })),
    properties: { 'Node name for S&R': definition.name },
    widgets_values: widgetSlots(definition).map((slot) =>
      slot.kind === 'value'
        ? blank.has(slot.input)
          ? ''
          : defaultFor(definition, slot.input)
        : slot.kind === 'upload'
          ? ''
          : 'fixed',
    ),
  };
}

/** ノードを1つ足した Workflow。id が重なるときは何もしない（呼び出し側の取り違え防止） */
export function withNewNode(workflow: Workflow, node: WorkflowNode): Workflow {
  if (workflow.nodes.some((existing) => existing.id === node.id)) return workflow;

  return {
    ...workflow,
    nodes: [...workflow.nodes, node],
    last_node_id: Math.max(node.id, nextNodeId(workflow) - 1),
  };
}
