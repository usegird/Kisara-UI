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

// ─────────────────────────────
// 呼び出し設定のダイアログの打ちかけ。出す欄・打ちかけの値・書く定義・保存できない理由を組み立てる
// ─────────────────────────────

/** 引数の 1 行（アプリ入力 1 つ） */
export interface ParamRow {
  readonly nodeId: string;
  readonly input: string;
  readonly label: string;
  /** 引数にできる型か */
  readonly eligible: boolean;
  /** 足して入れられる型か */
  readonly mergeable: boolean;
}

/** 出す欄。無効か線の無いノードの欄は出さない */
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

/** 出していない欄（ノードが無効か線が無い）の設定。保存しても消さずに残す */
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

/** 引数 1 つの打ちかけ */
export interface ParamDraft {
  readonly name: string;
  readonly description: string;
  readonly mode: ArgumentMode;
}

/** 引数を設定していない欄の打ちかけ */
export const EMPTY_PARAM: ParamDraft = { name: '', description: '', mode: 'overwrite' };

/** ダイアログ全体の打ちかけ */
export interface Draft {
  readonly name: string;
  readonly description: string;
  /** 結果として渡す画像を出すノード。空ならすべて */
  readonly outputs: readonly string[];
  /** `nodeId/input` → 引数名・説明・入れ方 */
  readonly params: Readonly<Record<string, ParamDraft>>;
}

/** 引数の欄の鍵（`nodeId/input`） */
export const keyOf = (nodeId: string, input: string): string => `${nodeId}/${input}`;

/** 書いてある定義から打ちかけを始める */
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

/** 書く定義。引数名を空にした欄と、引数にできない欄は落とす。出していない欄の設定は残す */
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

/** 保存できない理由。保存できれば null（出していない欄の設定は見ない） */
export function problemOf(tool: WorkflowTool, hidden: WorkflowTool['params']): string | null {
  if (!isToolName(tool.name)) return t('comfy.tool.badName');
  const names = tool.params.filter((param) => !hidden.includes(param)).map((param) => param.name);
  if (names.some((name) => !isToolName(name))) return t('comfy.tool.badParamName');
  if (new Set(names).size !== names.length) return t('comfy.tool.duplicateParam');
  return null;
}
