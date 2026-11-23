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

const HUGGING_FACE_HOST = 'huggingface.co';
const HUGGING_FACE_FILE = 'resolve';
const HUGGING_FACE_LIST = 'tree';

export interface WorkflowModel {
  readonly promptNodeId: string;
  readonly name: string;
  readonly selected: string;
  readonly directory: string;
  readonly url: string | null;
  readonly linkable: boolean;
  readonly disabled: boolean;
}

function lastSegment(name: string): string {
  const normalized = normalizeModelName(name);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

export function sourcePageOf(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== HUGGING_FACE_HOST) return url;
  const segments = parsed.pathname.split('/').filter((segment) => segment.length > 0);
  const [owner, repo, kind, revision, ...path] = segments;
  if (owner === undefined || repo === undefined || revision === undefined) return url;
  if (kind !== HUGGING_FACE_FILE || path.length === 0) return url;
  const listPath = [owner, repo, HUGGING_FACE_LIST, revision, ...path.slice(0, -1)].join('/');
  return `https://${HUGGING_FACE_HOST}/${listPath}`;
}

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function stringValuesOf(node: WorkflowNode): string[] {
  return widgetValueEntries(node).flatMap((entry) =>
    typeof entry.value === 'string' ? [entry.value] : [],
  );
}

function selectedValueOf(
  node: WorkflowNode,
  name: string,
  outerValues: readonly string[],
): string | null {
  const target = lastSegment(name);
  const matches = (value: string): boolean => lastSegment(value) === target;
  return stringValuesOf(node).find(matches) ?? outerValues.find(matches) ?? null;
}

function isDisabled(node: WorkflowNode): boolean {
  const mode = nodeMode(node);
  return mode === NODE_MODE.mute || mode === NODE_MODE.bypass;
}

function modelsOfNode(
  node: WorkflowNode,
  promptNodeId: string,
  disabled: boolean,
  outerValues: readonly string[],
): WorkflowModel[] {
  const raw = node.properties?.models;
  if (!isUnknownArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((item): WorkflowModel[] => {
    if (!isRecord(item)) return [];
    const { name, directory, url } = item;
    if (typeof name !== 'string' || typeof directory !== 'string') return [];
    if (name.length === 0 || directory.length === 0) return [];
    const selected = selectedValueOf(node, name, outerValues);
    if (selected === null) return [];
    const key = `${directory}\n${name}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const link = typeof url === 'string' && url.length > 0 ? sourcePageOf(url) : null;
    return [
      {
        promptNodeId,
        name,
        selected,
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
    scope: { readonly path: ReadonlySet<string>; readonly outerValues: readonly string[] },
  ): void => {
    for (const node of nodes) {
      const promptNodeId = `${prefix}${String(node.id)}`;
      const off = disabled || isDisabled(node);
      result.push(...modelsOfNode(node, promptNodeId, off, scope.outerValues));
      const inner = definitions.get(node.type);
      if (inner === undefined || scope.path.has(inner.id) || !isUnknownArray(inner.nodes)) {
        continue;
      }
      walk(inner.nodes, `${promptNodeId}:`, off, {
        path: new Set([...scope.path, inner.id]),
        outerValues: [...stringValuesOf(node), ...scope.outerValues],
      });
    }
  };

  walk(isUnknownArray(workflow.nodes) ? workflow.nodes : [], '', false, {
    path: new Set(),
    outerValues: [],
  });
  return result;
}

export function modelDirectories(models: readonly WorkflowModel[]): string[] {
  return [...new Set(models.map((model) => model.directory))];
}

export interface MissingModel extends WorkflowModel {
  readonly elsewhere: string | null;
}

export function missingModels(
  models: readonly WorkflowModel[],
  filesOf: (directory: string) => readonly string[] | null,
): MissingModel[] {
  const lists = new Map<string, readonly string[] | null>();
  const listOf = (directory: string): readonly string[] | null => {
    if (!lists.has(directory)) {
      const files = filesOf(directory);
      lists.set(directory, files === null ? null : files.map(normalizeModelName));
    }
    return lists.get(directory) ?? null;
  };
  return models.flatMap((model): MissingModel[] => {
    const files = listOf(model.directory);
    if (files === null) return [];
    const selected = normalizeModelName(model.selected);
    if (files.includes(selected)) return [];
    const target = lastSegment(selected);
    const elsewhere = files.find((file) => lastSegment(file) === target) ?? null;
    return [{ ...model, elsewhere }];
  });
}
