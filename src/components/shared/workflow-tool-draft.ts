import { appInputOrder } from '@/graph/app-input-order';
import { cardLabels } from '@/graph/rows';
import { cardIdOfPromptNode } from '@/graph/to-api-prompt';
import type { NodeDefinitionMap, Workflow } from '@/graph/types';
import {
  activeNodeIds,
  argumentSchema,
  canMerge,
  inputDefinitionOf,
  isToolName,
  type ArgumentMode,
  type WorkflowTool,
} from '@/graph/workflow-tool';
import { t } from '@/i18n';

export interface ParamRow {
  readonly nodeId: string;
  readonly input: string;
  readonly label: string;
  readonly eligible: boolean;
  readonly mergeable: boolean;
}

export function paramRows(workflow: Workflow, definitions: NodeDefinitionMap): ParamRow[] {
  const labels = cardLabels(workflow, definitions);
  const active = activeNodeIds(workflow);
  return appInputOrder(workflow).flatMap((ref) => {
    if (!active.has(ref.nodeId)) return [];
    const nodeId = String(ref.nodeId);
    const input = inputDefinitionOf(workflow, definitions, nodeId, ref.widgetName);
    const schema = input === null ? null : argumentSchema(input);
    return [
      {
        nodeId,
        input: ref.widgetName,
        label: `${labels.get(ref.nodeId) ?? nodeId} · ${ref.widgetName}`,
        eligible: schema !== null,
        mergeable: schema !== null && canMerge(schema),
      },
    ];
  });
}

export function hiddenParams(
  workflow: Workflow,
  tool: WorkflowTool | null,
): WorkflowTool['params'] {
  const active = activeNodeIds(workflow);
  return (tool?.params ?? []).filter((param) => {
    const cardId = cardIdOfPromptNode(param.nodeId);
    return cardId !== null && !active.has(cardId);
  });
}

export interface ParamDraft {
  readonly name: string;
  readonly description: string;
  readonly mode: ArgumentMode;
}

export const EMPTY_PARAM: ParamDraft = { name: '', description: '', mode: 'overwrite' };

export interface Draft {
  readonly name: string;
  readonly description: string;
  readonly outputs: readonly string[];
  readonly params: Readonly<Record<string, ParamDraft>>;
}

export const keyOf = (nodeId: string, input: string): string => `${nodeId}/${input}`;

export function draftOf(tool: WorkflowTool | null): Draft {
  return {
    name: tool?.name ?? '',
    description: tool?.description ?? '',
    outputs: tool?.outputs ?? [],
    params: Object.fromEntries(
      (tool?.params ?? []).map((param) => [
        keyOf(param.nodeId, param.input),
        { name: param.name, description: param.description, mode: param.mode },
      ]),
    ),
  };
}

export function toolOf(
  draft: Draft,
  rows: readonly ParamRow[],
  hidden: WorkflowTool['params'],
): WorkflowTool {
  return {
    name: draft.name.trim(),
    description: draft.description,
    outputs: draft.outputs,
    params: [
      ...rows.flatMap((row) => {
        const param = draft.params[keyOf(row.nodeId, row.input)] ?? EMPTY_PARAM;
        const name = param.name.trim();
        if (!row.eligible || name.length === 0) return [];
        const mode: ArgumentMode = row.mergeable ? param.mode : 'overwrite';
        const { nodeId, input } = row;
        return [{ nodeId, input, name, description: param.description, mode }];
      }),
      ...hidden,
    ],
  };
}

export function problemOf(tool: WorkflowTool, hidden: WorkflowTool['params']): string | null {
  if (!isToolName(tool.name)) return t('comfy.tool.badName');
  const names = tool.params.filter((param) => !hidden.includes(param)).map((param) => param.name);
  if (names.some((name) => !isToolName(name))) return t('comfy.tool.badParamName');
  if (new Set(names).size !== names.length) return t('comfy.tool.duplicateParam');
  return null;
}
