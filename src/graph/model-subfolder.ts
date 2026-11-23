import { normalizeModelName } from '@/graph/model-files';
import type { NodeRow, NodeView } from '@/graph/rows';

export interface SubfolderFix {
  readonly viewId: number;
  readonly row: NodeRow;
  readonly from: string;
  readonly to: string;
}

export function subfolderFixesOf(views: readonly NodeView[]): SubfolderFix[] {
  return views.flatMap((view) =>
    view.rows.flatMap((row): SubfolderFix[] => {
      const to = subfolderTargetOf(row);
      return to === null || typeof row.value !== 'string'
        ? []
        : [{ viewId: view.id, row, from: row.value, to }];
    }),
  );
}

function subfolderTargetOf(row: NodeRow): string | null {
  if (row.type !== 'COMBO' || row.options === null || row.target === null) return null;
  if (typeof row.value !== 'string' || row.value.length === 0) return null;
  const value = normalizeModelName(row.value);
  if (value.includes('/')) return null;
  const options = row.options.filter((option): option is string => typeof option === 'string');
  if (options.some((option) => normalizeModelName(option) === value)) return null;
  const candidates = options.filter((option) => lastSegment(option) === value);
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

function lastSegment(name: string): string {
  const normalized = normalizeModelName(name);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}
