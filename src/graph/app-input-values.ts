import { appInputNames, writeAppOwn } from '@/graph/app-inputs';
import { ownData } from '@/graph/own-data';
import type { NodeRow } from '@/graph/rows';
import { cardIdOfPromptNode, type ApiPrompt } from '@/graph/to-api-prompt';
import type { NodeId, Workflow } from '@/graph/types';
import { isRecord } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';

const VALUES = 'values';

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

function isLinkRef(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'number'
  );
}

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
      if (isLinkRef(inputs[widgetName])) continue;
      setOwn(inputs, widgetName, value);
      changed = true;
    }
    if (changed) setOwn(next, promptNodeId, { ...node, inputs });
  }
  return next;
}

export function savedAppValues(workflow: Workflow): Map<string, Record<string, unknown>> {
  const values = new Map<string, Record<string, unknown>>();
  const record = ownData(workflow)?.[VALUES];
  if (!isRecord(record)) return values;

  for (const [promptNodeId, fields] of Object.entries(record)) {
    if (isRecord(fields) && Object.keys(fields).length > 0) values.set(promptNodeId, { ...fields });
  }
  return values;
}

export function withSavedAppValues(
  workflow: Workflow,
  values: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): Workflow {
  const inUse = appValuesInUse(workflow, values);
  if (inUse.size === 0 && ownData(workflow)?.[VALUES] === undefined) return workflow;

  return writeAppOwn(workflow, VALUES, inUse);
}

export function withoutSavedAppValues(workflow: Workflow): Workflow {
  if (ownData(workflow)?.[VALUES] === undefined) return workflow;

  return writeAppOwn(workflow, VALUES, new Map());
}

export function promptNodeIdFor(nodeId: NodeId, row: NodeRow): string {
  return row.target?.kind === 'subgraph' ? `${nodeId}:${row.target.innerNodeId}` : String(nodeId);
}
