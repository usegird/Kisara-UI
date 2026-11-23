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

export interface VariableTarget {
  readonly nodeId: NodeId;
  readonly inputName: string;
  readonly linkId?: LinkId | undefined;
}

export interface VariableBox {
  readonly key: string;
  readonly nodeId: NodeId;
  readonly slot: number;
  readonly name: string;
  readonly type: string;
  readonly sourceLabel: string;
  readonly values: readonly ValuePart[];
  readonly muted: boolean;
  readonly targets: readonly VariableTarget[];
}

export interface VariableGroup {
  readonly nodeId: NodeId;
  readonly index: string | null;
  readonly label: string;
  readonly disabled: boolean;
  readonly boxes: readonly VariableBox[];
}

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

export function variableKey(nodeId: NodeId, slot: number): string {
  return `${nodeId}:${slot}`;
}

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

      const input = nodeInputs(byId.get(link.targetId))[link.targetSlot];
      if (input === undefined || input.link !== link.id) continue;
      targets.push({ nodeId: link.targetId, inputName: input.name, linkId: link.id });
    }
    return targets;
  };

  const outputValue = createOutputValues(workflow, definitions);

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

  const boxes: VariableBox[] = [];
  for (const id of orderedNodeIds(workflow)) {
    const node = byId.get(id);
    if (!node) continue;
    if (node.type === FRONTEND_ONLY_TYPES.reroute) continue;

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
