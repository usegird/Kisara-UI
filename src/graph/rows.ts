import { fixedLayoutOf } from '@/graph/fixed-layout';
import { definitionOf } from '@/graph/frontend-nodes';
import { linkIndex } from '@/graph/link-read';
import { outputsOf, rowsForNode, rowsForUnknown, type RowContext } from '@/graph/node-rows';
import type { NumberSpec } from '@/graph/number-spec';
import { orderedNodeIds } from '@/graph/order';
import { createOutputValues } from '@/graph/output-values';
import { subgraphMap } from '@/graph/subgraph';
import { rowsForSubgraph } from '@/graph/subgraph-rows';
import {
  FRONTEND_ONLY_TYPES,
  nodeInputs,
  nodeMode,
  nodeOutputs,
  type LinkId,
  type NodeDefinitionMap,
  type NodeId,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { resolveWidgetValues, summarizeValues, type ValuePart } from '@/graph/widgets';
import { t } from '@/i18n';
import { paintableColor } from '@/lib/color';
import { messageOf, reportFault } from '@/lib/fault';
import { isRecord } from '@/lib/guards';

export type NodeRowKind =
  | 'widget'
  | 'link'
  | 'socket'
  | 'unresolved';

export interface RowSource {
  readonly linkId: LinkId;
  readonly nodeId: NodeId;
  readonly slot: number;
  readonly type: string;
  readonly label: string;
  readonly values: readonly ValuePart[];
  readonly muted: boolean;
  readonly sourceIndex: string | null;
}

export type RowTarget =
  | { readonly kind: 'node'; readonly nodeId: NodeId; readonly classType: string }
  | {
      readonly kind: 'subgraph';
      readonly subgraphId: string;
      readonly innerNodeId: NodeId;
      readonly innerClassType: string;
    }
  | {
      readonly kind: 'instance';
      readonly nodeId: NodeId;
      readonly slot: number;
      readonly innerNodeId: NodeId;
      readonly innerClassType: string;
    };

export interface NodeRow {
  readonly name: string;
  readonly label: string;
  readonly type: string;
  readonly kind: NodeRowKind;
  readonly required: boolean;
  readonly value: unknown;
  readonly source: RowSource | null;
  readonly options: readonly unknown[] | null;
  readonly target: RowTarget | null;
  readonly widgetName: string;
  readonly appInput: boolean;
  readonly inputSlot: number | null;
  readonly linkable: boolean;
  readonly multiline: boolean;
  readonly number: NumberSpec | null;
  readonly height: number | null;
  readonly imageUpload: boolean;
}

type NodeViewKind = 'node' | 'subgraph' | 'unknown';

export interface NodeOutputView {
  readonly name: string;
  readonly type: string;
  readonly values: readonly ValuePart[];
}

export interface NodeView {
  readonly id: NodeId;
  readonly kind: NodeViewKind;
  readonly index: string | null;
  readonly displayName: string;
  readonly comment: string;
  readonly classType: string;
  readonly rows: readonly NodeRow[];
  readonly outputs: readonly NodeOutputView[];
  readonly mode: number;
  readonly unresolved: boolean;
  readonly values: readonly ValuePart[];
  readonly linked: boolean;
  readonly collapsed: boolean;
  readonly color?: string | null | undefined;
  readonly bgcolor?: string | null | undefined;
  readonly broken?: string | undefined;
}

function hasLinks(node: WorkflowNode): boolean {
  const inputs = nodeInputs(node).some((input) => input.link !== null && input.link !== undefined);
  const outputs = nodeOutputs(node).some((output) => (output.links ?? []).length > 0);
  return inputs || outputs;
}

function collapsedOf(node: WorkflowNode): boolean {
  const flags = node.flags;
  return isRecord(flags) && flags.collapsed === true;
}

function buildNodeView(context: RowContext, node: WorkflowNode): NodeView {
  const mode = nodeMode(node);
  const collapsed = collapsedOf(node);
  const color = paintableColor(node.color);
  const bgcolor = paintableColor(node.bgcolor);
  const comment = typeof node.title === 'string' ? node.title : '';
  const subgraph = context.subgraphs.get(node.type);

  if (subgraph) {
    return {
      id: node.id,
      kind: 'subgraph',
      values: summarizeValues(node, context.definitions.get(node.type)),
      linked: true,
      index: context.numbers.get(node.id) ?? null,
      displayName: subgraph.name,
      comment,
      classType: node.type,
      rows: rowsForSubgraph(context, node, subgraph),
      outputs: outputsOf(context, node, undefined),
      mode,
      collapsed,
      color,
      bgcolor,
      unresolved: false,
    };
  }

  const definition = definitionOf(context.definitions, node.type);
  if (!definition) {
    return {
      id: node.id,
      kind: 'unknown',
      values: summarizeValues(node, context.definitions.get(node.type)),
      linked: hasLinks(node),
      index: context.numbers.get(node.id) ?? null,
      displayName: node.type,
      comment,
      classType: node.type,
      rows: rowsForUnknown(context, node),
      outputs: outputsOf(context, node, undefined),
      mode,
      collapsed,
      color,
      bgcolor,
      unresolved: true,
    };
  }

  return {
    id: node.id,
    kind: 'node',
    values: summarizeValues(node, definition),
    linked: true,
    index: context.numbers.get(node.id) ?? null,
    displayName: definition.displayName,
    comment,
    classType: node.type,
    rows: rowsForNode(context, node, definition),
    outputs: outputsOf(context, node, definition),
    mode,
    collapsed,
    color,
    bgcolor,
    unresolved: !resolveWidgetValues(node, definition).ok,
  };
}

export interface BuildNodeViewsOptions {
  readonly showControlNodes?: boolean;
  readonly showUnlinkedNodes?: boolean;
  readonly hiddenCandidates?: ReadonlySet<NodeId> | undefined;
}

export function unlinkedNodeIds(workflow: Workflow): ReadonlySet<NodeId> {
  return new Set(workflow.nodes.filter((node) => !hasLinks(node)).map((node) => node.id));
}

type HideableNodeKind = 'control' | 'unlinked';

function hideableKindOf(
  node: WorkflowNode,
  context: Pick<RowContext, 'definitions' | 'subgraphs'>,
): HideableNodeKind | null {
  if (hasLinks(node)) return null;

  const known =
    context.subgraphs.has(node.type) || definitionOf(context.definitions, node.type) !== undefined;
  return known ? 'unlinked' : 'control';
}

function cardNodes(workflow: Workflow, byId: ReadonlyMap<NodeId, WorkflowNode>): WorkflowNode[] {
  return orderedNodeIds(workflow)
    .map((id) => byId.get(id))
    .filter((node): node is WorkflowNode => node !== undefined)
    .filter((node) => node.type !== FRONTEND_ONLY_TYPES.reroute);
}

function cardNumbers(
  workflow: Workflow,
  nodes: readonly WorkflowNode[],
): ReadonlyMap<NodeId, string> {
  const fixed = fixedLayoutOf(workflow);
  if (fixed) return fixed.numbers;
  const numbers = new Map<NodeId, string>();
  for (const node of nodes) {
    numbers.set(node.id, String(numbers.size + 1));
  }
  return numbers;
}

export function compareCardNumbers(a: string | null, b: string | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let at = 0; at < Math.max(left.length, right.length); at++) {
    const diff = (left[at] ?? -1) - (right[at] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function cardLabels(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
): Map<NodeId, string> {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const subgraphs = subgraphMap(workflow);
  const nodes = cardNodes(workflow, byId);
  const numbers = cardNumbers(workflow, nodes);
  const labels = new Map<NodeId, string>();

  for (const node of nodes) {
    const index = numbers.get(node.id);
    if (index === undefined) continue;
    const comment = typeof node.title === 'string' ? node.title : '';
    const name =
      comment.length > 0
        ? comment
        : (subgraphs.get(node.type)?.name ?? definitions.get(node.type)?.displayName ?? node.type);
    labels.set(node.id, `${index} ${name}`);
  }
  return labels;
}

export function buildNodeViews(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  options: BuildNodeViewsOptions = {},
): NodeView[] {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const subgraphs = subgraphMap(workflow);

  const all = cardNodes(workflow, byId);
  const numbers = cardNumbers(workflow, all);

  const ordered = all.filter((node) => {
    if (options.hiddenCandidates && !options.hiddenCandidates.has(node.id)) return true;
    let kind: HideableNodeKind | null;
    try {
      kind = hideableKindOf(node, { definitions, subgraphs });
    } catch {
      return true;
    }
    if (kind === 'control') return options.showControlNodes === true;
    if (kind === 'unlinked') return options.showUnlinkedNodes === true;
    return true;
  });

  const context: RowContext = {
    workflow,
    definitions,
    subgraphs,
    links: linkIndex(workflow.links),
    outputValue: createOutputValues(workflow, definitions),
    numbers,
  };

  return ordered.map((node) => {
    try {
      return buildNodeView(context, node);
    } catch (error) {
      reportFault(
        t('fault.where.nodeRows', { id: String(node.id), type: String(node.type) }),
        error,
      );
      return brokenView(node, context.numbers.get(node.id) ?? null, messageOf(error));
    }
  });
}

function brokenView(node: WorkflowNode, index: string | null, reason: string): NodeView {
  const classType = String(node.type);
  return {
    id: node.id,
    kind: 'unknown',
    index,
    displayName: classType,
    comment: typeof node.title === 'string' ? node.title : '',
    classType,
    rows: [],
    outputs: [],
    mode: nodeMode(node),
    unresolved: true,
    values: [],
    linked: true,
    collapsed: false,
    broken: reason,
  };
}
