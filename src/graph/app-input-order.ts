import { appInputEntries, isSameEntry, writeAppInputs, type AppInputRef } from '@/graph/app-inputs';
import type { NodeRow, NodeView } from '@/graph/rows';
import type { NodeId, Workflow } from '@/graph/types';

export function appInputOrder(workflow: Workflow): AppInputRef[] {
  const refs: AppInputRef[] = [];
  for (const entry of appInputEntries(workflow)) {
    const nodeId = Number(entry[0]);
    if (!Number.isFinite(nodeId) || typeof entry[1] !== 'string') continue;

    refs.push({ nodeId, widgetName: entry[1] });
  }
  return refs;
}

interface AppInputDrop {
  readonly index: number;
  readonly scope: 'row' | 'group';
  readonly side: 'before' | 'after';
}

export function appInputDrop(nodeIds: readonly number[], from: number, to: number): AppInputDrop {
  const side = to > from ? 'after' : 'before';
  let start = to;
  while (start > 0 && nodeIds[start - 1] === nodeIds[to]) start -= 1;
  let end = to;
  while (end < nodeIds.length - 1 && nodeIds[end + 1] === nodeIds[to]) end += 1;

  if (from >= start && from <= end) return { index: to, scope: 'row', side };
  return { index: side === 'after' ? end : start, scope: 'group', side };
}

export function moveAppInput(workflow: Workflow, from: AppInputRef, to: AppInputRef): Workflow {
  const current = appInputEntries(workflow);
  const fromIndex = current.findIndex((entry) => isSameEntry(entry, from.nodeId, from.widgetName));
  const toIndex = current.findIndex((entry) => isSameEntry(entry, to.nodeId, to.widgetName));
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return workflow;

  const nodeIds = current.map((entry) => Number(entry[0]));
  return writeAppInputs(workflow, droppedOrder(current, nodeIds, fromIndex, toIndex));
}

function droppedOrder<T>(
  items: readonly T[],
  nodeIds: readonly number[],
  from: number,
  to: number,
): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined || from === to) return [...items];
  next.splice(appInputDrop(nodeIds, from, to).index, 0, moved);
  return next;
}

export interface AppInputGroup {
  readonly key: string;
  readonly nodeId: NodeId;
  readonly index: string | null;
  readonly label: string;
  readonly comment: string;
  readonly rows: readonly NodeRow[];
}

export function appInputGroups(
  views: readonly NodeView[],
  order: readonly AppInputRef[],
): AppInputGroup[] {
  const viewById = new Map(views.map((view) => [view.id, view]));
  const groups: AppInputGroup[] = [];

  for (const ref of order) {
    const view = viewById.get(ref.nodeId);
    const row = view?.rows.find((candidate) => candidate.widgetName === ref.widgetName);
    if (!view || !row) continue;

    const last = groups.at(-1);
    if (last && last.nodeId === view.id) {
      groups[groups.length - 1] = { ...last, rows: [...last.rows, row] };
      continue;
    }

    groups.push({
      key: groupKeyFor(groups, view.id),
      nodeId: view.id,
      index: view.index,
      label: view.comment.length > 0 ? view.comment : view.displayName,
      comment: view.comment,
      rows: [row],
    });
  }
  return groups;
}

function groupKeyFor(groups: readonly AppInputGroup[], nodeId: NodeId): string {
  const seen = groups.filter((group) => group.nodeId === nodeId).length;
  return `${nodeId}:${String(seen)}`;
}

export function droppedGroups(
  groups: readonly AppInputGroup[],
  from: AppInputRef,
  to: AppInputRef,
): readonly AppInputGroup[] {
  const items = groups.flatMap((group) => group.rows.map((row) => ({ group, row })));
  const find = (ref: AppInputRef): number =>
    items.findIndex(
      ({ group, row }) => group.nodeId === ref.nodeId && row.widgetName === ref.widgetName,
    );
  const fromIndex = find(from);
  const toIndex = find(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return groups;

  const nodeIds = items.map(({ group }) => group.nodeId);
  const next: AppInputGroup[] = [];
  for (const { group, row } of droppedOrder(items, nodeIds, fromIndex, toIndex)) {
    const last = next.at(-1);
    if (last?.nodeId === group.nodeId) {
      next[next.length - 1] = { ...last, rows: [...last.rows, row] };
      continue;
    }
    next.push({ ...group, key: groupKeyFor(next, group.nodeId), rows: [row] });
  }
  return next;
}

export function appInputDragId({ nodeId, widgetName }: AppInputRef): string {
  return `app:${nodeId}:${widgetName}`;
}

export function parseAppInputDragId(id: unknown): AppInputRef | null {
  if (typeof id !== 'string' || !id.startsWith('app:')) return null;

  const rest = id.slice('app:'.length);
  const separator = rest.indexOf(':');
  if (separator < 0) return null;

  const nodeId = Number(rest.slice(0, separator));
  const widgetName = rest.slice(separator + 1);
  if (!Number.isFinite(nodeId) || widgetName.length === 0) return null;

  return { nodeId, widgetName };
}
