import { isAppInput } from '@/graph/app-inputs';
import { isImageUpload } from '@/graph/image-options';
import { numberSpec } from '@/graph/number-spec';
import { ownDataOf, writeOwnData } from '@/graph/own-data';
import { unlinkedNodeIds } from '@/graph/rows';
import { cardIdOfPromptNode } from '@/graph/to-api-prompt';
import {
  NODE_MODE,
  nodeMode,
  type InputDefinition,
  type NodeDefinitionMap,
  type NodeId,
  type Workflow,
} from '@/graph/types';
import { resolveWidgetValues } from '@/graph/widgets';
import { isRecord, isUnknownArray, stringOr } from '@/lib/guards';
import { ownOr, setOwn } from '@/lib/own-key';

const TOOL = 'tool';

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isToolName(name: string): boolean {
  return TOOL_NAME_PATTERN.test(name);
}

export type ArgumentMode = 'overwrite' | 'prepend' | 'append';

const ADDING_MODES: readonly ArgumentMode[] = ['prepend', 'append'];

function modeOf(raw: unknown): ArgumentMode {
  return ADDING_MODES.find((mode) => mode === raw) ?? 'overwrite';
}

interface WorkflowToolParam {
  readonly nodeId: string;
  readonly input: string;
  readonly name: string;
  readonly description: string;
  readonly mode: ArgumentMode;
}

export interface WorkflowTool {
  readonly name: string;
  readonly description: string;
  readonly params: readonly WorkflowToolParam[];
  readonly outputs: readonly string[];
}

function readParams(raw: unknown): WorkflowToolParam[] {
  if (!isRecord(raw)) return [];
  const params: WorkflowToolParam[] = [];
  for (const [nodeId, fields] of Object.entries(raw)) {
    if (!isRecord(fields)) continue;
    for (const [input, spec] of Object.entries(fields)) {
      if (!isRecord(spec)) continue;
      const name = stringOr(spec.name).trim();
      if (name.length === 0) continue;
      params.push({
        nodeId,
        input,
        name,
        description: stringOr(spec.description),
        mode: modeOf(spec.mode),
      });
    }
  }
  return params;
}

export function readWorkflowTool(workflow: unknown): WorkflowTool | null {
  const raw = ownDataOf(workflow)?.[TOOL];
  if (!isRecord(raw)) return null;
  return {
    name: stringOr(raw.name).trim(),
    description: stringOr(raw.description),
    params: readParams(raw.params),
    outputs: isUnknownArray(raw.outputs)
      ? raw.outputs.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export function withWorkflowTool(workflow: Workflow, tool: WorkflowTool | null): Workflow {
  if (tool === null) return writeOwnData(workflow, TOOL, undefined);
  const params: Record<string, Record<string, Record<string, string>>> = {};
  for (const param of tool.params) {
    const fields = ownOr(params, param.nodeId, () => ({}));
    setOwn(fields, param.input, {
      name: param.name,
      description: param.description,
      ...(param.mode === 'overwrite' ? {} : { mode: param.mode }),
    });
  }
  return writeOwnData(workflow, TOOL, {
    name: tool.name,
    description: tool.description,
    params,
    ...(tool.outputs.length > 0 ? { outputs: tool.outputs } : {}),
  });
}

type ArgumentSchema = Readonly<Record<string, unknown>>;

export const AVATAR_REFERENCE = 'avatar';

function isImageInput(input: InputDefinition): boolean {
  return input.type === 'COMBO' && isImageUpload(input.config);
}

export function argumentSchema(input: InputDefinition): ArgumentSchema | null {
  if (input.type === 'STRING') return { type: 'string' };
  if (input.type === 'BOOLEAN') return { type: 'boolean' };
  if (isImageInput(input)) return { type: 'string', enum: [AVATAR_REFERENCE] };
  if (input.type === 'COMBO') {
    const choices = (input.options ?? []).filter((item) => typeof item === 'string');
    return choices.length > 0 ? { type: 'string', enum: choices } : null;
  }
  const spec = numberSpec(input.type, input.config);
  if (spec === null) return null;
  return {
    type: spec.integer ? 'integer' : 'number',
    ...(spec.min === null ? {} : { minimum: spec.min }),
    ...(spec.max === null ? {} : { maximum: spec.max }),
  };
}

export function inputDefinitionOf(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  nodeId: string,
  input: string,
): InputDefinition | null {
  const cardId = cardIdOfPromptNode(nodeId);
  if (cardId === null || String(cardId) !== nodeId) return null;
  const node = workflow.nodes.find((item) => item.id === cardId);
  const definition = node === undefined ? undefined : definitions.get(node.type);
  return definition?.inputs.find((item) => item.name === input) ?? null;
}

export function activeNodeIds(workflow: Workflow): ReadonlySet<NodeId> {
  const unlinked = unlinkedNodeIds(workflow);
  return new Set(
    workflow.nodes
      .filter((node) => nodeMode(node) === NODE_MODE.normal && !unlinked.has(node.id))
      .map((node) => node.id),
  );
}

export function argumentInputNames(workflow: Workflow | null): string[] {
  const tool = workflow === null ? null : readWorkflowTool(workflow);
  if (workflow === null || tool === null) return [];
  const active = activeNodeIds(workflow);
  return tool.params
    .filter((param) => {
      const cardId = cardIdOfPromptNode(param.nodeId);
      return cardId !== null && active.has(cardId);
    })
    .map((param) => `${param.nodeId}/${param.input}=${param.name}`);
}

export interface OutputNode {
  readonly nodeId: string;
}

export function outputNodes(workflow: Workflow, definitions: NodeDefinitionMap): OutputNode[] {
  const active = activeNodeIds(workflow);
  return workflow.nodes
    .filter((node) => active.has(node.id) && definitions.get(node.type)?.outputNode === true)
    .map((node) => ({ nodeId: String(node.id) }));
}

export function passesOutput(outputs: readonly string[], node: string): boolean {
  if (outputs.length === 0) return true;
  const cardId = cardIdOfPromptNode(node);
  return cardId !== null && outputs.includes(String(cardId));
}

export interface ToolArgument {
  readonly nodeId: string;
  readonly input: string;
  readonly name: string;
  readonly description: string;
  readonly mode: ArgumentMode;
  readonly schema: ArgumentSchema;
  readonly image?: true;
}

export function canMerge(schema: ArgumentSchema): boolean {
  return schema.type === 'string' && !Array.isArray(schema.enum);
}

export function toolArguments(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  tool: WorkflowTool,
): ToolArgument[] {
  const seen = new Set<string>();
  const active = activeNodeIds(workflow);
  const result: ToolArgument[] = [];
  for (const param of tool.params) {
    if (!isToolName(param.name) || seen.has(param.name)) continue;
    const cardId = cardIdOfPromptNode(param.nodeId);
    if (cardId === null || !active.has(cardId)) continue;
    if (!isAppInput(workflow, cardId, param.input)) continue;
    const input = inputDefinitionOf(workflow, definitions, param.nodeId, param.input);
    const schema = input === null ? null : argumentSchema(input);
    if (schema === null) continue;
    seen.add(param.name);
    result.push({
      ...param,
      mode: canMerge(schema) ? param.mode : 'overwrite',
      schema,
      ...(input !== null && isImageInput(input) ? { image: true as const } : {}),
    });
  }
  return result;
}

export function withImageChoices(
  args: readonly ToolArgument[],
  references: readonly string[],
): ToolArgument[] {
  return args.map((arg) =>
    arg.image === true ? { ...arg, schema: { ...arg.schema, enum: [...references] } } : arg,
  );
}

export type ArgumentValues = ReadonlyMap<string, Readonly<Record<string, unknown>>>;

interface ImageArgument {
  readonly nodeId: string;
  readonly input: string;
  readonly reference: string;
}

export function imageArguments(
  args: readonly ToolArgument[],
  values: ArgumentValues,
): ImageArgument[] {
  return args.flatMap((arg) => {
    const reference = values.get(arg.nodeId)?.[arg.input];
    return arg.image === true && typeof reference === 'string'
      ? [{ nodeId: arg.nodeId, input: arg.input, reference }]
      : [];
  });
}

export function withArgumentValue(
  values: ArgumentValues,
  nodeId: string,
  input: string,
  value: unknown,
): ArgumentValues {
  const next = new Map(values);
  next.set(nodeId, { ...values.get(nodeId), [input]: value });
  return next;
}

const MERGE_SEPARATOR = ', ';

function nodeValueOf(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  nodeId: string,
  input: string,
): unknown {
  const node = workflow.nodes.find((item) => String(item.id) === nodeId);
  const definition = node === undefined ? undefined : definitions.get(node.type);
  if (node === undefined || definition === undefined) return undefined;
  const resolved = resolveWidgetValues(node, definition);
  return resolved.ok ? resolved.byInput.get(input) : undefined;
}

function addTo(current: string, value: string, mode: 'prepend' | 'append'): string {
  if (mode === 'prepend') {
    const rest = current.replace(/^[\s,]+/u, '');
    return rest.length > 0 ? `${value}${MERGE_SEPARATOR}${rest}` : value;
  }
  const head = current.replace(/[\s,]+$/u, '');
  return head.length > 0 ? `${head}${MERGE_SEPARATOR}${value}` : value;
}

export interface CheckedArguments {
  readonly args: readonly ToolArgument[];
  readonly values: ArgumentValues;
}

export function overlayArgumentValues(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  base: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  { args, values }: CheckedArguments,
): ReadonlyMap<string, Readonly<Record<string, unknown>>> {
  const merged = new Map(base);
  for (const arg of args) {
    const value = values.get(arg.nodeId)?.[arg.input];
    if (value === undefined || (typeof value === 'string' && value.trim().length === 0)) continue;
    let next = value;
    if (arg.mode !== 'overwrite' && typeof value === 'string') {
      const own = base.get(arg.nodeId)?.[arg.input];
      const current = own ?? nodeValueOf(workflow, definitions, arg.nodeId, arg.input);
      next = addTo(typeof current === 'string' ? current : '', value, arg.mode);
    }
    merged.set(arg.nodeId, { ...merged.get(arg.nodeId), [arg.input]: next });
  }
  return merged;
}
