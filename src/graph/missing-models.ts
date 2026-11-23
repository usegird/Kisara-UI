import { normalizeModelName } from '@/graph/model-files';
import {
  NODE_MODE,
  nodeMode,
  subgraphDefinitions,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { widgetValueEntries } from '@/graph/widgets';
import { isRecord, isUnknownArray } from '@/lib/guards';

export interface WorkflowModel {
  readonly promptNodeId: string;
  readonly name: string;
  readonly directory: string;
  readonly url: string | null;
  readonly linkable: boolean;
  readonly disabled: boolean;
}

function lastSegment(name: string): string {
  const normalized = normalizeModelName(name);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSelected(node: WorkflowNode, name: string): boolean {
  const target = lastSegment(name);
  return widgetValueEntries(node).some(
    (entry) => typeof entry.value === 'string' && lastSegment(entry.value) === target,
  );
}

function isDisabled(node: WorkflowNode): boolean {
  const mode = nodeMode(node);
  return mode === NODE_MODE.mute || mode === NODE_MODE.bypass;
}

function modelsOfNode(
  node: WorkflowNode,
  promptNodeId: string,
  disabled: boolean,
): WorkflowModel[] {
  const raw = node.properties?.models;
  if (!isUnknownArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((item): WorkflowModel[] => {
    if (!isRecord(item)) return [];
    const { name, directory, url } = item;
    if (typeof name !== 'string' || typeof directory !== 'string') return [];
    if (name.length === 0 || directory.length === 0 || !isSelected(node, name)) return [];
    const key = `${directory}\n${name}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const link = typeof url === 'string' && url.length > 0 ? url : null;
    return [
      {
        promptNodeId,
        name,
        directory,
        url: link,
        linkable: link !== null && isHttpsUrl(link),
        disabled,
      },
    ];
  });
}

export function workflowModels(workflow: Workflow): WorkflowModel[] {
  const definitions = new Map(subgraphDefinitions(workflow).map((def) => [def.id, def]));
  const result: WorkflowModel[] = [];

  const walk = (
    nodes: readonly WorkflowNode[],
    prefix: string,
    disabled: boolean,
    path: ReadonlySet<string>,
  ): void => {
    for (const node of nodes) {
      const promptNodeId = `${prefix}${String(node.id)}`;
      const off = disabled || isDisabled(node);
      result.push(...modelsOfNode(node, promptNodeId, off));
      const inner = definitions.get(node.type);
      if (inner === undefined || path.has(inner.id) || !isUnknownArray(inner.nodes)) continue;
      walk(inner.nodes, `${promptNodeId}:`, off, new Set([...path, inner.id]));
    }
  };

  walk(isUnknownArray(workflow.nodes) ? workflow.nodes : [], '', false, new Set());
  return result;
}

export function modelDirectories(models: readonly WorkflowModel[]): string[] {
  return [...new Set(models.map((model) => model.directory))];
}

export function missingModels(
  models: readonly WorkflowModel[],
  filesOf: (directory: string) => readonly string[] | null,
): WorkflowModel[] {
  const names = new Map<string, ReadonlySet<string> | null>();
  const namesOf = (directory: string): ReadonlySet<string> | null => {
    if (!names.has(directory)) {
      const files = filesOf(directory);
      names.set(directory, files === null ? null : new Set(files.map(lastSegment)));
    }
    return names.get(directory) ?? null;
  };
  return models.filter((model) => {
    const present = namesOf(model.directory);
    return present !== null && !present.has(lastSegment(model.name));
  });
}
