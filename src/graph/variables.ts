import { linkIndex } from '@/graph/link-read';
import { orderedNodeIds } from '@/graph/order';
import { createOutputValues } from '@/graph/output-values';
import type { NodeView } from '@/graph/rows';
import { subgraphMap } from '@/graph/subgraph';
import {
  FRONTEND_ONLY_TYPES,
  NODE_MODE,
  nodeInputs,
  nodeOutputs,
  slotTypeName,
  type LinkId,
  type NodeDefinitionMap,
  type NodeId,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import type { ValuePart } from '@/graph/widgets';
import { t } from '@/i18n';
import { reportFault } from '@/lib/fault';

// ─────────────────────────────
// 変数パネルのデータ。各ノードの outputs[] を横断し、出力スロットごとに変数ボックスを作る。
// ─────────────────────────────

/** 変数を消費する入力 1 つ */
export interface VariableTarget {
  readonly nodeId: NodeId;
  readonly inputName: string;
  /** 結んでいるリンク。線の鍵に使う（同じ入力名が並ぶノードでも取り違えない） */
  readonly linkId?: LinkId | undefined;
}

/** 変数ボックス（出力スロット 1 つ） */
export interface VariableBox {
  /** `${nodeId}:${slot}` */
  readonly key: string;
  readonly nodeId: NodeId;
  readonly slot: number;
  readonly name: string;
  readonly type: string;
  /** 生成元ノードの表示名 */
  readonly sourceLabel: string;
  /** その出力に流れる値の目安（上流から引き継いだものを含む） */
  readonly values: readonly ValuePart[];
  /** 生成元がミュートされている＝この変数は作られない */
  readonly muted: boolean;
  /** この変数を消費する入力 */
  readonly targets: readonly VariableTarget[];
}

/** カード単位でまとめた変数（パネルではこの単位で枠を描く） */
export interface VariableGroup {
  readonly nodeId: NodeId;
  /** カードの通し番号 */
  readonly index: string | null;
  /** ラベル。コメントがあればコメント、無ければノード名 */
  readonly label: string;
  /** 生成元が無効（ミュート・バイパス）。見出しに取り消し線を引く */
  readonly disabled: boolean;
  readonly boxes: readonly VariableBox[];
}

/** 表示順（カードの並び）でグループ化する */
export function groupVariableBoxes(
  views: readonly NodeView[],
  boxes: readonly VariableBox[],
): VariableGroup[] {
  const byNode = new Map<NodeId, VariableBox[]>();
  for (const box of boxes) {
    byNode.set(box.nodeId, [...(byNode.get(box.nodeId) ?? []), box]);
  }

  const groups: VariableGroup[] = [];
  for (const view of views) {
    const owned = byNode.get(view.id);
    if (!owned || owned.length === 0) continue;

    groups.push({
      nodeId: view.id,
      index: view.index,
      label: view.comment.length > 0 ? view.comment : view.displayName,
      disabled: view.mode === NODE_MODE.mute || view.mode === NODE_MODE.bypass,
      boxes: owned,
    });
  }
  return groups;
}

/** 変数ボックスの鍵（`${nodeId}:${slot}`） */
export function variableKey(nodeId: NodeId, slot: number): string {
  return `${nodeId}:${slot}`;
}

/** ワークフローの全ノードの出力から、カードと同じ並びで変数ボックスを組み立てる */
export function buildVariableBoxes(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
): VariableBox[] {
  const subgraphs = subgraphMap(workflow);
  const links = linkIndex(workflow.links);
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));

  const label = (node: WorkflowNode): string =>
    subgraphs.get(node.type)?.name ?? definitions.get(node.type)?.displayName ?? node.type;

  const targetsFor = (nodeId: NodeId, slot: number): VariableTarget[] => {
    const targets: VariableTarget[] = [];
    for (const link of links.values()) {
      if (link.originId !== nodeId || link.originSlot !== slot) continue;

      // **受け側の入力が実際に指しているリンクだけ**を数える。`links[]` に残った古いリンク
      // （入力はもう別のリンクを指している）を数えると、同じ入力へ線が二重に引かれる
      const input = nodeInputs(byId.get(link.targetId))[link.targetSlot];
      if (input === undefined || input.link !== link.id) continue;
      targets.push({ nodeId: link.targetId, inputName: input.name, linkId: link.id });
    }
    return targets;
  };

  // 変数の中身の手がかり。素通し系のノードでは上流の値を引き継ぐ（`output-values`）
  const outputValue = createOutputValues(workflow, definitions);

  /** 1 ノードぶんの変数。途中で失敗したら 1 つも出さない（半端に出さない） */
  const boxesOf = (node: WorkflowNode): VariableBox[] =>
    nodeOutputs(node).map((output, slot) => ({
      key: variableKey(node.id, slot),
      nodeId: node.id,
      slot,
      name: output.name,
      type: slotTypeName(output.type),
      sourceLabel: label(node),
      values: outputValue(node.id, slot),
      muted: node.mode === NODE_MODE.mute,
      targets: targetsFor(node.id, slot),
    }));

  // カードと同じ並び順で返す（パネルは詰めて並べるので、ここでの順序がそのまま表示順になる）
  const boxes: VariableBox[] = [];
  for (const id of orderedNodeIds(workflow)) {
    const node = byId.get(id);
    if (!node) continue;
    if (node.type === FRONTEND_ONLY_TYPES.reroute) continue;

    // 1 ノードずつ閉じ込める。読めないノードの変数だけを外す
    try {
      boxes.push(...boxesOf(node));
    } catch (error) {
      reportFault(
        t('fault.where.nodeVariables', { id: String(node.id), type: String(node.type) }),
        error,
      );
    }
  }
  return boxes;
}
