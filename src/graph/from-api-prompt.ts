import { createNode } from '@/graph/create-node';
import { definitionOf } from '@/graph/frontend-nodes';
import { addLink, withWidgetInput } from '@/graph/links';
import { arrangeByProcessing } from '@/graph/order';
import {
  nodeInputs,
  nodeOutputs,
  type NodeDefinition,
  type NodeDefinitionMap,
  type NodeId,
  type Workflow,
  type WorkflowNode,
  type WorkflowNodeInput,
  type WorkflowNodeOutput,
} from '@/graph/types';
import { writeWidgetValue } from '@/graph/widgets';
import { isRecord } from '@/lib/guards';

interface PromptNode {
  readonly class_type: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly _meta?: unknown;
}

export function isApiPrompt(raw: unknown): raw is Readonly<Record<string, PromptNode>> {
  if (!isRecord(raw)) return false;
  const nodes = Object.values(raw);
  return (
    nodes.length > 0 &&
    nodes.every(
      (node) => isRecord(node) && typeof node.class_type === 'string' && isRecord(node.inputs),
    )
  );
}

function linkRef(value: unknown): { readonly id: string; readonly slot: number } | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [id, slot] = value as unknown[];
  if ((typeof id !== 'string' && typeof id !== 'number') || !Number.isInteger(slot)) return null;
  return { id: String(id), slot: slot as number };
}

function nodeIds(keys: readonly string[]): Map<string, NodeId> {
  const ids = new Map<string, NodeId>();
  const numeric = (key: string): boolean => /^\d+$/.test(key);
  for (const key of keys) if (numeric(key)) ids.set(key, Number(key));
  let next = Math.max(0, ...ids.values()) + 1;
  for (const key of keys) if (!numeric(key)) ids.set(key, next++);
  return ids;
}

function titleOf(node: PromptNode): string | null {
  const meta = node._meta;
  return isRecord(meta) && typeof meta.title === 'string' ? meta.title : null;
}

function knownNode(node: PromptNode, id: NodeId, definition: NodeDefinition): WorkflowNode {
  let built = createNode(definition, id);
  for (const [name, value] of Object.entries(node.inputs)) {
    if (linkRef(value) === null) built = writeWidgetValue(built, definition, name, value) ?? built;
  }
  const title = titleOf(node);
  return title === null || title === definition.displayName ? built : { ...built, title };
}

function unknownNode(node: PromptNode, id: NodeId): WorkflowNode {
  const entries = Object.entries(node.inputs);
  const inputs: WorkflowNodeInput[] = entries
    .filter(([, value]) => linkRef(value) !== null)
    .map(([name]) => ({ name, type: '*', link: null }));
  const title = titleOf(node);
  return {
    id,
    type: node.class_type,
    pos: [0, 0],
    mode: 0,
    inputs,
    outputs: [],
    properties: { 'Node name for S&R': node.class_type },
    widgets_values: entries.filter(([, value]) => linkRef(value) === null).map(([, v]) => v),
    ...(title === null ? {} : { title }),
  };
}

function withOutputUpTo(workflow: Workflow, id: NodeId, slot: number): Workflow {
  const node = workflow.nodes.find((candidate) => candidate.id === id);
  if (!node) return workflow;
  const outputs: WorkflowNodeOutput[] = [...nodeOutputs(node)];
  if (outputs.length > slot) return workflow;
  while (outputs.length <= slot) outputs.push({ name: '*', type: '*', links: [] });
  return {
    ...workflow,
    nodes: workflow.nodes.map((candidate) =>
      candidate.id === id ? { ...node, outputs } : candidate,
    ),
  };
}

function inputSlot(
  workflow: Workflow,
  id: NodeId,
  name: string,
  definition: NodeDefinition | undefined,
): { readonly workflow: Workflow; readonly slot: number } | null {
  const node = workflow.nodes.find((candidate) => candidate.id === id);
  const at = nodeInputs(node).findIndex((input) => input.name === name);
  if (at >= 0) return { workflow, slot: at };
  const type = definition?.inputs.find((input) => input.name === name)?.type ?? '*';
  return withWidgetInput(workflow, id, name, type);
}

export function workflowFromApiPrompt(
  prompt: Readonly<Record<string, PromptNode>>,
  definitions: NodeDefinitionMap,
): Workflow {
  const keys = Object.keys(prompt);
  const ids = nodeIds(keys);

  const nodes = keys.flatMap((key) => {
    const node = prompt[key];
    const id = ids.get(key);
    if (!node || id === undefined) return [];
    const definition = definitionOf(definitions, node.class_type);
    return [definition ? knownNode(node, id, definition) : unknownNode(node, id)];
  });

  let workflow: Workflow = {
    last_node_id: Math.max(0, ...nodes.map((node) => node.id)),
    last_link_id: 0,
    nodes,
    links: [],
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
  };

  for (const key of keys) {
    const node = prompt[key];
    const targetId = ids.get(key);
    if (!node || targetId === undefined) continue;
    const definition = definitionOf(definitions, node.class_type);
    for (const [name, value] of Object.entries(node.inputs)) {
      const ref = linkRef(value);
      const originId = ref === null ? undefined : ids.get(ref.id);
      if (ref === null || originId === undefined) continue;
      const target = inputSlot(workflow, targetId, name, definition);
      if (!target) continue;
      workflow = withOutputUpTo(target.workflow, originId, ref.slot);
      workflow = addLink(workflow, {
        originId,
        originSlot: ref.slot,
        targetId,
        targetSlot: target.slot,
      });
    }
  }

  return arrangeByProcessing(workflow, undefined, { fromOrigin: true });
}
