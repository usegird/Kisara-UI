import { MIN_MULTILINE_HEIGHT } from '@/graph/multiline-height';
import { orderedNodeIds } from '@/graph/order';
import { ownData, writeOwnData } from '@/graph/own-data';
import { nodeInputs, type NodeId, type Workflow } from '@/graph/types';
import { clamp } from '@/lib/clamp';
import { isRecord, isUnknownArray } from '@/lib/guards';

type InputEntry = readonly unknown[];

const LINEAR_DATA = 'linearData';
const ENTRY_REST_AT = 3;

function linearData(workflow: Workflow): Record<string, unknown> | null {
  const extra = workflow.extra;
  if (!isRecord(extra)) return null;

  const data = extra[LINEAR_DATA];
  return isRecord(data) ? data : null;
}

export function appInputEntries(workflow: Workflow): InputEntry[] {
  const inputs = linearData(workflow)?.inputs;
  if (!isUnknownArray(inputs)) return [];

  return inputs.filter((entry): entry is InputEntry => isUnknownArray(entry) && entry.length >= 2);
}

export function isSameEntry(entry: InputEntry, nodeId: NodeId, widgetName: string): boolean {
  return String(entry[0]) === String(nodeId) && entry[1] === widgetName;
}

export function isAppInput(workflow: Workflow, nodeId: NodeId, widgetName: string): boolean {
  return appInputEntries(workflow).some((entry) => isSameEntry(entry, nodeId, widgetName));
}

export function appInputNames(workflow: Workflow, nodeId: NodeId): Set<string> {
  const names = new Set<string>();
  for (const entry of appInputEntries(workflow)) {
    if (String(entry[0]) !== String(nodeId)) continue;
    if (typeof entry[1] === 'string') names.add(entry[1]);
  }
  return names;
}

export function remapAppInputs(
  workflow: Workflow,
  remap: (ref: AppInputRef) => AppInputRef | null,
): Workflow {
  const current = appInputEntries(workflow);
  let changed = false;
  const next: InputEntry[] = [];
  for (const entry of current) {
    const nodeId = Number(entry[0]);
    if (!Number.isFinite(nodeId) || typeof entry[1] !== 'string') {
      next.push(entry);
      continue;
    }
    const to = remap({ nodeId, widgetName: entry[1] });
    if (to === null) {
      changed = true;
      continue;
    }
    if (to.nodeId === nodeId && to.widgetName === entry[1]) {
      next.push(entry);
      continue;
    }
    changed = true;
    next.push([to.nodeId, to.widgetName, ...entry.slice(2)]);
  }
  return changed ? writeAppInputs(workflow, next) : workflow;
}

export function writeAppInputs(workflow: Workflow, inputs: readonly InputEntry[]): Workflow {
  const data = linearData(workflow) ?? {};
  const outputs = isUnknownArray(data.outputs) ? data.outputs : [];
  const extra = isRecord(workflow.extra) ? { ...workflow.extra } : {};

  if (inputs.length === 0 && outputs.length === 0) {
    delete extra[LINEAR_DATA];
  } else {
    extra[LINEAR_DATA] = { ...data, inputs, outputs };
  }

  return { ...workflow, extra };
}

function insertByCardOrder(
  workflow: Workflow,
  current: readonly InputEntry[],
  added: InputEntry,
): InputEntry[] {
  const rank = new Map(orderedNodeIds(workflow).map((id, index) => [String(id), index]));
  const rankOf = (entry: InputEntry): number =>
    rank.get(String(entry[0])) ?? Number.MAX_SAFE_INTEGER;

  const mine = rankOf(added);
  const at = current.findIndex((entry) => rankOf(entry) > mine);
  return at < 0 ? [...current, added] : [...current.slice(0, at), added, ...current.slice(at)];
}

export function toggleAppInput(workflow: Workflow, nodeId: NodeId, widgetName: string): Workflow {
  const current = appInputEntries(workflow);
  const exists = current.some((entry) => isSameEntry(entry, nodeId, widgetName));

  const next = writeAppInputs(
    workflow,
    exists
      ? current.filter((entry) => !isSameEntry(entry, nodeId, widgetName))
      : insertByCardOrder(workflow, current, [nodeId, widgetName]),
  );

  return exists ? clearOwn(next, WIDTHS, appInputSpanKey(nodeId, widgetName)) : next;
}

export function removeAppInputs(workflow: Workflow, refs: readonly AppInputRef[]): Workflow {
  let next = workflow;
  for (const ref of refs) {
    if (isAppInput(next, ref.nodeId, ref.widgetName)) {
      next = toggleAppInput(next, ref.nodeId, ref.widgetName);
    }
  }
  return next;
}

export function dropLinkedAppInputs(workflow: Workflow): Workflow {
  let next = workflow;
  for (const entry of appInputEntries(workflow)) {
    const widgetName = entry[1];
    if (typeof widgetName !== 'string') continue;

    const node = workflow.nodes.find((candidate) => String(candidate.id) === String(entry[0]));
    const input = nodeInputs(node).find((candidate) => candidate.name === widgetName);
    if (node && typeof input?.link === 'number') next = toggleAppInput(next, node.id, widgetName);
  }
  return next;
}

export const APP_INPUT_SPANS = 12;

const WIDTHS = 'widths';
export function appInputSpanKey(nodeId: NodeId, widgetName: string): string {
  return `${nodeId}:${widgetName}`;
}

function clampSpan(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  return clamp(Math.round(value), 1, APP_INPUT_SPANS);
}

function readOwn(
  workflow: Workflow,
  name: string,
  parse: (value: unknown) => number | null,
): Map<string, number> {
  const values = new Map<string, number>();
  const record = ownData(workflow)?.[name];
  if (!isRecord(record)) return values;

  for (const [key, value] of Object.entries(record)) {
    const parsed = parse(value);
    if (parsed !== null) values.set(key, parsed);
  }
  return values;
}

export function appInputSpans(workflow: Workflow): ReadonlyMap<string, number> {
  return readOwn(workflow, WIDTHS, clampSpan);
}

export function writeAppOwn(
  workflow: Workflow,
  name: string,
  values: ReadonlyMap<string, unknown>,
): Workflow {
  return writeOwnData(workflow, name, values.size === 0 ? undefined : Object.fromEntries(values));
}

function clearOwn(workflow: Workflow, name: string, key: string): Workflow {
  const values = readOwn(workflow, name, (value) => (typeof value === 'number' ? value : null));
  if (!values.delete(key)) return workflow;

  return writeAppOwn(workflow, name, values);
}

export function setAppInputSpan(
  workflow: Workflow,
  nodeId: NodeId,
  widgetName: string,
  span: number,
): Workflow {
  const next = clampSpan(span);
  if (next === null) return workflow;

  const key = appInputSpanKey(nodeId, widgetName);
  if (next === APP_INPUT_SPANS) return clearOwn(workflow, WIDTHS, key);

  const spans = new Map(appInputSpans(workflow));
  if (spans.get(key) === next) return workflow;

  spans.set(key, next);
  return writeAppOwn(workflow, WIDTHS, spans);
}

function clampHeight(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  return Math.max(MIN_MULTILINE_HEIGHT, Math.round(value));
}

export function appInputHeights(workflow: Workflow): ReadonlyMap<string, number> {
  const heights = new Map<string, number>();
  for (const entry of appInputEntries(workflow)) {
    const config = entry[2];
    const height = isRecord(config) ? clampHeight(config.height) : null;
    if (height !== null) heights.set(`${String(entry[0])}:${String(entry[1])}`, height);
  }
  return heights;
}

export function setAppInputHeight(
  workflow: Workflow,
  nodeId: NodeId,
  widgetName: string,
  height: number,
): Workflow {
  const next = clampHeight(height);
  if (next === null) return workflow;

  const current = appInputEntries(workflow);
  const index = current.findIndex((entry) => isSameEntry(entry, nodeId, widgetName));
  const entry = current[index];
  if (!entry) return workflow;

  const config = isRecord(entry[2]) ? entry[2] : {};
  if (config.height === next) return workflow;

  const inputs = [...current];
  inputs[index] = [entry[0], entry[1], { ...config, height: next }, ...entry.slice(ENTRY_REST_AT)];
  return writeAppInputs(workflow, inputs);
}

export interface AppInputRef {
  readonly nodeId: NodeId;
  readonly widgetName: string;
}
