import { flattenWorkflow, reachableNodes, type FlatNode } from '@/graph/api-prompt-flatten';
import type { NodeDefinitionMap, NodeId, Workflow } from '@/graph/types';
import { resolveWidgetValues } from '@/graph/widgets';
import { t } from '@/i18n';
import { messageOf } from '@/lib/fault';
import { setOwn } from '@/lib/own-key';

const MISMATCH_MESSAGES = {
  'named-mismatch': 'graph.prompt.namedMismatch',
  'type-mismatch': 'graph.prompt.typeMismatch',
  'linked-choice': 'graph.prompt.linkedChoice',
} as const;

interface ApiPromptNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

export type ApiPrompt = Record<string, ApiPromptNode>;

type ApiPromptDiagnosticCode =
  | 'unknown-class'
  | 'unresolved-widgets'
  | 'misaligned-widgets'
  | 'excluded-downstream'
  | 'missing-input'
  | 'no-output-node'
  | 'dangling-reference'
  | 'broken-node'
  | 'subgraph-cycle';

export interface ApiPromptDiagnostic {
  readonly code: ApiPromptDiagnosticCode;
  readonly nodeId: string;
  readonly classType: string;
  readonly message: string;
}

export interface ApiPromptResult {
  readonly prompt: ApiPrompt;
  readonly diagnostics: readonly ApiPromptDiagnostic[];
}

export function cardIdOfPromptNode(promptNodeId: string): NodeId | null {
  const head = promptNodeId.split(':')[0];
  const id = Number(head);
  return head !== undefined && head.length > 0 && Number.isInteger(id) ? id : null;
}

export function toApiPrompt(workflow: Workflow, definitions: NodeDefinitionMap): ApiPromptResult {
  const { flat, cycles } = flattenWorkflow(workflow, definitions);
  const diagnostics: ApiPromptDiagnostic[] = cycles.map(({ id, type, name }) => ({
    code: 'subgraph-cycle',
    nodeId: id,
    classType: type,
    message: t('graph.prompt.subgraphCycle', { name }),
  }));

  const reachable = reachableNodes(flat);
  if (reachable.size === 0) {
    diagnostics.push({
      code: 'no-output-node',
      nodeId: '',
      classType: '',
      message: t('graph.prompt.noOutput'),
    });
  }

  const prompt: ApiPrompt = {};
  const excluded = new Set<string>();

  for (const id of reachable) {
    const entry = flat.get(id);
    if (!entry) continue;
    try {
      const node = buildPromptNode(entry, diagnostics, excluded);
      if (node !== null) setOwn(prompt, id, node);
    } catch (error) {
      diagnostics.push({
        code: 'broken-node',
        nodeId: id,
        classType: String(flat.get(id)?.node.type ?? ''),
        message: t('graph.prompt.brokenNode', {
          message: messageOf(error),
        }),
      });
    }
  }

  excludeDownstream(prompt, excluded, diagnostics);
  if (excluded.size > 0 && !Object.keys(prompt).some((id) => isOutput(flat.get(id)))) {
    diagnostics.push({
      code: 'no-output-node',
      nodeId: '',
      classType: '',
      message: t('graph.prompt.noOutputLeft'),
    });
  }

  addDanglingReferences(prompt, diagnostics);
  return { prompt, diagnostics };
}

function buildPromptNode(
  entry: FlatNode,
  diagnostics: ApiPromptDiagnostic[],
  excluded: Set<string>,
): ApiPromptNode | null {
  const { id, definition } = entry;
  if (!definition) {
    diagnostics.push({
      code: 'unknown-class',
      nodeId: id,
      classType: entry.node.type,
      message: t('graph.prompt.unknownClass', { type: entry.node.type }),
    });
    return null;
  }

  const widgets = resolveWidgetValues(entry.node, definition);
  if (!widgets.ok && widgets.reason !== 'slot-count-mismatch') {
    excluded.add(id);
    diagnostics.push({
      code: 'misaligned-widgets',
      nodeId: id,
      classType: definition.name,
      message: t(MISMATCH_MESSAGES[widgets.reason]),
    });
    return null;
  }
  if (!widgets.ok) {
    diagnostics.push({
      code: 'unresolved-widgets',
      nodeId: id,
      classType: definition.name,
      message: t('graph.prompt.unresolvedWidgets', {
        expected: widgets.expected,
        actual: widgets.actual,
      }),
    });
  }

  return { class_type: definition.name, inputs: buildInputs(entry, widgets, diagnostics) };
}

function buildInputs(
  entry: FlatNode,
  widgets: ReturnType<typeof resolveWidgetValues>,
  diagnostics: ApiPromptDiagnostic[],
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  const definition = entry.definition;
  if (!definition) return inputs;

  for (const input of widgets.inputs) {
    const source = entry.sources.get(input.name);
    if (source) {
      setOwn(inputs, input.name, [source.nodeId, source.slot]);
      continue;
    }
    if (widgets.ok && widgets.byInput.has(input.name)) {
      setOwn(inputs, input.name, widgets.byInput.get(input.name));
      continue;
    }
    if (input.required && widgets.ok) {
      diagnostics.push({
        code: 'missing-input',
        nodeId: entry.id,
        classType: definition.name,
        message: t('graph.prompt.missingInput', { name: input.name }),
      });
    }
  }

  for (const [name, source] of entry.sources) {
    if (Object.hasOwn(inputs, name)) continue;
    setOwn(inputs, name, [source.nodeId, source.slot]);
  }
  return inputs;
}

function excludeDownstream(
  prompt: ApiPrompt,
  excluded: Set<string>,
  diagnostics: ApiPromptDiagnostic[],
): void {
  let changed = excluded.size > 0;
  while (changed) {
    changed = false;
    for (const [id, node] of Object.entries(prompt)) {
      const source = Object.values(node.inputs).find(
        (value) => Array.isArray(value) && typeof value[0] === 'string' && excluded.has(value[0]),
      );
      if (!Array.isArray(source)) continue;
      delete prompt[id];
      excluded.add(id);
      changed = true;
      diagnostics.push({
        code: 'excluded-downstream',
        nodeId: id,
        classType: node.class_type,
        message: t('graph.prompt.excludedDownstream', { source: String(source[0]) }),
      });
    }
  }
}

function addDanglingReferences(prompt: ApiPrompt, diagnostics: ApiPromptDiagnostic[]): void {
  for (const [id, node] of Object.entries(prompt)) {
    for (const [name, value] of Object.entries(node.inputs)) {
      if (!Array.isArray(value) || typeof value[0] !== 'string') continue;
      if (value[0] in prompt) continue;

      diagnostics.push({
        code: 'dangling-reference',
        nodeId: id,
        classType: node.class_type,
        message: t('graph.prompt.danglingReference', { name, source: value[0] }),
      });
    }
  }
}

function isOutput(entry: FlatNode | undefined): boolean {
  return entry?.definition?.outputNode === true;
}
