import {
  applyAppValues,
  appValuesInUse,
  savedAppValues,
  withoutSavedAppValues,
} from '@/graph/app-input-values';
import { parseWorkflow, subgraphDefinitions } from '@/graph/normalize';
import { toApiPrompt, type ApiPrompt } from '@/graph/to-api-prompt';
import type {
  InputDefinition,
  NodeDefinition,
  NodeDefinitionMap,
  Workflow,
  WorkflowNode,
} from '@/graph/types';
import { widgetSlots } from '@/graph/widgets';
import { isUnknownArray } from '@/lib/guards';
import { ownOr } from '@/lib/own-key';

export type ValueSlot = readonly [nodeId: string, input: string];

export type SlotNode = readonly [name: string] | readonly [name: string, comment: string];

export interface SplitRun {
  readonly api: ApiPrompt;
  readonly nodes: Readonly<Record<string, SlotNode>>;
  readonly seedSlots: readonly ValueSlot[];
  readonly promptSlots: readonly ValueSlot[];
  readonly seeds: readonly unknown[];
  readonly prompts: readonly unknown[];
}

function isPromptInput(input: InputDefinition | undefined): boolean {
  if (input === undefined || input.type !== 'STRING') return false;
  const multiline = input.config.multiline;
  return multiline !== undefined && multiline !== null && multiline !== false;
}

function isSeedInput(definition: NodeDefinition, name: string): boolean {
  return widgetSlots(definition).some(
    (slot) => slot.input === name && slot.kind === 'control_after_generate',
  );
}

function byNodeId(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

function nodeAt(workflow: Workflow, promptNodeId: string): WorkflowNode | undefined {
  const subgraphs = subgraphDefinitions(workflow);
  let nodes = workflow.nodes;
  let found: WorkflowNode | undefined;
  for (const part of promptNodeId.split(':')) {
    found = nodes.find((node) => String(node.id) === part);
    if (found === undefined) return undefined;
    const type = found.type;
    nodes = subgraphs.find((subgraph) => subgraph.id === type)?.nodes ?? [];
  }
  return found;
}

function slotNode(
  workflow: Workflow,
  promptNodeId: string,
  classType: string,
  definition: NodeDefinition,
): SlotNode {
  const node = nodeAt(workflow, promptNodeId);
  const name = definition.displayName.length > 0 ? definition.displayName : classType;
  const comment = typeof node?.title === 'string' ? node.title : '';
  return comment.length > 0 && comment !== name ? [name, comment] : [name];
}

export function splitRun(raw: unknown, definitions: NodeDefinitionMap): SplitRun | null {
  let api: ApiPrompt;
  let base: Workflow;
  try {
    const workflow = parseWorkflow(raw);
    base = withoutSavedAppValues(workflow);
    const values = appValuesInUse(base, savedAppValues(workflow));
    api = applyAppValues(toApiPrompt(base, definitions).prompt, values);
  } catch {
    return null;
  }

  const seedSlots: ValueSlot[] = [];
  const promptSlots: ValueSlot[] = [];
  const nodes: Record<string, SlotNode> = {};
  for (const nodeId of Object.keys(api).sort(byNodeId)) {
    const node = api[nodeId];
    const definition = node === undefined ? undefined : definitions.get(node.class_type);
    if (node === undefined || definition === undefined) continue;
    const inputs = new Map(definition.inputs.map((input) => [input.name, input]));
    for (const [name, value] of Object.entries(node.inputs)) {
      if (isUnknownArray(value)) continue;
      if (isSeedInput(definition, name)) seedSlots.push([nodeId, name]);
      else if (isPromptInput(inputs.get(name))) promptSlots.push([nodeId, name]);
      else continue;
      ownOr(nodes, nodeId, () => slotNode(base, nodeId, node.class_type, definition));
    }
  }

  const read = ([nodeId, name]: ValueSlot): unknown => api[nodeId]?.inputs[name] ?? null;
  return {
    api,
    nodes,
    seedSlots,
    promptSlots,
    seeds: seedSlots.map(read),
    prompts: promptSlots.map(read),
  };
}

interface AnnotatedFile {
  readonly filename: string;
  readonly subfolder: string;
  readonly type: string;
}

export function outputPath(file: AnnotatedFile): string {
  const path = file.subfolder === '' ? file.filename : `${file.subfolder}/${file.filename}`;
  return file.type === 'output' ? path : `${path} [${file.type}]`;
}

export function outputRefOf(path: string): AnnotatedFile {
  const annotated = / \[([a-z]+)\]$/u.exec(path);
  const type = annotated?.[1] ?? 'output';
  const name = annotated === null ? path : path.slice(0, annotated.index);
  const cut = name.lastIndexOf('/');
  return cut < 0
    ? { filename: name, subfolder: '', type }
    : { filename: name.slice(cut + 1), subfolder: name.slice(0, cut), type };
}
