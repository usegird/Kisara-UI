import { appInputNames, writeAppOwn } from '@/graph/app-inputs';
import { ownData } from '@/graph/own-data';
import type { NodeRow } from '@/graph/rows';
import { cardIdOfPromptNode, type ApiPrompt } from '@/graph/to-api-prompt';
import type { NodeId, Workflow } from '@/graph/types';
import { isRecord } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';

// ─────────────────────────────
// アプリ入力の値の実行時の差し込みと保存。作業中はアプリ入力の値のストアが正本で、保存するときだけ
// ワークフローへ書く（二重に持たない）。
// ─────────────────────────────

const VALUES = 'values';

/**
 * 今もアプリ入力になっているものの値だけを残す。
 * 外したものの値が残っていても、画面に出ていない値で実行しない。
 * 鍵は実行形式のノード id（subgraph の中なら `59:70`）なので、先頭の区間でカードに戻して引く。
 */
export function appValuesInUse(
  workflow: Workflow,
  values: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): ReadonlyMap<string, Readonly<Record<string, unknown>>> {
  const kept = new Map<string, Readonly<Record<string, unknown>>>();
  for (const [promptNodeId, fields] of values) {
    const cardId = cardIdOfPromptNode(promptNodeId);
    if (cardId === null) continue;

    const names = appInputNames(workflow, cardId);
    const inUse = Object.entries(fields).filter(([widgetName]) => names.has(widgetName));
    if (inUse.length > 0) kept.set(promptNodeId, Object.fromEntries(inUse));
  }
  return kept;
}

/** 実行形式での結線の参照（`["12", 0]`）か */
function isLinkRef(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'number'
  );
}

/**
 * アプリ入力に入れた値を API Prompt へ反映する。
 *
 * カード側（`widgets_values`）は触らないので、**実行のときだけ**こちらが勝つ。
 * キーは**平坦化後の prompt のノード id**（subgraph 内なら `59:70`）。
 * 対応する入力が prompt に無ければ何もしない（`control_after_generate` など）。
 */
export function applyAppValues(
  prompt: ApiPrompt,
  values: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): ApiPrompt {
  if (values.size === 0) return prompt;

  const next: ApiPrompt = { ...prompt };
  for (const [promptNodeId, fields] of values) {
    const node = next[promptNodeId];
    if (!node) continue;

    const inputs = { ...node.inputs };
    let changed = false;
    for (const [widgetName, value] of Object.entries(fields)) {
      if (!(widgetName in inputs)) continue;
      // 結線されている入力（`[ノード id, 出力の位置]`）は上書きしない
      if (isLinkRef(inputs[widgetName])) continue;
      setOwn(inputs, widgetName, value);
      changed = true;
    }
    if (changed) setOwn(next, promptNodeId, { ...node, inputs });
  }
  return next;
}

/** 保存されている入れた値。読めない形のものは落とす */
export function savedAppValues(workflow: Workflow): Map<string, Record<string, unknown>> {
  const values = new Map<string, Record<string, unknown>>();
  const record = ownData(workflow)?.[VALUES];
  if (!isRecord(record)) return values;

  for (const [promptNodeId, fields] of Object.entries(record)) {
    if (isRecord(fields) && Object.keys(fields).length > 0) values.set(promptNodeId, { ...fields });
  }
  return values;
}

/** 保存・書き出し用。**今もアプリ入力になっているものの値だけ**を書く。無ければ項目ごと落とす */
export function withSavedAppValues(
  workflow: Workflow,
  values: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): Workflow {
  const inUse = appValuesInUse(workflow, values);
  if (inUse.size === 0 && ownData(workflow)?.[VALUES] === undefined) return workflow;

  return writeAppOwn(workflow, VALUES, inUse);
}

/** 開くとき用。入れた値をワークフローから外す（作業中はストアが持つ）。無ければ同じものを返す */
export function withoutSavedAppValues(workflow: Workflow): Workflow {
  if (ownData(workflow)?.[VALUES] === undefined) return workflow;

  return writeAppOwn(workflow, VALUES, new Map());
}

/**
 * その行の値が、平坦化後の prompt でどのノードに入るか。
 * subgraph の昇格 widget は**内部ノード**に入るので `${インスタンス}:${内部ノード}` になる。
 */
export function promptNodeIdFor(nodeId: NodeId, row: NodeRow): string {
  return row.target?.kind === 'subgraph' ? `${nodeId}:${row.target.innerNodeId}` : String(nodeId);
}
