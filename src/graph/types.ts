import { isRecord } from '@/lib/guards';

export type NodeId = number;
export type LinkId = number;

export type WorkflowLinkTuple = [LinkId, NodeId, number, NodeId, number, unknown];

export interface WorkflowLinkObject {
  id: LinkId;
  origin_id: NodeId;
  origin_slot: number;
  target_id: NodeId;
  target_slot: number;
  type: unknown;
  [key: string]: unknown;
}

export type WorkflowLink = WorkflowLinkTuple | WorkflowLinkObject;

export interface ResolvedLink {
  readonly id: LinkId;
  readonly originId: NodeId;
  readonly originSlot: number;
  readonly targetId: NodeId;
  readonly targetSlot: number;
  readonly type: string;
}

export const SUBGRAPH_IO_NODE_ID = {
  input: -10,
  output: -20,
} as const;

export const NODE_MODE = {
  normal: 0,
  mute: 2,
  bypass: 4,
} as const;

export function nodeMode(node: WorkflowNode): number {
  return typeof node.mode === 'number' ? node.mode : NODE_MODE.normal;
}

export function slotTypeName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return 'COMBO';
  return '*';
}

export interface WorkflowNodeInput {
  name: string;
  type: unknown;
  link: LinkId | null;
  label?: string;
  widget?: { name: string };
  [key: string]: unknown;
}

export interface WorkflowNodeOutput {
  name: string;
  type: unknown;
  links?: LinkId[] | null;
  [key: string]: unknown;
}

function linkIdOrNull(value: unknown): LinkId | null {
  return typeof value === 'number' ? value : null;
}

export function nodeInputs(node: WorkflowNode | null | undefined): WorkflowNodeInput[] {
  if (!node || !Array.isArray(node.inputs)) return [];
  return (node.inputs as unknown[]).map((raw) => {
    if (!isRecord(raw)) return { name: '', type: '*', link: null };

    const { label, widget, ...rest } = raw;
    const input: WorkflowNodeInput = {
      ...rest,
      name: typeof raw.name === 'string' ? raw.name : '',
      type: raw.type,
      link: linkIdOrNull(raw.link),
    };
    if (typeof label === 'string') input.label = label;
    if (isRecord(widget) && typeof widget.name === 'string') {
      input.widget = { ...widget, name: widget.name };
    }
    return input;
  });
}

export function nodeOutputs(node: WorkflowNode | null | undefined): WorkflowNodeOutput[] {
  if (!node || !Array.isArray(node.outputs)) return [];
  return (node.outputs as unknown[]).map((raw) =>
    isRecord(raw)
      ? {
          ...raw,
          name: typeof raw.name === 'string' ? raw.name : '',
          type: raw.type,
          links: Array.isArray(raw.links)
            ? (raw.links as unknown[]).filter((id): id is LinkId => typeof id === 'number')
            : null,
        }
      : { name: '', type: '*', links: null },
  );
}

export interface WorkflowNode {
  id: NodeId;
  type: string;
  pos: [number, number];
  size?: [number, number];
  mode?: number;
  inputs?: unknown;
  outputs?: unknown;
  properties?: Record<string, unknown>;
  widgets_values?: unknown;
  widgets_values_named?: unknown;
  title?: string;
  [key: string]: unknown;
}

export interface SubgraphIo {
  id: string;
  name: string;
  type: unknown;
  linkIds?: LinkId[];
  label?: string;
  [key: string]: unknown;
}

export interface SubgraphDefinition {
  id: string;
  name: string;
  inputs?: SubgraphIo[];
  outputs?: SubgraphIo[];
  nodes: WorkflowNode[];
  links: WorkflowLink[];
  [key: string]: unknown;
}

export interface Workflow {
  nodes: WorkflowNode[];
  links: WorkflowLink[];
  definitions?: { subgraphs?: SubgraphDefinition[]; [key: string]: unknown };
  [key: string]: unknown;
}

export function subgraphDefinitions(workflow: Workflow): SubgraphDefinition[] {
  const raw = workflow.definitions?.subgraphs;
  return Array.isArray(raw) ? raw : [];
}

export interface InputDefinition {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly isWidget: boolean;
  readonly options: readonly unknown[] | null;
  readonly config: Readonly<Record<string, unknown>>;
  readonly branches?: readonly InputBranch[];
}

export interface InputBranch {
  readonly key: string;
  readonly inputs: readonly InputDefinition[];
}

export interface OutputDefinition {
  readonly name: string;
  readonly type: string;
}

export interface NodeDefinition {
  readonly name: string;
  readonly displayName: string;
  readonly category: string;
  readonly module: string;
  readonly inputs: readonly InputDefinition[];
  readonly outputs: readonly OutputDefinition[];
  readonly outputNode: boolean;
  readonly description?: string | undefined;
}

export type NodeDefinitionMap = ReadonlyMap<string, NodeDefinition>;

export const FRONTEND_ONLY_TYPES = {
  notes: ['Note', 'MarkdownNote'] as readonly string[],
  reroute: 'Reroute',
} as const;

export function isNoteType(type: string): boolean {
  return FRONTEND_ONLY_TYPES.notes.includes(type);
}
